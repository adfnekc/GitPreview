import { type PreviewHandler } from '../handler';
import { escapeHTML, formatFileSize } from '../../utils';
import { renderErrorContent } from '../ui';
import mammoth from 'mammoth';

export async function openWordPreview(
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
            reject(new Error(response.error || 'Failed to fetch document'));
          }
        },
      );
    });

    const result = await mammoth.convertToHtml(
      { arrayBuffer },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          const imageBuffer = await image.readAsArrayBuffer();
          const base64 = arrayBufferToBase64(imageBuffer);
          const mimeType = image.contentType || 'image/png';
          return { src: `data:${mimeType};base64,${base64}` };
        }),
      },
    );

    container.innerHTML = `
      <div class="gitpreview-word-preview">
        <div class="gitpreview-word-header">
          <svg class="gitpreview-word-header-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <div class="gitpreview-word-header-info">
            <div class="gitpreview-word-filename">${escapeHTML(filename)}</div>
            <div class="gitpreview-word-meta">${formatFileSize(arrayBuffer.byteLength)} · Word document</div>
          </div>
          <div class="gitpreview-word-actions">
            <a class="gitpreview-word-download-btn" href="${url}" download="${escapeHTML(filename)}" title="Download">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
              Download
            </a>
          </div>
        </div>
        <div class="gitpreview-word-body">
          ${result.value}
        </div>
      </div>`;

    if (result.messages.length > 0) {
      console.info('GitPreview Word conversion messages:', result.messages);
    }
  } catch (err) {
    console.error('GitPreview word error:', err);
    container.innerHTML = renderErrorContent(
      (err as Error).message || 'Failed to load Word document',
    );
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function closeWordPreview(): void {
  // DOM cleanup is handled by removeExistingPlayer() in the caller.
}

export const wordHandler: PreviewHandler = {
  extensions: ['docx'],
  getBlobButtonSelector() {
    return 'a[data-testid="raw-button"], a[href*="/raw/"], a#raw-url';
  },
  openPreview(rawUrl: string, filename: string, container?: HTMLElement) {
    if (!container) return;
    openWordPreview(rawUrl, filename, container);
  },
};
