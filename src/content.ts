/**
 * GitPreview content script.
 *
 * To add a new preview type:
 * 1. Create `src/preview/<type>/index.ts` exporting a PreviewHandler
 * 2. Import it here and call `registerHandler(yourHandler)`
 *
 * That's it. The handler's lifecycle methods (openPreview, close)
 * are managed automatically by the registry.
 */

import { isBlobPage, getFileExtension } from './utils';
import { audioHandler } from './preview/audio/index';
import { pdfHandler } from './preview/pdf/index';
import { videoHandler } from './preview/video/index';
import { fontHandler } from './preview/font/index';
import { wordHandler } from './preview/word/index';
import { excelHandler } from './preview/excel/index';
import { powerPointHandler } from './preview/powerpoint/index';
import { registerHandler, getHandler, isSupported, closeAllHandlers } from './preview/registry';
import type { PreviewHandler } from './preview/handler';
import {
  createPreviewButton,
  updatePreviewButtonState,
  removeExistingPlayer,
  removeExistingModal,
  showLoading,
  showLoadingModal,
  getCurrentPreviewContent,
} from './preview/ui';
import { togglePlay, rewind, forward, setVolume, getVolume } from './preview/audio/index';
import { bindKeyboardShortcuts } from './preview/keyboard';
import { convertToRawUrl, isTreePage } from './utils';
import './preview/preview.css';

// ── Register preview handlers ───────────────────────────────
// Each handler is a self-contained module that knows which
// file types it supports and how to render/cleanup previews.
registerHandler(audioHandler);
registerHandler(pdfHandler);
registerHandler(videoHandler);
registerHandler(fontHandler);
registerHandler(wordHandler);
registerHandler(excelHandler);
registerHandler(powerPointHandler);

let settings = {
  autoPreview: true,
  previewMode: 'modal' as 'modal' | 'inline',
  keyboardShortcuts: true,
};

let isInitialized = false;
let _currentPreviewBlobPath: string | null = null;
let _urlChangeTimer: ReturnType<typeof setTimeout> | null = null;
let _unbindKeyboardShortcuts: (() => void) | null = null;

function getBlobFilePath(url: string): string | null {
  const m = url.match(/\/blob\/(.+?)(?:\?|#|$)/);
  return m ? m[1] : null;
}

function log(...args: unknown[]): void {
  console.log('[GitPreview]', ...args);
}

function init(): void {
  if (isInitialized) return;
  isInitialized = true;
  log('init — start');

  loadSettings()
    .then(() => {
      observePageChanges();
      addPreviewButtons();
      handleBlobPage();
      _unbindKeyboardShortcuts = bindKeyboardShortcuts(settings, closeAll, {
        togglePlay,
        rewind,
        forward,
        setVolume,
        getVolume,
      });
      log('init — ready');
    })
    .catch((err) => {
      console.error('GitPreview: Initialization error:', err);
    });
}

function loadSettings(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      chrome.storage.sync.get(
        { autoPreview: true, previewMode: 'modal', keyboardShortcuts: true },
        (result) => {
          settings = result as typeof settings;
          resolve();
        },
      );
    } else {
      resolve();
    }
  });
}

// ── Page observation ────────────────────────────────────────

function observePageChanges(): void {
  const observer = new MutationObserver(() => {
    debounce(addPreviewButtons, 200)();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // SPA navigation detection: popstate (back/forward) + rAF polling (pushState)
  let lastUrl = location.href;
  window.addEventListener('popstate', onNav);

  function onNav(): void {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      onUrlChanged();
    }
  }

  // requestAnimationFrame detects URL changes before next paint (~16ms)
  // vs. setInterval at 1000ms where new content renders before we clean up
  function pollUrl(): void {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      onUrlChanged();
    }
    requestAnimationFrame(pollUrl);
  }
  requestAnimationFrame(pollUrl);
}

function onUrlChanged(): void {
  if (_urlChangeTimer) clearTimeout(_urlChangeTimer);

  const newBlobPath = getBlobFilePath(location.href);
  if (_currentPreviewBlobPath && newBlobPath === _currentPreviewBlobPath) {
    log('onUrlChanged — same blob file, skipping cleanup:', newBlobPath);
    return;
  }

  _urlChangeTimer = setTimeout(() => {
    _urlChangeTimer = null;
    log('onUrlChanged — executing cleanup, new url:', location.href);
    closeAll();
    document.querySelectorAll('.gitpreview-link-processed').forEach((el) => {
      el.classList.remove('gitpreview-link-processed');
    });
    document.querySelectorAll('.gitpreview-blob-target').forEach((el) => {
      el.classList.remove('gitpreview-blob-target');
      (el as HTMLElement).style.display = '';
    });
    document.querySelectorAll('.gitpreview-preview-btn').forEach((el) => {
      el.remove();
    });
    document.querySelectorAll('.gitpreview-blob-preview-btn').forEach((el) => {
      el.remove();
    });

    addPreviewButtons();
    retryBlobPage();
  }, 300);
}

function retryBlobPage(maxRetries = 8, interval = 400): void {
  if (!isBlobPage(location.href)) return;
  let retries = maxRetries;

  function tryHandle(): void {
    if (!isBlobPage(location.href)) return;
    if (document.querySelector('.gitpreview-blob-preview-btn')) return;

    handleBlobPage();

    if (!document.querySelector('.gitpreview-blob-preview-btn') && retries > 0) {
      retries--;
      log('retryBlobPage — retries left:', retries);
      setTimeout(tryHandle, interval);
    }
  }

  tryHandle();
}

