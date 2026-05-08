import {
  isSupportedExtension,
  escapeHTML,
  isBlobPage,
  isTreePage,
  convertToRawUrl,
} from './utils';
import {
  openAudioPreview as audioOpenAudioPreview,
  closeAudioPreview,
  togglePlay,
  rewind,
  forward,
  setVolume,
  getVolume,
} from './preview/audio-player';
import { openPdfPreview } from './preview/pdf-preview';
import './preview/preview.css';

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
      bindKeyboardShortcuts();
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

function observePageChanges(): void {
  const observer = new MutationObserver(() => {
    debounce(addPreviewButtons, 200)();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  let lastUrl = location.href;
  setInterval(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      document.querySelectorAll('.gitpreview-link-processed').forEach((el) => {
        el.classList.remove('gitpreview-link-processed');
      });
      document.querySelectorAll('.gitpreview-preview-btn').forEach((el) => {
        el.remove();
      });
      document.querySelectorAll('.gitpreview-blob-preview-btn').forEach((el) => {
        el.remove();
      });
      debounce(addPreviewButtons, 500)();
      debounce(handleBlobPage, 500)();
    }
  }, 1000);
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  return (...args: Parameters<T>) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => func(...args), wait);
  };
}

function addPreviewButtons(): void {
  const blobLinks = document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/blob/"]',
  );

  blobLinks.forEach((link) => {
    if (link.classList.contains('gitpreview-link-processed')) return;

    const href = link.getAttribute('href');
    if (!href) return;

    const extension = getFileExtension(href);
    if (!isSupportedExtension(extension)) return;

    link.classList.add('gitpreview-link-processed');

    const btn = createPreviewButton(
      href,
      link.textContent?.trim() || href.split('/').pop() || '',
      true,
    );

    const truncateContainer = link.closest('.react-directory-truncate');
    if (truncateContainer) {
      truncateContainer.appendChild(btn);
    } else {
      link.after(btn);
    }
  });
}

function getFileExtension(path: string): string {
  const filename = path.split('/').pop()!.split('?')[0];
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot + 1).toLowerCase();
}

function handleBlobPage(): void {
  if (document.querySelector('.gitpreview-blob-preview-btn')) return;

  const url = location.href;
  if (!isBlobPage(url)) return;

  const extension = getFileExtension(url);
  if (!isSupportedExtension(extension)) return;

  const filename = decodeURIComponent(url.split('/').pop()!.split('?')[0]);

  const btn = createPreviewButton(url, filename);
  btn.classList.add('gitpreview-blob-preview-btn');

  const stickyHeader = document.querySelector<HTMLElement>('.react-blob-sticky-header');
  if (stickyHeader) {
    const rawBtn = stickyHeader.querySelector<HTMLAnchorElement>(
      'a[data-testid="raw-button"], a[href*="/raw/"], a#raw-url, [data-testid*="download"]',
    );
    if (rawBtn) {
      const btnGroup = rawBtn.closest('.BtnGroup, [class*="BtnGroup"]');
      if (btnGroup && btnGroup.parentElement) {
        // rawBtn is wrapped in BtnGroup — insert before the wrapper
        btnGroup.parentElement.insertBefore(btn, btnGroup);
      } else if (rawBtn.parentElement) {
        // rawBtn is directly in the flex container — insert before it
        rawBtn.parentElement.insertBefore(btn, rawBtn);
      }
    } else {
      const actions = stickyHeader.querySelector<HTMLElement>('[class*="actions"]');
      if (actions) {
        actions.appendChild(btn);
      } else {
        stickyHeader.appendChild(btn);
      }
    }
  } else {
    const rawBtn = document.querySelector<HTMLAnchorElement>(
      'a[data-testid="raw-button"], a[href*="/raw/"], a#raw-url',
    );
    if (rawBtn) {
      const btnGroup = rawBtn.closest('.BtnGroup, [class*="BtnGroup"]');
      if (btnGroup && btnGroup.parentElement) {
        btnGroup.parentElement.insertBefore(btn, btnGroup);
      } else if (rawBtn.parentElement) {
        rawBtn.parentElement.insertBefore(btn, rawBtn);
      }
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
        const target = document.querySelector(selector);
        if (target) {
          target.appendChild(btn);
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
  }

  if (extension !== 'pdf') {
    openPreview(url, filename);

    setTimeout(() => {
      updatePreviewButtonState(btn, true);
    }, 100);
  }
}

function updatePreviewButtonState(
  btn: HTMLElement,
  previewOpen: boolean,
): void {
  try {
    if (previewOpen) {
      btn.title = 'Hide Preview';
      if (!btn.classList.contains('gitpreview-btn-icon')) {
        const svg = btn.querySelector('svg');
        if (svg?.nextSibling && svg.nextSibling.nodeType === Node.TEXT_NODE) {
          svg.nextSibling.textContent = ' Hide';
        }
      }
    } else {
      btn.title = 'Preview';
      if (!btn.classList.contains('gitpreview-btn-icon')) {
        const svg = btn.querySelector('svg');
        if (svg?.nextSibling && svg.nextSibling.nodeType === Node.TEXT_NODE) {
          svg.nextSibling.textContent = ' Preview';
        }
      }
    }
  } catch (err) {
    console.error('GitPreview: Error updating button state:', err);
  }
}

function createPreviewButton(
  fileUrl: string,
  filename: string,
  isIconOnly = false,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'gitpreview-preview-btn gitpreview-btn-secondary';
  if (isIconOnly) btn.className += ' gitpreview-btn-icon';
  btn.type = 'button';
  btn.title = `Preview ${filename}`;

  btn.innerHTML = isIconOnly
    ? `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg> Preview`;

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openPreview(fileUrl, filename);

    setTimeout(() => {
      const isOpen = isBlobPage(location.href)
        ? !!document.getElementById('gitpreview-inline')
        : !!document.getElementById('gitpreview-modal-overlay');
      updatePreviewButtonState(btn, isOpen);
    }, 100);
  });

  return btn;
}

