import { type PreviewHandler } from '../handler';
import { escapeHTML, formatFileSize } from '../../utils';
import { renderErrorContent } from '../ui';
import { init } from 'pptx-preview';

let currentPreviewer: any = null;

export async function openPowerPointPreview(
  url: string,
  filename: string,
  container: HTMLElement,
): Promise<void> {
  container.innerHTML = `
    <div class="gitpreview-loading">
      <div class="gitpreview-spinner"></div>
      <div class="gitpreview-loading-text">Loading ${escapeHTML(filename)}...</div>
    </div>`;

  try {
    const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'fetchBinary', url },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (response.success) {
            const binary = atob(response.data);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            resolve(bytes.buffer as ArrayBuffer);
          } else {
            reject(new Error(response.error || 'Failed to fetch presentation'));
          }
        },
      );
    });

    const ext = filename.split('.').pop()?.toLowerCase() || 'pptx';

    container.innerHTML = `
      <div class="gitpreview-ppt-preview">
        <div class="gitpreview-ppt-header">
          <svg class="gitpreview-ppt-header-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <div class="gitpreview-ppt-header-info">
            <div class="gitpreview-ppt-filename">${escapeHTML(filename)}</div>
            <div class="gitpreview-ppt-meta">${formatFileSize(arrayBuffer.byteLength)} · ${ext.toUpperCase()} presentation</div>
          </div>
        </div>
        <div class="gitpreview-ppt-slide-wrapper"></div>
      </div>`;

    const wrapper = container.querySelector<HTMLElement>('.gitpreview-ppt-slide-wrapper');
    if (!wrapper) return;

    const previewer = init(wrapper, {
      renderer: 'canvas',
      mode: 'slide',
    });

    currentPreviewer = previewer;
    await previewer.preview(arrayBuffer);

    // Update header with slide count
    const meta = container.querySelector('.gitpreview-ppt-meta');
    if (meta && previewer.slideCount) {
      meta.textContent = `${formatFileSize(arrayBuffer.byteLength)} · ${ext.toUpperCase()} presentation · ${previewer.slideCount} slide(s)`;
    }
  } catch (err) {
    console.error('GitPreview powerpoint error:', err);
    container.innerHTML = renderErrorContent(
      (err as Error).message || 'Failed to load presentation',
    );
  }
}

export function closePowerPointPreview(): void {
  if (currentPreviewer) {
    try {
      currentPreviewer.destroy();
    } catch {
      // ignore cleanup errors
    }
    currentPreviewer = null;
  }
}

export const powerPointHandler: PreviewHandler = {
  extensions: ['pptx', 'ppt'],
  getBlobButtonSelector() {
    return 'a[data-testid="raw-button"], a[href*="/raw/"], a#raw-url';
  },
  openPreview(rawUrl: string, filename: string, container?: HTMLElement) {
    if (!container) return;
    openPowerPointPreview(rawUrl, filename, container);
  },
};
