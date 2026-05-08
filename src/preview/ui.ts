import { escapeHTML, isBlobPage } from '../utils';

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
    ? `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg> Preview`;

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onOpenPreview(fileUrl, filename);

    setTimeout(() => {
      const isOpen = isBlobPage(location.href)
        ? !!document.getElementById('gitpreview-inline')
        : !!document.getElementById('gitpreview-modal-overlay');
      updatePreviewButtonState(btn, isOpen);
    }, 100);
  });

  return btn;
}

export function updatePreviewButtonState(
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

export function showLoadingModal(filename: string): void {
  removeExistingModal();
  const overlay = createModalContainer(filename, () => {
    /* no-op, caller handles closeAll */ });
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

export function showErrorModal(filename: string, message: string): void {
  removeExistingModal();
  const overlay = createModalContainer(filename, () => {
    /* no-op, caller handles closeAll */ });
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