function openPreview(fileUrl: string, filename: string): void {
  const rawUrl = convertToRawUrl(fileUrl);
  const ext = getFileExtension(fileUrl);

  // PDF opens in a new tab using the browser's native PDF viewer
  if (ext === 'pdf') {
    openPdfPreview(rawUrl, filename);
    return;
  }

  if (isTreePage(location.href)) {
    showLoadingModal(filename);
  } else {
    if (document.getElementById('gitpreview-inline')) {
      closeAll();
      return;
    }
    showLoading(filename);
  }

  openPreviewInContainer(rawUrl, filename, ext);
}

function openPreviewInContainer(rawUrl: string, filename: string, ext: string): void {
  let previewContent = getCurrentPreviewContent();

  if (!previewContent) {
    if (isTreePage(location.href)) {
      showLoadingModal(filename);
    } else {
      showLoading(filename);
    }
    previewContent = getCurrentPreviewContent();
  }

  if (!previewContent) {
    console.error('GitPreview: Could not create preview container');
    return;
  }

  const isAudio = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext);

  if (isAudio) {
    audioOpenAudioPreview(rawUrl, filename, previewContent).catch((err) => {
      console.error('GitPreview audio error:', err);
      if (isTreePage(location.href)) {
        showErrorModal(filename, (err as Error).message || 'Failed to load audio');
      } else {
        showError(filename, (err as Error).message || 'Failed to load audio');
      }
    });
  }
}

function closeAll(): void {
  closeAudioPreview();
  removeExistingPlayer();
  removeExistingModal();

  document.querySelectorAll('.gitpreview-preview-btn').forEach((btn) => {
    updatePreviewButtonState(btn as HTMLElement, false);
  });
}

function bindKeyboardShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    if (!settings.keyboardShortcuts) return;

    const isPreviewOpen =
      !!document.getElementById('gitpreview-inline') ||
      !!document.getElementById('gitpreview-modal-overlay');

    if (e.key === 'Escape' && isPreviewOpen) {
      e.preventDefault();
      closeAll();
    }

    if (isPreviewOpen) {
      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          rewind(10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          forward(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume(Math.min(100, getVolume() + 10));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume(Math.max(0, getVolume() - 10));
          break;
      }
    }
  });
}

function createModalContainer(filename: string): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'gitpreview-modal-overlay';
  overlay.id = 'gitpreview-modal-overlay';

  const container = document.createElement('div');
  container.className = 'gitpreview-modal-container';

  const header = document.createElement('div');
  header.className = 'gitpreview-modal-header';
  header.innerHTML = `
    <div class="gitpreview-modal-title">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;margin-right:6px;">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
      ${escapeHTML(filename)}
    </div>
    <button class="gitpreview-modal-close" title="Close">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>`;

  header
    .querySelector('.gitpreview-modal-close')!
    .addEventListener('click', closeAll);

  const content = document.createElement('div');
  content.className = 'gitpreview-modal-content';
  content.id = 'gitpreview-modal-content';

  container.appendChild(header);
  container.appendChild(content);
  overlay.appendChild(container);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeAll();
  });

  return overlay;
}

