import { type PreviewHandler } from '../handler';
import { escapeHTML, formatFileSize } from '../../utils';
import { renderErrorContent } from '../ui';
import { init } from 'pptx-preview';

let currentPreviewer: any = null;
let currentContainer: HTMLElement | null = null;
let _boundKeydown: ((e: KeyboardEvent) => void) | null = null;

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
    currentContainer = container;

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
          <div class="gitpreview-ppt-header-actions">
            <button class="gitpreview-ppt-btn gitpreview-ppt-btn-download" title="Download PPTX">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
            </button>
            <button class="gitpreview-ppt-btn gitpreview-ppt-btn-fullscreen" title="Fullscreen">
              <svg class="gitpreview-ppt-fullscreen-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
              <svg class="gitpreview-ppt-fullscreen-exit-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="display:none">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
              </svg>
            </button>
          </div>
        </div>
        <div class="gitpreview-ppt-slide-container">
          <div class="gitpreview-ppt-slide-viewport">
            <div class="gitpreview-ppt-slide-wrapper"></div>
          </div>
          <div class="gitpreview-ppt-controls">
            <button class="gitpreview-ppt-nav-btn" id="gitpreview-ppt-prev" title="Previous slide">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span class="gitpreview-ppt-page-indicator" id="gitpreview-ppt-page">1 / 1</span>
            <button class="gitpreview-ppt-nav-btn" id="gitpreview-ppt-next" title="Next slide">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>`;

    const wrapper = container.querySelector<HTMLElement>('.gitpreview-ppt-slide-wrapper');
    if (!wrapper) return;

    const viewport = container.querySelector<HTMLElement>('.gitpreview-ppt-slide-viewport');
    const viewportWidth = viewport ? viewport.clientWidth - 4 : 800;

    const previewer = init(wrapper, {
      renderer: 'canvas',
      mode: 'slide',
      width: viewportWidth,
      height: viewport ? Math.max(viewport.clientHeight - 4, 400) : 600,
    });

    currentPreviewer = previewer;
    await previewer.preview(arrayBuffer);

    // Remove built-in nav buttons from pptx-preview, keep only the slide
    const ppWrapper = wrapper.querySelector<HTMLElement>('.pptx-preview-wrapper');
    if (ppWrapper) {
      // Remove all children except the slide wrapper
      const slides = ppWrapper.querySelectorAll<HTMLElement>('[class*="pptx-preview-slide-wrapper"]');
      ppWrapper.querySelectorAll('.pptx-preview-wrapper-next, .pptx-preview-wrapper-pagination, .pptx-preview-wrapper-pre').forEach((el) => el.remove());
    }

    // After render, scale slide to fit viewport
    const fitSlideToViewport = () => {
      if (!ppWrapper) return;
      const slideEl = ppWrapper.querySelector<HTMLElement>('[class*="pptx-preview-slide-wrapper"]');
      if (!slideEl || !viewport) return;

      const rect = slideEl.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const vpRect = viewport.getBoundingClientRect();
      const availW = vpRect.width - 16;
      const availH = vpRect.height - 16;
      if (availW <= 0 || availH <= 0) return;

      const scale = Math.min(availW / rect.width, availH / rect.height, 1);

      ppWrapper.style.width = '';
      ppWrapper.style.height = '';
      ppWrapper.style.background = 'transparent';
      ppWrapper.style.margin = '0';
      ppWrapper.style.overflow = 'visible';

      slideEl.style.position = 'relative';
      slideEl.style.top = 'auto';
      slideEl.style.left = 'auto';
      slideEl.style.transformOrigin = '0 0';
      slideEl.style.transform = `scale(${scale})`;

      ppWrapper.style.width = `${rect.width * scale}px`;
      ppWrapper.style.height = `${rect.height * scale}px`;
    };

    fitSlideToViewport();

    const slideCount = previewer.slideCount || 0;
    const meta = container.querySelector('.gitpreview-ppt-meta');
    if (meta) {
      meta.textContent = `${formatFileSize(arrayBuffer.byteLength)} · ${ext.toUpperCase()} presentation · ${slideCount} slide(s)`;
    }

    // Connect navigation
    const prevBtn = container.querySelector<HTMLElement>('#gitpreview-ppt-prev');
    const nextBtn = container.querySelector<HTMLElement>('#gitpreview-ppt-next');
    const pageIndicator = container.querySelector<HTMLElement>('#gitpreview-ppt-page');

    if (pageIndicator) {
      pageIndicator.textContent = `1 / ${slideCount || 1}`;
    }

    const updatePage = () => {
      if (pageIndicator && previewer) {
        pageIndicator.textContent = `${(previewer.currentIndex || 0) + 1} / ${slideCount || 1}`;
      }
    };

    prevBtn?.addEventListener('click', () => {
      if (!previewer) return;
      previewer.renderPreSlide();
      fitSlideToViewport();
      updatePage();
    });

    nextBtn?.addEventListener('click', () => {
      if (!previewer) return;
      previewer.renderNextSlide();
      fitSlideToViewport();
      updatePage();
    });

    // Fullscreen toggle
    const fullscreenBtn = container.querySelector<HTMLElement>('.gitpreview-ppt-btn-fullscreen');
    const slideContainer = container.querySelector<HTMLElement>('.gitpreview-ppt-slide-container');
    const fullIcon = container.querySelector<HTMLElement>('.gitpreview-ppt-fullscreen-icon');
    const exitIcon = container.querySelector<HTMLElement>('.gitpreview-ppt-fullscreen-exit-icon');

    fullscreenBtn?.addEventListener('click', async () => {
      if (!slideContainer) return;
      if (!document.fullscreenElement) {
        try {
          await slideContainer.requestFullscreen();
          fullIcon!.style.display = 'none';
          exitIcon!.style.display = 'block';
        } catch { /* fullscreen not supported */ }
      } else {
        await document.exitFullscreen();
        fullIcon!.style.display = '';
        exitIcon!.style.display = 'none';
      }
    });

    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) {
        fullIcon!.style.display = '';
        exitIcon!.style.display = 'none';
      }
      // Re-fit after fullscreen transition
      setTimeout(fitSlideToViewport, 100);
    });
    window.addEventListener('resize', fitSlideToViewport);

    // Download
    const downloadBtn = container.querySelector<HTMLElement>('.gitpreview-ppt-btn-download');
    downloadBtn?.addEventListener('click', () => {
      const blob = new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    });

    // Keyboard navigation
    _boundKeydown = (e: KeyboardEvent) => {
      if (!previewer) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        previewer.renderNextSlide();
        fitSlideToViewport();
        updatePage();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        previewer.renderPreSlide();
        fitSlideToViewport();
        updatePage();
      } else if (e.key === 'Escape' && document.fullscreenElement) {
        document.exitFullscreen();
      } else if (e.key === 'f' || e.key === 'F') {
        fullscreenBtn?.click();
      }
    };
    document.addEventListener('keydown', _boundKeydown);
  } catch (err) {
    console.error('GitPreview powerpoint error:', err);
    container.innerHTML = renderErrorContent(
      (err as Error).message || 'Failed to load presentation',
    );
  }
}

export function closePowerPointPreview(): void {
  if (_boundKeydown) {
    document.removeEventListener('keydown', _boundKeydown);
    _boundKeydown = null;
  }
  if (currentPreviewer) {
    try {
      currentPreviewer.destroy();
    } catch {
      // ignore cleanup errors
    }
    currentPreviewer = null;
  }
  currentContainer = null;
}

export const powerPointHandler: PreviewHandler = {
  extensions: ['pptx', 'ppt'],
  getBlobButtonSelector() {
    return 'button[data-testid="download-raw-button"]';
  },
  openPreview(rawUrl: string, filename: string, container?: HTMLElement) {
    if (!container) return;
    openPowerPointPreview(rawUrl, filename, container);
  },
};
