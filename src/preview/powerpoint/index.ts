import { type PreviewHandler } from '../handler';
import { escapeHTML, formatFileSize } from '../../utils';
import { fetchBinary } from '../../lib/range-fetcher';
import { getMimeType } from '../../lib/mime';
import { downloadBuffer } from '../../lib/download';
import { runContainerPreview } from '../ui';
import { createPptxViewer, type PptxViewer } from './viewer';

export const POWERPOINT_EXTENSIONS = ['pptx', 'ppt'];

const SHELL_HTML = (filename: string, meta: string) => `
  <div class="gitpreview-ppt-preview">
    <div class="gitpreview-ppt-header">
      <svg class="gitpreview-ppt-header-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
      <div class="gitpreview-ppt-header-info">
        <div class="gitpreview-ppt-filename">${escapeHTML(filename)}</div>
        <div class="gitpreview-ppt-meta">${meta}</div>
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
      <div class="gitpreview-ppt-slide-viewport" id="gitpreview-ppt-viewport">
        <div class="gitpreview-ppt-slide-stage" id="gitpreview-ppt-stage"></div>
      </div>
      <div class="gitpreview-ppt-controls">
        <div class="gitpreview-ppt-controls-nav">
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
        <div class="gitpreview-ppt-zoom-controls" id="gitpreview-ppt-zoom-controls">
          <button class="gitpreview-ppt-zoom-btn" id="gitpreview-ppt-zoom-out" title="Zoom out">−</button>
          <span class="gitpreview-ppt-zoom-label" id="gitpreview-ppt-zoom-label" title="Double-click to reset">100%</span>
          <button class="gitpreview-ppt-zoom-btn" id="gitpreview-ppt-zoom-in" title="Zoom in">+</button>
        </div>
      </div>
    </div>
  </div>`;

let currentViewer: PptxViewer | null = null;
let boundKeydown: ((event: KeyboardEvent) => void) | null = null;

export async function openPowerPointPreview(
  url: string,
  filename: string,
  container: HTMLElement,
): Promise<void> {
  const ext = filename.split('.').pop()?.toLowerCase() || 'pptx';

  await runContainerPreview(container, filename, async () => {
    const arrayBuffer = await fetchBinary(url);
    container.innerHTML = SHELL_HTML(
      filename,
      `${formatFileSize(arrayBuffer.byteLength)} · ${ext.toUpperCase()} presentation`,
    );

    const stage = container.querySelector<HTMLElement>('#gitpreview-ppt-stage');
    const viewport = container.querySelector<HTMLElement>('#gitpreview-ppt-viewport');
    if (!stage || !viewport) return;

    const zoomLabel = container.querySelector<HTMLElement>('#gitpreview-ppt-zoom-label');
    const pageIndicator = container.querySelector<HTMLElement>('#gitpreview-ppt-page');
    const meta = container.querySelector('.gitpreview-ppt-meta');

    // Hidden container where pptx-preview renders all slides.
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:absolute;left:-9999px;top:0;width:800px;';
    document.body.appendChild(wrapper);

    let slideCount = 0;
    const viewer = createPptxViewer(wrapper, {
      stage,
      viewport,
      onZoomChange: (zoom) => {
        if (zoomLabel) zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
      },
      onSlideChange: (index) => {
        if (pageIndicator) pageIndicator.textContent = `${index + 1} / ${slideCount || 1}`;
      },
    });
    currentViewer = viewer;

    slideCount = await viewer.load(arrayBuffer);
    if (meta) {
      meta.textContent = `${formatFileSize(arrayBuffer.byteLength)} · ${ext.toUpperCase()} presentation · ${slideCount} slide(s)`;
    }
    if (pageIndicator) pageIndicator.textContent = `1 / ${slideCount || 1}`;

    container
      .querySelector<HTMLElement>('#gitpreview-ppt-zoom-in')
      ?.addEventListener('click', () => viewer.zoomIn());
    container
      .querySelector<HTMLElement>('#gitpreview-ppt-zoom-out')
      ?.addEventListener('click', () => viewer.zoomOut());
    zoomLabel?.addEventListener('dblclick', () => viewer.resetZoom());

    // ── Navigation ──────────────────────────────────
    container
      .querySelector<HTMLElement>('#gitpreview-ppt-prev')
      ?.addEventListener('click', () => viewer.goPrev());
    container
      .querySelector<HTMLElement>('#gitpreview-ppt-next')
      ?.addEventListener('click', () => viewer.goNext());

    // ── Fullscreen ──────────────────────────────────
    const fullscreenBtn = container.querySelector<HTMLElement>('.gitpreview-ppt-btn-fullscreen');
    const slideContainer = container.querySelector<HTMLElement>('.gitpreview-ppt-slide-container');
    const fullIcon = container.querySelector<HTMLElement>('.gitpreview-ppt-fullscreen-icon');
    const exitIcon = container.querySelector<HTMLElement>('.gitpreview-ppt-fullscreen-exit-icon');

    fullscreenBtn?.addEventListener('click', async () => {
      if (!slideContainer) return;
      if (!document.fullscreenElement) {
        try {
          await slideContainer.requestFullscreen();
          if (fullIcon) fullIcon.style.display = 'none';
          if (exitIcon) exitIcon.style.display = 'block';
        } catch {
          // not supported
        }
      } else {
        await document.exitFullscreen();
      }
    });

    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) {
        if (fullIcon) fullIcon.style.display = '';
        if (exitIcon) exitIcon.style.display = 'none';
      }
      setTimeout(() => viewer.refresh(), 150);
    });

    // ── Download ────────────────────────────────────
    container
      .querySelector<HTMLElement>('.gitpreview-ppt-btn-download')
      ?.addEventListener('click', () =>
        downloadBuffer(arrayBuffer, filename, getMimeType(filename)),
      );

    // ── Keyboard navigation ─────────────────────────
    boundKeydown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === ' ') {
        event.preventDefault();
        viewer.goNext();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        viewer.goPrev();
      } else if (event.key === 'Escape' && document.fullscreenElement) {
        void document.exitFullscreen();
      } else if (event.key === 'f' || event.key === 'F') {
        fullscreenBtn?.click();
      }
    };
    document.addEventListener('keydown', boundKeydown);
  });
}

export function closePowerPointPreview(): void {
  if (boundKeydown) {
    document.removeEventListener('keydown', boundKeydown);
    boundKeydown = null;
  }
  currentViewer?.dispose();
  currentViewer = null;
}

export const powerPointHandler: PreviewHandler = {
  extensions: POWERPOINT_EXTENSIONS,
  openPreview(rawUrl: string, filename: string, container?: HTMLElement) {
    if (!container) return;
    void openPowerPointPreview(rawUrl, filename, container);
  },
  close: closePowerPointPreview,
};
