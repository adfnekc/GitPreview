import { init } from 'pptx-preview';

export interface PptxPreviewer {
  slideCount: number;
  htmlRender: { renderSlide(index: number): void };
  wrapper: HTMLElement;
  load(file: ArrayBuffer): Promise<unknown>;
  destroy(): void;
}

export interface PptxViewerOptions {
  stage: HTMLElement;
  viewport: HTMLElement;
  onZoomChange?: (zoom: number) => void;
  onSlideChange?: (index: number) => void;
}

export interface PptxViewer {
  load(file: ArrayBuffer): Promise<number>;
  showSlide(index: number): void;
  goNext(): void;
  goPrev(): void;
  setZoom(zoom: number): void;
  zoomIn(): void;
  zoomOut(): void;
  resetZoom(): void;
  refresh(): void;
  readonly index: number;
  readonly slideCount: number;
  dispose(): void;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

export function createPptxViewer(
  wrapper: HTMLElement,
  options: PptxViewerOptions,
): PptxViewer {
  const { stage, viewport } = options;
  const previewer = init(wrapper, {
    renderer: 'canvas',
    mode: 'list',
    width: 800,
    height: 600,
  }) as unknown as PptxPreviewer;

  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let panStartX = 0;
  let panStartY = 0;
  let currentIndex = 0;
  let slides: HTMLElement[] = [];

  const applyTransform = (): void => {
    const slide = stage.firstElementChild as HTMLElement | null;
    if (!slide) return;

    const intW = slide.offsetWidth;
    const intH = slide.offsetHeight;
    const vpW = viewport.clientWidth;
    const vpH = viewport.clientHeight;
    if (intW === 0 || intH === 0 || vpW <= 0 || vpH <= 0) return;

    const scale = Math.min(vpW / intW, vpH / intH, 1) * zoom;
    slide.style.position = 'relative';
    slide.style.top = '';
    slide.style.left = '';
    slide.style.margin = '0';
    slide.style.transformOrigin = '0 0';
    slide.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    slide.style.flexShrink = '0';

    const spacer = slide.parentElement;
    if (spacer) {
      spacer.style.width = `${intW * scale}px`;
      spacer.style.height = `${intH * scale}px`;
      spacer.style.flexShrink = '0';
    }

    const overflows = intW * scale > vpW * 0.8 || intH * scale > vpH * 0.8;
    viewport.style.cursor = overflows ? 'grab' : '';
    options.onZoomChange?.(zoom);
  };

  const clampZoom = (next: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));

  const setZoom = (next: number): void => {
    zoom = clampZoom(next);
    if (zoom <= 1) {
      panX = 0;
      panY = 0;
    }
    applyTransform();
  };

  const showSlide = (index: number): void => {
    const previous = stage.firstElementChild;
    if (previous) previewer.wrapper.appendChild(previous);

    const slide = slides[index];
    if (!slide) return;

    stage.appendChild(slide);
    panX = 0;
    panY = 0;
    currentIndex = index;
    applyTransform();
    options.onSlideChange?.(index);
  };

  const onWheel = (event: WheelEvent): void => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const factor = 1 + Math.abs(event.deltaY) / 200;
    setZoom(event.deltaY > 0 ? zoom * factor : zoom / factor);
  };

  const onMouseDown = (event: MouseEvent): void => {
    if (!stage.firstElementChild) return;
    dragging = true;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    panStartX = panX;
    panStartY = panY;
    viewport.style.cursor = 'grabbing';
    viewport.style.userSelect = 'none';
    event.preventDefault();
  };

  const onMouseMove = (event: MouseEvent): void => {
    if (!dragging) return;
    panX = panStartX + (event.clientX - dragStartX);
    panY = panStartY + (event.clientY - dragStartY);
    applyTransform();
  };

  const onMouseUp = (): void => {
    if (!dragging) return;
    dragging = false;
    viewport.style.cursor = '';
    viewport.style.userSelect = '';
  };

  const onResize = (): void => applyTransform();

  viewport.addEventListener('wheel', onWheel, { passive: false });
  viewport.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  window.addEventListener('resize', onResize);

  return {
    async load(file: ArrayBuffer): Promise<number> {
      await previewer.load(file);
      const count = previewer.slideCount || 0;

      for (let i = 0; i < count; i++) {
        previewer.htmlRender.renderSlide(i);
      }
      previewer.wrapper.style.background = 'transparent';
      slides = Array.from(
        previewer.wrapper.querySelectorAll<HTMLElement>('.pptx-preview-slide-wrapper'),
      );

      showSlide(0);
      return count;
    },

    showSlide,
    goNext(): void {
      if (currentIndex >= previewer.slideCount - 1) return;
      showSlide(currentIndex + 1);
    },
    goPrev(): void {
      if (currentIndex <= 0) return;
      showSlide(currentIndex - 1);
    },
    setZoom,
    zoomIn: () => setZoom(zoom + 0.1),
    zoomOut: () => setZoom(zoom - 0.1),
    resetZoom: () => setZoom(1),
    refresh: () => applyTransform(),
    get index(): number {
      return currentIndex;
    },
    get slideCount(): number {
      return previewer.slideCount || 0;
    },

    dispose(): void {
      viewport.removeEventListener('wheel', onWheel);
      viewport.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('resize', onResize);
      try {
        previewer.destroy();
      } catch {
        // ignore
      }
      slides = [];
      wrapper.remove();
    },
  };
}
