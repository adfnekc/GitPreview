import { isBlobPage, getFileExtension } from './utils';
import { audioHandler } from './preview/audio/index';
import { pdfHandler } from './preview/pdf/index';
import { videoHandler } from './preview/video/index';
import { fontHandler } from './preview/font/index';
import { wordHandler } from './preview/word/index';
import { registerHandler, getHandler, isSupported } from './preview/registry';
import {
  createPreviewButton,
  updatePreviewButtonState,
  removeExistingPlayer,
  removeExistingModal,
  showLoading,
  showLoadingModal,
  getCurrentPreviewContent,
} from './preview/ui';
import { closeAudioPreview } from './preview/audio/index';
import { closeVideoPreview } from './preview/video/index';
import { closeFontPreview } from './preview/font/index';
import { closeWordPreview } from './preview/word/index';
import {
  togglePlay,
  rewind,
  forward,
  setVolume,
  getVolume,
} from './preview/audio/index';
import { bindKeyboardShortcuts } from './preview/keyboard';
import { convertToRawUrl } from './utils';
import { isTreePage } from './utils';
import './preview/preview.css';

// Register all preview handlers
registerHandler(audioHandler);
registerHandler(pdfHandler);
registerHandler(videoHandler);
registerHandler(fontHandler);
registerHandler(wordHandler);

let settings = {
  autoPreview: true,
  previewMode: 'modal' as 'modal' | 'inline',
  keyboardShortcuts: true,
};

let isInitialized = false;

function init(): void {
  if (isInitialized) return;
  isInitialized = true;

  loadSettings()
    .then(() => {
      observePageChanges();
      addPreviewButtons();
      handleBlobPage();
      bindKeyboardShortcuts(settings, closeAll, {
        togglePlay,
        rewind,
        forward,
        setVolume,
        getVolume,
      });
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
  const blobLinks = document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/blob/"]',
  );

  blobLinks.forEach((link) => {
    if (link.classList.contains('gitpreview-link-processed')) return;

    const href = link.getAttribute('href');
    if (!href) return;

    const extension = getFileExtension(href);
    if (!isSupported(extension)) return;

    link.classList.add('gitpreview-link-processed');

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
  if (document.querySelector('.gitpreview-blob-preview-btn')) return;

  const url = location.href;
  if (!isBlobPage(url)) return;

  const extension = getFileExtension(url);
  const handler = getHandler(extension);
  if (!handler) return;

  const filename = decodeURIComponent(url.split('/').pop()!.split('?')[0]);

  const btn = createPreviewButton(url, filename, false, openPreview);
  btn.classList.add('gitpreview-blob-preview-btn');

  // Position button before the element the handler specifies
  const target = document.querySelector<HTMLAnchorElement>(
    handler.getBlobButtonSelector(),
  );
  if (target?.parentElement) {
    target.parentElement.insertBefore(btn, target);
  } else {
    const possibleTargets = [
      '[class*="BlobViewHeader-module"]',
      '[class*="react-blob-header-actions"]',
      '[class*="react-blob-header-edit-and-raw-actions"]',
      '.file-actions',
      '[data-testid="file-header"]',
      '.react-blob-header',
      '.Box-header .d-flex',
      '.Box-header',
    ];

    let inserted = false;
    for (const selector of possibleTargets) {
      const el = document.querySelector(selector);
      if (el) {
        el.appendChild(btn);
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      const blobHeader = document.querySelector<HTMLElement>(
        '[class*="blob-header"], [class*="file-header"], [class*="BlobViewHeader"]',
      );
      if (blobHeader) {
        blobHeader.appendChild(btn);
      } else {
        return;
      }
    }
  }

  // Auto-open preview on blob page load (skip new-tab handlers like PDF)
  if (!handler.opensInNewTab) {
    openPreview(url, filename);
    setTimeout(() => updatePreviewButtonState(btn, true), 100);
  }
}

// ── Preview orchestration ───────────────────────────────────

function openPreview(fileUrl: string, filename: string): void {
  const rawUrl = convertToRawUrl(fileUrl);
  const ext = getFileExtension(fileUrl);
  const handler = getHandler(ext);
  if (!handler) return;

  // New-tab handlers (PDF) manage themselves
  if (handler.opensInNewTab) {
    handler.openPreview(rawUrl, filename);
    return;
  }

  // Container-based handlers (audio, video)
  if (isTreePage(location.href)) {
    showLoadingModal(filename, closeAll);
  } else {
    if (document.getElementById('gitpreview-inline')) {
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
  closeAudioPreview();
  closeVideoPreview();
  closeFontPreview();
  closeWordPreview();
  removeExistingPlayer();
  removeExistingModal();

  // Restore hidden blob targets so SPA navigation content is visible
  document.querySelectorAll('.gitpreview-blob-target').forEach((el) => {
    (el as HTMLElement).style.display = '';
  });

  document.querySelectorAll('.gitpreview-preview-btn').forEach((btn) => {
    updatePreviewButtonState(btn as HTMLElement, false);
  });
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
