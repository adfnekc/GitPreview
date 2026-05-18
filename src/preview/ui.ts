import { escapeHTML, isBlobPage } from '../utils';

const OPEN_EYE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>';
const CLOSED_EYE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>';

// ── Preview button ──────────────────────────────────────────

export function createPreviewButton(
  fileUrl: string,
  filename: string,
  isIconOnly: boolean,
  onOpenPreview: (fileUrl: string, filename: string) => void,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'gitpreview-preview-btn gitpreview-btn-secondary';
  if (isIconOnly) btn.className += ' gitpreview-btn-icon';
  btn.type = 'button';
  btn.title = `Preview ${filename}`;

  btn.innerHTML = isIconOnly
    ? OPEN_EYE_SVG
    : OPEN_EYE_SVG + ' Preview';

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Optimistically toggle button state before onOpenPreview runs
    const wasOpen = isBlobPage(location.href)
      ? !!document.getElementById('gitpreview-inline')
      : !!document.getElementById('gitpreview-modal-overlay');
    updatePreviewButtonState(btn, !wasOpen);

    onOpenPreview(fileUrl, filename);
  });

  return btn;
}

export function updatePreviewButtonState(
  btn: HTMLElement,
  previewOpen: boolean,
): void {
  try {
    const svg = btn.querySelector('svg');
    if (previewOpen) {
      btn.title = 'Hide Preview';
      if (svg) svg.outerHTML = CLOSED_EYE_SVG;
      if (!btn.classList.contains('gitpreview-btn-icon')) {
        const newSvg = btn.querySelector('svg');
        if (newSvg?.nextSibling && newSvg.nextSibling.nodeType === Node.TEXT_NODE) {
          newSvg.nextSibling.textContent = ' Hide';
        }
      }
    } else {
      btn.title = 'Preview';
      if (svg) svg.outerHTML = OPEN_EYE_SVG;
      if (!btn.classList.contains('gitpreview-btn-icon')) {
        const newSvg = btn.querySelector('svg');
        if (newSvg?.nextSibling && newSvg.nextSibling.nodeType === Node.TEXT_NODE) {
          newSvg.nextSibling.textContent = ' Preview';
        }
      }
    }
  } catch (err) {
    console.error('GitPreview: Error updating button state:', err);
  }
}

// ── Containers ──────────────────────────────────────────────

export function createInlineContainer(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'gitpreview-inline-container';
  container.id = 'gitpreview-inline';

  const content = document.createElement('div');
  content.className = 'gitpreview-inline-content';
  content.id = 'gitpreview-inline-content';
  container.appendChild(content);

  return container;
}

export function insertInlineContainer(container: HTMLElement): void {
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
      target.style.display = 'none';
      return;
    }
  }

  console.log('[GitPreview] insertInlineContainer — no blob target, trying tree targets');

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

  console.log('[GitPreview] insertInlineContainer — no tree target either, using body fallback');

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

export function createModalContainer(
  filename: string,
  onClose: () => void,
): HTMLElement {
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
    .addEventListener('click', onClose);

  const content = document.createElement('div');
  content.className = 'gitpreview-modal-content';
  content.id = 'gitpreview-modal-content';

  container.appendChild(header);
  container.appendChild(content);
  overlay.appendChild(container);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) onClose();
  });

  return overlay;
}

// ── Loading / error states ──────────────────────────────────

const ERROR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:48px;height:48px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>';

export function renderErrorContent(message: string): string {
  return `
    <div class="gitpreview-error">
      <div class="gitpreview-error-icon">${ERROR_SVG}</div>
      <h4 class="gitpreview-error-title">Failed to Load File</h4>
      <p class="gitpreview-error-message">${escapeHTML(message)}</p>
    </div>`;
}

export function showLoading(filename: string): void {
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

export function showLoadingModal(filename: string, onClose?: () => void): void {
  removeExistingModal();
  const overlay = createModalContainer(filename, () => {
    onClose?.();
  });
  const content =
    overlay.querySelector<HTMLElement>('#gitpreview-modal-content')!;
  content.innerHTML = `
    <div class="gitpreview-loading">
      <div class="gitpreview-spinner"></div>
      <div class="gitpreview-loading-text">Loading ${escapeHTML(filename)}...</div>
    </div>`;
  document.body.appendChild(overlay);
}

export function showError(filename: string, message: string): void {
  removeExistingPlayer();
  const container = createInlineContainer();
  const content =
    container.querySelector<HTMLElement>('#gitpreview-inline-content')!;
  content.innerHTML = renderErrorContent(message);
  insertInlineContainer(container);
}

export function showErrorModal(filename: string, message: string, onClose?: () => void): void {
  removeExistingModal();
  const overlay = createModalContainer(filename, () => {
    onClose?.();
  });
  const content =
    overlay.querySelector<HTMLElement>('#gitpreview-modal-content')!;
  content.innerHTML = renderErrorContent(message);
  document.body.appendChild(overlay);
}

export function removeExistingPlayer(): void {
  document.getElementById('gitpreview-inline')?.remove();
}

export function removeExistingModal(): void {
  document.getElementById('gitpreview-modal-overlay')?.remove();
}

export function getCurrentPreviewContent(): HTMLElement | null {
  return (
    document.getElementById('gitpreview-modal-content') ||
    document.getElementById('gitpreview-inline-content')
  );
}