function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => func(...args), wait);
  };
}

// ── Tree page: icon buttons next to file links ──────────────

function addPreviewButtons(): void {
  const blobLinks = document.querySelectorAll<HTMLAnchorElement>('a[href*="/blob/"]');

  blobLinks.forEach((link) => {
    if (link.classList.contains('gitpreview-link-processed')) return;

    const href = link.getAttribute('href');
    if (!href) return;

    const extension = getFileExtension(href);
    if (!isSupported(extension)) return;

    link.classList.add('gitpreview-link-processed');
    log('addPreviewButtons — adding button for:', href);

    const btn = createPreviewButton(
      href,
      link.textContent?.trim() || href.split('/').pop() || '',
      true,
      openPreview,
    );

    const truncateContainer = link.closest('.react-directory-truncate');
    if (truncateContainer) {
      truncateContainer.appendChild(btn);
    } else {
      link.after(btn);
    }
  });
}

// ── Blob page: preview button + auto-open ───────────────────

function handleBlobPage(): void {
  if (document.querySelector('.gitpreview-blob-preview-btn')) {
    log('handleBlobPage — button already exists, skip');
    return;
  }

  const url = location.href;
  if (!isBlobPage(url)) return;

  const extension = getFileExtension(url);
  const handler = getHandler(extension);
  if (!handler) {
    log('handleBlobPage — no handler for:', extension);
    return;
  }

  const filename = decodeURIComponent(url.split('/').pop()!.split('?')[0]);
  log('handleBlobPage — setting up for:', filename);

  const btn = createPreviewButton(url, filename, false, openPreview);
  btn.classList.add('gitpreview-blob-preview-btn');

  // Auto-open: set button to "Hide" state BEFORE first paint to avoid flicker
  if (!handler.opensInNewTab) {
    updatePreviewButtonState(btn, true);
  }

  if (!insertBlobPageButton(btn, handler)) {
    log('handleBlobPage — FAILED to find any insertion target, no button');
    return;
  }

  // Auto-open preview on blob page load (skip new-tab handlers like PDF)
  if (!handler.opensInNewTab) {
    openPreview(url, filename);
  }
}

function insertBlobPageButton(btn: HTMLElement, handler: PreviewHandler): boolean {
  // Position button before the element the handler specifies
  const target = document.querySelector<HTMLAnchorElement>(handler.getBlobButtonSelector());
  if (target?.parentElement) {
    target.parentElement.insertBefore(btn, target);
    log('insertBlobPageButton — inserted before target selector');
    return true;
  }

  const fallbackSelectors = [
    '[class*="BlobViewHeader-module"]',
    '[class*="react-blob-header-actions"]',
    '[class*="react-blob-header-edit-and-raw-actions"]',
    '.file-actions',
    '[data-testid="file-header"]',
    '.react-blob-header',
    '.Box-header .d-flex',
    '.Box-header',
  ];

  for (const selector of fallbackSelectors) {
    const el = document.querySelector(selector);
    if (el) {
      el.appendChild(btn);
      log('insertBlobPageButton — inserted via fallback:', selector);
      return true;
    }
  }

  const blobHeader = document.querySelector<HTMLElement>(
    '[class*="blob-header"], [class*="file-header"], [class*="BlobViewHeader"]',
  );
  if (blobHeader) {
    blobHeader.appendChild(btn);
    log('insertBlobPageButton — inserted via last-resort blobHeader');
    return true;
  }

  return false;
}

// ── Preview orchestration ───────────────────────────────────

function openPreview(fileUrl: string, filename: string): void {
  const rawUrl = convertToRawUrl(fileUrl);
  const ext = getFileExtension(fileUrl);
  const handler = getHandler(ext);
  if (!handler) return;

  log('openPreview —', filename, 'handler:', ext);

  // Track current preview to protect against SPA URL blips
  const blobPath = getBlobFilePath(fileUrl);
  if (blobPath) _currentPreviewBlobPath = blobPath;

  // New-tab handlers (PDF) manage themselves
  if (handler.opensInNewTab) {
    handler.openPreview(rawUrl, filename);
    return;
  }

  // Container-based handlers (audio, video, etc.)
  if (isTreePage(location.href)) {
    showLoadingModal(filename, closeAll);
  } else {
    if (document.getElementById('gitpreview-inline')) {
      log('openPreview — toggling off, already open');
      closeAll();
      return;
    }
    showLoading(filename);
  }

  const container = getCurrentPreviewContent();
  if (container) {
    handler.openPreview(rawUrl, filename, container);
  }
}

function closeAll(): void {
  log('closeAll — closing previews');
  if (_unbindKeyboardShortcuts) {
    _unbindKeyboardShortcuts();
    _unbindKeyboardShortcuts = null;
  }

  // Close all registered handlers (calls each handler's close() method)
  closeAllHandlers();

  removeExistingPlayer();
  removeExistingModal();

  // Restore hidden blob targets so SPA navigation content is visible
  document.querySelectorAll('.gitpreview-blob-target').forEach((el) => {
    (el as HTMLElement).style.display = '';
  });

  document.querySelectorAll('.gitpreview-preview-btn').forEach((btn) => {
    updatePreviewButtonState(btn as HTMLElement, false);
  });

  _currentPreviewBlobPath = null;
  log('closeAll — done');
}

// ── Boot ────────────────────────────────────────────────────

function safeInit(): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500));
  } else {
    setTimeout(init, 500);
  }
}

safeInit();

window.addEventListener('load', () => {
  if (!isInitialized) init();
});
