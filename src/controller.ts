/**
 * Page orchestration for GitPreview.
 *
 * `content.ts` registers the preview handlers, then calls `start()` here.
 * This module owns page observation, button injection, and preview lifecycle.
 */

import { getFileExtension } from './utils';
import { getActiveSite } from './sites/index';
import { debug, error } from './lib/logger';
import { debounce } from './lib/debounce';
import {
  createPreviewButton,
  updatePreviewButtonState,
  removeExistingPlayer,
  removeExistingModal,
  showLoading,
  showLoadingModal,
  getCurrentPreviewContent,
  insertBlobPageButton,
} from './preview/ui';
import { getHandler, isSupported, closeAllHandlers } from './preview/registry';
import { togglePlay, rewind, forward, setVolume, getVolume } from './preview/audio/index';
import { bindKeyboardShortcuts } from './preview/keyboard';

let settings = { keyboardShortcuts: true };

let isInitialized = false;
let currentPreviewBlobPath: string | null = null;
let urlChangeTimer: ReturnType<typeof setTimeout> | null = null;
let unbindKeyboardShortcuts: (() => void) | null = null;

function init(): void {
  if (isInitialized) return;
  if (!getActiveSite()) {
    debug('init — unsupported site, skipping');
    return;
  }
  isInitialized = true;
  debug('init — start');

  loadSettings()
    .then(() => {
      observePageChanges();
      addPreviewButtons();
      handleBlobPage();
      unbindKeyboardShortcuts = bindKeyboardShortcuts(settings, closeAll, {
        togglePlay,
        rewind,
        forward,
        setVolume,
        getVolume,
      });
      debug('init — ready');
    })
    .catch((err) => {
      error('Initialization error:', err);
    });
}

function loadSettings(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      chrome.storage.sync.get({ keyboardShortcuts: true }, (result) => {
        settings = result as typeof settings;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

// ── Page observation ────────────────────────────────────────

function observePageChanges(): void {
  const scheduleAddButtons = debounce(addPreviewButtons, 200);
  const scheduleBlobButton = debounce(handleBlobPage, 200);
  const observer = new MutationObserver(() => {
    scheduleAddButtons();
    scheduleBlobButton();
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
  if (urlChangeTimer) clearTimeout(urlChangeTimer);

  const site = getActiveSite();
  const newBlobPath = site ? site.getBlobPath(location.href) : null;
  if (currentPreviewBlobPath && newBlobPath === currentPreviewBlobPath) {
    debug('onUrlChanged — same blob file, skipping cleanup:', newBlobPath);
    return;
  }

  urlChangeTimer = setTimeout(() => {
    urlChangeTimer = null;
    debug('onUrlChanged — executing cleanup, new url:', location.href);
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
  const site = getActiveSite();
  if (!site?.isBlobPage(location.href)) return;
  let retries = maxRetries;

  function tryHandle(): void {
    if (!site?.isBlobPage(location.href)) return;
    if (document.querySelector('.gitpreview-blob-preview-btn')) return;

    handleBlobPage();

    if (!document.querySelector('.gitpreview-blob-preview-btn') && retries > 0) {
      retries--;
      debug('retryBlobPage — retries left:', retries);
      setTimeout(tryHandle, interval);
    }
  }

  tryHandle();
}

// ── Tree page: icon buttons next to file links ──────────────

function addPreviewButtons(): void {
  const site = getActiveSite();
  if (!site) return;

  const fileLinks = document.querySelectorAll<HTMLAnchorElement>(site.fileLinkSelector);

  fileLinks.forEach((link) => {
    if (link.classList.contains('gitpreview-link-processed')) return;
    if (!site.isFileLink(link)) return;

    const href = link.getAttribute('href');
    if (!href) return;

    const extension = getFileExtension(href);
    if (!isSupported(extension)) return;

    link.classList.add('gitpreview-link-processed');
    debug('addPreviewButtons — adding button for:', href);

    const btn = createPreviewButton(href, site.getLinkFilename(link), true, openPreview);
    site.mountTreeButton(link, btn);
  });
}

// ── Blob page: preview button + auto-open ───────────────────

function handleBlobPage(): void {
  if (document.querySelector('.gitpreview-blob-preview-btn')) {
    debug('handleBlobPage — button already exists, skip');
    return;
  }

  const site = getActiveSite();
  if (!site) return;

  const url = location.href;
  if (!site.isBlobPage(url)) return;

  const extension = getFileExtension(url);
  const handler = getHandler(extension);
  if (!handler) {
    debug('handleBlobPage — no handler for:', extension);
    return;
  }

  const filename = decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? '');
  debug('handleBlobPage — setting up for:', filename);

  const btn = createPreviewButton(url, filename, false, openPreview);
  btn.classList.add('gitpreview-blob-preview-btn');

  // Auto-open: set button to "Hide" state BEFORE first paint to avoid flicker
  if (!handler.opensInNewTab) {
    updatePreviewButtonState(btn, true);
  }

  if (!insertBlobPageButton(btn, site)) {
    debug('handleBlobPage — FAILED to find any insertion target, no button');
    return;
  }

  // Auto-open preview on blob page load (skip new-tab handlers like PDF)
  if (!handler.opensInNewTab) {
    openPreview(url, filename);
  }
}

// ── Preview orchestration ───────────────────────────────────

function openPreview(fileUrl: string, filename: string): void {
  const site = getActiveSite();
  if (!site) return;

  const rawUrl = site.toRawUrl(fileUrl);
  if (!rawUrl) {
    debug('openPreview — cannot resolve raw url for:', fileUrl);
    return;
  }

  const ext = getFileExtension(fileUrl);
  const handler = getHandler(ext);
  if (!handler) return;

  debug('openPreview —', filename, 'handler:', ext);

  // Track current preview to protect against SPA URL blips
  const blobPath = site.getBlobPath(fileUrl);
  if (blobPath) currentPreviewBlobPath = blobPath;

  // New-tab handlers (PDF) manage themselves
  if (handler.opensInNewTab) {
    handler.openPreview(rawUrl, filename);
    return;
  }

  // Container-based handlers (audio, video, etc.)
  if (site.isTreePage(location.href)) {
    showLoadingModal(filename, closeAll);
  } else {
    if (document.getElementById('gitpreview-inline')) {
      debug('openPreview — toggling off, already open');
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
  debug('closeAll — closing previews');
  if (unbindKeyboardShortcuts) {
    unbindKeyboardShortcuts();
    unbindKeyboardShortcuts = null;
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

  currentPreviewBlobPath = null;
  debug('closeAll — done');
}

// ── Boot ────────────────────────────────────────────────────

function scheduleInit(): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500));
  } else {
    setTimeout(init, 500);
  }
}

export function start(): void {
  scheduleInit();
  window.addEventListener('load', () => {
    if (!isInitialized) init();
  });
}
