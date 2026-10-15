import { RangeFetcher, type FileInfo, fetchBinary } from '../../lib/range-fetcher';
import { getMimeType } from '../../lib/mime';

const CHUNK_SIZE = 1024 * 1024; // 1 MB per chunk

async function fetchChunkWithRetry(url: string, start: number, end: number): Promise<ArrayBuffer> {
  try {
    return await RangeFetcher.fetchChunk(url, start, end);
  } catch (err) {
    console.error('GitPreview video: chunk fetch failed, retrying once', err);
    return RangeFetcher.fetchChunk(url, start, end);
  }
}

export class StreamVideoPlayer {
  private readonly url: string;
  private readonly filename: string;
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private video: HTMLVideoElement | null = null;
  private fileInfo: FileInfo | null = null;
  private loadedBytes = 0;
  private loading = false;
  private aborted = false;

  constructor(url: string, filename: string) {
    this.url = url;
    this.filename = filename;
  }

  async init(container: HTMLElement, fileInfo: FileInfo): Promise<void> {
    this.fileInfo = fileInfo;
    container.innerHTML = '';

    this.video = document.createElement('video');
    this.video.className = 'gitpreview-video';
    this.video.controls = true;
    this.video.style.width = '100%';
    this.video.style.maxHeight = '80vh';
    container.appendChild(this.video);

    if (RangeFetcher.supportsRange() && fileInfo.acceptsRanges) {
      await this.initStreaming();
    } else {
      await this.initDirectFetch();
    }
  }

  private async initStreaming(): Promise<void> {
    if (!this.video) return;

    this.mediaSource = new MediaSource();
    this.video.src = URL.createObjectURL(this.mediaSource);

    this.mediaSource.addEventListener('sourceopen', () => {
      void this.onSourceOpen();
    });
  }

  private async onSourceOpen(): Promise<void> {
    if (!this.mediaSource) return;

    const mimeType = this.fileInfo?.mimeType || getMimeType(this.filename);
    try {
      this.sourceBuffer = this.mediaSource.addSourceBuffer(mimeType);
    } catch (err) {
      console.error('GitPreview video: unsupported mime type, falling back', err);
      await this.initDirectFetch();
      return;
    }

    this.sourceBuffer.addEventListener('updateend', () => {
      void this.loadNextChunk();
    });

    await this.loadNextChunk();
  }

  private async loadNextChunk(): Promise<void> {
    if (this.loading || this.aborted || !this.fileInfo || !this.sourceBuffer) return;

    const size = this.fileInfo.size;
    const start = this.loadedBytes;
    if (start >= size) {
      this.endOfStream();
      return;
    }
    const end = Math.min(start + CHUNK_SIZE - 1, size - 1);

    this.loading = true;
    try {
      const chunk = await fetchChunkWithRetry(this.url, start, end);
      if (this.aborted || !this.sourceBuffer) return;
      this.sourceBuffer.appendBuffer(chunk);
      this.loadedBytes += chunk.byteLength;
    } catch (err) {
      console.error('GitPreview video: giving up on chunk', err);
    } finally {
      this.loading = false;
    }
  }

  private endOfStream(): void {
    if (this.mediaSource?.readyState === 'open') {
      this.mediaSource.endOfStream();
    }
  }

  private async initDirectFetch(): Promise<void> {
    if (!this.video) return;
    const arrayBuffer = await fetchBinary(this.url);
    const mimeType = this.fileInfo?.mimeType || getMimeType(this.filename);
    this.video.src = URL.createObjectURL(new Blob([arrayBuffer], { type: mimeType }));
  }

  destroy(): void {
    this.aborted = true;
    if (this.video) {
      this.video.pause();
      if (this.video.src) URL.revokeObjectURL(this.video.src);
      this.video.remove();
      this.video = null;
    }
    this.endOfStream();
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.fileInfo = null;
  }
}
