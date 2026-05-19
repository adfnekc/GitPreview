import { type PreviewHandler, DEFAULT_BLOB_BUTTON_SELECTOR } from '../handler';
import { escapeHTML, formatFileSize } from '../../utils';
import { fetchBinary } from '../../lib/range-fetcher';
import { renderErrorContent } from '../ui';
import { init } from 'pptx-preview';

let currentPreviewer: any = null;
let _boundKeydown: ((e: KeyboardEvent) => void) | null = null;
let _boundMousemove: ((e: MouseEvent) => void) | null = null;
let _boundMouseup: (() => void) | null = null;
let _boundResize: (() => void) | null = null;
let _activeViewport: HTMLElement | null = null;

// Per-preview state — reset on each openPowerPointPreview call
let _zoomLevel = 1;
let _panX = 0;
let _panY = 0;
let _isDragging = false;
let _dragStartX = 0;
let _dragStartY = 0;
let _panStartX = 0;
let _panStartY = 0;

export async function openPowerPointPreview(
  url: string,
  filename: string,
  container: HTMLElement,
): Promise<void> {
  // Reset per-preview state
  _zoomLevel = 1;
  _panX = 0;
  _panY = 0;
  _isDragging = false;

  container.innerHTML = `
    <div class="gitpreview-loading">
      <div class="gitpreview-spinner"></div>
      <div class="gitpreview-loading-text">Loading ${escapeHTML(filename)}...</div>
    </div>`;

  try {
    const arrayBuffer = await fetchBinary(url);
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

    const stage = container.querySelector<HTMLElement>('#gitpreview-ppt-stage');
    const viewport = container.querySelector<HTMLElement>('#gitpreview-ppt-viewport');
    if (!stage || !viewport) return;
    _activeViewport = viewport;

    // Hidden container where pptx-preview renders all slides
    const tempWrapper = document.createElement('div');
    tempWrapper.style.cssText = 'position:absolute;left:-9999px;top:0;width:800px;';
    document.body.appendChild(tempWrapper);

    const previewer = init(tempWrapper, {
      renderer: 'canvas',
      mode: 'scroll',
      width: 800,
      height: 600,
    });

    currentPreviewer = previewer;
    await previewer.load(arrayBuffer);
    const slideCount = previewer.slideCount || 0;

    // Update metadata
    const meta = container.querySelector('.gitpreview-ppt-meta');
    if (meta) {
      meta.textContent = `${formatFileSize(arrayBuffer.byteLength)} · ${ext.toUpperCase()} presentation · ${slideCount} slide(s)`;
    }

    const pageIndicator = container.querySelector<HTMLElement>('#gitpreview-ppt-page');
    if (pageIndicator) {
      pageIndicator.textContent = `1 / ${slideCount || 1}`;
    }

    // Pre-render ALL slides once
    for (let i = 0; i < slideCount; i++) {
      previewer.htmlRender.renderSlide(i);
    }
    previewer.wrapper.style.background = 'transparent';

    const allSlides = Array.from(
      previewer.wrapper.querySelectorAll<HTMLElement>('.pptx-preview-slide-wrapper'),
    );

    // ── Zoom, pan, and transform ─────────────────────
    const zoomLabel = container.querySelector<HTMLElement>('#gitpreview-ppt-zoom-label');
    const zoomIn = container.querySelector<HTMLElement>('#gitpreview-ppt-zoom-in');
    const zoomOut = container.querySelector<HTMLElement>('#gitpreview-ppt-zoom-out');

    function updateZoomUI(): void {
      if (zoomLabel) zoomLabel.textContent = `${Math.round(_zoomLevel * 100)}%`;
    }

    function isSlideExceeds80(intW: number, intH: number, vpW: number, vpH: number): boolean {
      const baseScale = Math.min(vpW / intW, vpH / intH, 1);
      const scale = baseScale * _zoomLevel;
      return intW * scale > vpW * 0.8 || intH * scale > vpH * 0.8;
    }

    function applyTransform(): void {
      const slide = stage.firstElementChild as HTMLElement | null;
      if (!slide) return;

      const intW = slide.offsetWidth;
      const intH = slide.offsetHeight;
      if (intW === 0 || intH === 0) return;

      const vpW = viewport.clientWidth;
      const vpH = viewport.clientHeight;
      if (vpW <= 0 || vpH <= 0) return;

      const baseScale = Math.min(vpW / intW, vpH / intH, 1);
      const scale = baseScale * _zoomLevel;

      slide.style.position = 'relative';
      slide.style.top = '';
      slide.style.left = '';
      slide.style.margin = '0';
      slide.style.transformOrigin = '0 0';
      slide.style.transform = `translate(${_panX}px, ${_panY}px) scale(${scale})`;
      slide.style.flexShrink = '0';

      const spacer = slide.parentElement;
      if (spacer) {
        spacer.style.width = `${intW * scale}px`;
        spacer.style.height = `${intH * scale}px`;
        spacer.style.flexShrink = '0';
      }

      viewport.style.cursor = isSlideExceeds80(intW, intH, vpW, vpH) ? 'grab' : '';

      updateZoomUI();
    }

    zoomIn?.addEventListener('click', () => {
      _zoomLevel = Math.min(5, _zoomLevel + 0.1);
      if (_zoomLevel <= 1) { _panX = 0; _panY = 0; }
      applyTransform();
    });

    zoomOut?.addEventListener('click', () => {
      _zoomLevel = Math.max(0.1, _zoomLevel - 0.1);
      if (_zoomLevel <= 1) { _panX = 0; _panY = 0; }
      applyTransform();
    });

    // Double-click zoom label to reset
    zoomLabel?.addEventListener('dblclick', () => {
      _zoomLevel = 1;
      _panX = 0;
      _panY = 0;
      applyTransform();
    });

    // ── Touchpad / pinch-to-zoom ─────────────────────
    viewport.addEventListener('wheel', (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = -e.deltaY;
      const factor = 1 + Math.abs(delta) / 200;
      _zoomLevel = delta > 0
        ? Math.min(5, _zoomLevel * factor)
        : Math.max(0.1, _zoomLevel / factor);
      if (_zoomLevel <= 1) { _panX = 0; _panY = 0; }
      applyTransform();
    }, { passive: false });

    // ── Mouse drag panning ───────────────────────────
    viewport.addEventListener('mousedown', (e: MouseEvent) => {
      const slide = stage.firstElementChild as HTMLElement | null;
      if (!slide) return;
      const intW = slide.offsetWidth;
      const intH = slide.offsetHeight;
      const vpW = viewport.clientWidth;
      const vpH = viewport.clientHeight;
      if (!isSlideExceeds80(intW, intH, vpW, vpH)) return;

      _isDragging = true;
      _dragStartX = e.clientX;
      _dragStartY = e.clientY;
      _panStartX = _panX;
      _panStartY = _panY;
      viewport.style.cursor = 'grabbing';
      viewport.style.userSelect = 'none';
      e.preventDefault();
    });

    _boundMousemove = (e: MouseEvent) => {
      if (!_isDragging) return;
      _panX = _panStartX + (e.clientX - _dragStartX);
      _panY = _panStartY + (e.clientY - _dragStartY);
      applyTransform();
    };
    document.addEventListener('mousemove', _boundMousemove);

    _boundMouseup = () => {
      if (!_isDragging) return;
      _isDragging = false;
      viewport.style.cursor = '';
      viewport.style.userSelect = '';
    };
    document.addEventListener('mouseup', _boundMouseup);

    // ── Navigation ──────────────────────────────────
    let currentIndex = 0;

    function showSlide(index: number): void {
      // Move previously-shown slide back to hidden wrapper
      const previous = stage.firstElementChild;
      if (previous) {
        previewer.wrapper.appendChild(previous);
      }
      // Move requested slide to stage
      const slide = allSlides[index];
      if (slide) {
        stage.appendChild(slide);
        _panX = 0;
        _panY = 0;
        applyTransform();
      }
    }

    showSlide(0);

    const prevBtn = container.querySelector<HTMLElement>('#gitpreview-ppt-prev');
    const nextBtn = container.querySelector<HTMLElement>('#gitpreview-ppt-next');

    const updatePage = () => {
      if (pageIndicator) {
        pageIndicator.textContent = `${currentIndex + 1} / ${slideCount || 1}`;
      }
    };

    const goNext = () => {
      if (currentIndex >= slideCount - 1) return;
      currentIndex++;
      showSlide(currentIndex);
      updatePage();
    };

    const goPrev = () => {
      if (currentIndex <= 0) return;
      currentIndex--;
      showSlide(currentIndex);
      updatePage();
    };

    prevBtn?.addEventListener('click', goPrev);
    nextBtn?.addEventListener('click', goNext);

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
          fullIcon!.style.display = 'none';
          exitIcon!.style.display = 'block';
        } catch { /* not supported */ }
      } else {
        await document.exitFullscreen();
      }
    });

    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) {
        fullIcon!.style.display = '';
        exitIcon!.style.display = 'none';
      }
      setTimeout(() => applyTransform(), 150);
    });

    _boundResize = applyTransform;
    window.addEventListener('resize', _boundResize);

    // Download
    const downloadBtn = container.querySelector<HTMLElement>('.gitpreview-ppt-btn-download');
    downloadBtn?.addEventListener('click', () => {
      const blob = new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(dlUrl);
    });

    // Keyboard navigation
    _boundKeydown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goPrev();
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
  if (_boundMousemove) {
    document.removeEventListener('mousemove', _boundMousemove);
    _boundMousemove = null;
  }
  if (_boundMouseup) {
    document.removeEventListener('mouseup', _boundMouseup);
    _boundMouseup = null;
  }
  if (_boundResize) {
    window.removeEventListener('resize', _boundResize);
    _boundResize = null;
  }
  if (currentPreviewer) {
    try {
      currentPreviewer.destroy();
    } catch {
      // ignore
    }
    currentPreviewer = null;
  }
  _activeViewport = null;
}

export const powerPointHandler: PreviewHandler = {
  extensions: ['pptx', 'ppt'],
  getBlobButtonSelector: () => DEFAULT_BLOB_BUTTON_SELECTOR,
  openPreview(rawUrl: string, filename: string, container?: HTMLElement) {
    if (!container) return;
    openPowerPointPreview(rawUrl, filename, container);
  },
  close: closePowerPointPreview,
};