function showLoadingModal(filename: string): void {
  removeExistingModal();
  const overlay = createModalContainer(filename);
  const content =
    overlay.querySelector<HTMLElement>('#gitpreview-modal-content')!;
  content.innerHTML = `
    <div class="gitpreview-loading">
      <div class="gitpreview-spinner"></div>
      <div class="gitpreview-loading-text">Loading ${escapeHTML(filename)}...</div>
    </div>`;
  document.body.appendChild(overlay);
}

function showLoading(filename: string): void {
  removeExistingPlayer();
  const container = createInlineContainer();
  const content =
    container.querySelector<HTMLElement>('#gitpreview-inline-content')!;
  content.innerHTML = `
    <div class="gitpreview-loading">
      <div class="gitpreview-spinner"></div>
      <div class="gitpreview-loading-text">Loading ${escapeHTML(filename)}...</div>
    </div>`;
  insertInlineContainer(container);
}

function showError(filename: string, message: string): void {
  removeExistingPlayer();
  const container = createInlineContainer();
  const content =
    container.querySelector<HTMLElement>('#gitpreview-inline-content')!;
  content.innerHTML = `
    <div class="gitpreview-error">
      <div class="gitpreview-error-icon">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:48px;height:48px;">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h4 class="gitpreview-error-title">Failed to Load File</h4>
      <p class="gitpreview-error-message">${escapeHTML(message)}</p>
    </div>`;
  insertInlineContainer(container);
}

function showErrorModal(filename: string, message: string): void {
  removeExistingModal();
  const overlay = createModalContainer(filename);
  const content =
    overlay.querySelector<HTMLElement>('#gitpreview-modal-content')!;
  content.innerHTML = `
    <div class="gitpreview-error">
      <div class="gitpreview-error-icon">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:48px;height:48px;">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h4 class="gitpreview-error-title">Failed to Load File</h4>
      <p class="gitpreview-error-message">${escapeHTML(message)}</p>
    </div>`;
  document.body.appendChild(overlay);
}

function createInlineContainer(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'gitpreview-inline-container';
  container.id = 'gitpreview-inline';

  const content = document.createElement('div');
  content.className = 'gitpreview-inline-content';
  content.id = 'gitpreview-inline-content';
  container.appendChild(content);

  return container;
}

function insertInlineContainer(container: HTMLElement): void {
  const blobTargets = [
    '[class*="BlobViewContent-module__blobContentWrapper"]',
    '[class*="BlobContent-module__blobContentSection"]',
    '[data-testid="blob-content"]',
    '.blob-wrapper',
    '.Box-body',
    '.react-code-view',
    '[data-testid="file-content"]',
  ];

  for (const selector of blobTargets) {
    const target = document.querySelector<HTMLElement>(selector);
    if (target?.parentElement) {
      target.parentElement.insertBefore(container, target);
      target.classList.add('gitpreview-blob-target');
      return;
    }
  }

  const treeTargets = [
    '[class*="react-directory"]',
    '[data-testid="list-view"]',
    '.js-navigation-container',
    '[role="table"]',
    '[role="grid"]',
    'table.files',
    '.Box',
  ];

  for (const selector of treeTargets) {
    const target = document.querySelector<HTMLElement>(selector);
    if (target?.parentElement) {
      target.parentElement.insertBefore(container, target.nextSibling);
      return;
    }
  }

  const repoContent =
    document.querySelector('.repository-content') ||
    document.querySelector('[data-testid="repo-content"]') ||
    document.querySelector('[id="repo-content-pjax-container"]') ||
    document.querySelector('[class*="PageLayout-PageLayoutContent"]') ||
    document.querySelector('main') ||
    document.querySelector('#js-repo-pjax-container');

  if (repoContent) {
    repoContent.appendChild(container);
    return;
  }

  document.body.appendChild(container);
}

function removeExistingPlayer(): void {
  document.getElementById('gitpreview-inline')?.remove();
}

function removeExistingModal(): void {
  document.getElementById('gitpreview-modal-overlay')?.remove();
}

function getCurrentPreviewContent(): HTMLElement | null {
  return (
    document.getElementById('gitpreview-modal-content') ||
    document.getElementById('gitpreview-inline-content')
  );
}

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
