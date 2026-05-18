import { type PreviewHandler } from '../handler';
import { VIDEO_EXTENSIONS, escapeHTML } from '../../utils';
import { RangeFetcher, type FileInfo } from '../../lib/range-fetcher';
import { base64ToArrayBuffer } from '../../utils';
import { NetworkAware } from '../../lib/network-aware';
import { renderErrorContent } from '../ui';

const CHUNK_SIZE = 1024 * 1024; // 1MB per chunk

export class StreamVideoPlayer {
  url: string;
  filename: string;
  mediaSource: MediaSource | null = null;
  sourceBuffer: SourceBuffer | null = null;
  video: HTMLVideoElement | null = null;
  container: HTMLElement | null = null;
  fileInfo: FileInfo | null = null;
  loadedBytes = 0;
  loading = false;
  aborted = false;

  constructor(url: string, filename: string) {
    this.url = url;
    this.filename = filename;
  }

  async init(container: HTMLElement, fileInfo?: FileInfo): Promise<void> {
    this.container = container;

    // 获取文件元数据
    this.fileInfo = fileInfo || await RangeFetcher.getFileInfo(this.url);

    // 清空之前的 loading 内容
    container.innerHTML = '';

    // 创建 video 元素
    this.video = document.createElement('video');
    this.video.className = 'gitpreview-video';
    this.video.controls = true;
    this.video.style.width = '100%';
    this.video.style.maxHeight = '80vh';
    container.appendChild(this.video);

    if (RangeFetcher.supportsRange() && this.fileInfo.acceptsRanges) {
      await this.initStreaming();
    } else {
      await this.initDirectFetch();
    }
  }

  async initStreaming(): Promise<void> {
    if (!this.video || !this.fileInfo) return;

    this.mediaSource = new MediaSource();
    this.video.src = URL.createObjectURL(this.mediaSource);

    this.mediaSource.addEventListener('sourceopen', async () => {
      if (!this.mediaSource || !this.fileInfo) return;
      const mimeType = this.fileInfo.mimeType || 'video/mp4';
      try {
        this.sourceBuffer = this.mediaSource.addSourceBuffer(mimeType);
      } catch {
        // fallback: try without specific mime type
        await this.initDirectFetch();
        return;
      }

      this.sourceBuffer.addEventListener('updateend', () => {
        if (!this.aborted && this.loadedBytes < this.fileInfo!.size) {
          this.loadNextChunk();
        }
      });

      await this.loadNextChunk();
    });
  }

  async loadNextChunk(): Promise<void> {
    if (this.loading || !this.fileInfo) return;
    this.loading = true;

    const start = this.loadedBytes;
    const end = Math.min(start + CHUNK_SIZE - 1, this.fileInfo.size - 1);

    if (start >= this.fileInfo.size) {
      this.loading = false;
      if (this.mediaSource && this.mediaSource.readyState === 'open') {
        this.mediaSource.endOfStream();
      }
      return;
    }

    try {
      const chunk = await RangeFetcher.fetchChunk(this.url, start, end);
      if (this.sourceBuffer && !this.sourceBuffer.updating) {
        this.sourceBuffer.appendBuffer(chunk);
        this.loadedBytes += chunk.byteLength;
      }
    } catch (err) {
      console.error('GitPreview video: chunk fetch error, retrying...', err);
      // retry once
      try {
        const chunk = await RangeFetcher.fetchChunk(this.url, start, end);
        if (this.sourceBuffer && !this.sourceBuffer.updating) {
          this.sourceBuffer.appendBuffer(chunk);
          this.loadedBytes += chunk.byteLength;
        }
      } catch (retryErr) {
        console.error('GitPreview video: retry failed', retryErr);
      }
    }

    this.loading = false;
  }

  async initDirectFetch(): Promise<void> {
    if (!this.video) return;
    // fallback: full fetch via existing binary fetch
    const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'fetchBinary', url: this.url },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (response.success) {
            resolve(base64ToArrayBuffer(response.data));
          } else {
            reject(new Error(response.error || 'Failed to fetch'));
          }
        },
      );
    });

    const blob = new Blob([arrayBuffer], { type: this.fileInfo?.mimeType || 'video/mp4' });
    this.video!.src = URL.createObjectURL(blob);
  }

  destroy(): void {
    this.aborted = true;
    if (this.video) {
      this.video.pause();
      if (this.video.src) URL.revokeObjectURL(this.video.src);
      this.video.remove();
      this.video = null;
    }
    if (this.mediaSource) {
      if (this.mediaSource.readyState === 'open') {
        try { this.mediaSource.endOfStream(); } catch { /* ignore */ }
      }
      this.mediaSource = null;
    }
    this.sourceBuffer = null;
  }
}

let currentPlayer: StreamVideoPlayer | null = null;

export function openVideoPreview(
  url: string,
  filename: string,
  container: HTMLElement,
): Promise<void> {
  if (currentPlayer) {
    currentPlayer.destroy();
  }

  // 网络检测 + 大文件警告
  return RangeFetcher.getFileInfo(url).then((fileInfo) => {
    return NetworkAware.shouldWarn(fileInfo.size)
      ? NetworkAware.confirmLoad(filename, fileInfo.size).then((confirmed) => {
          if (!confirmed) {
            container.innerHTML = renderErrorContent('Loading cancelled on cellular network.');
            return;
          }
          return doLoad(url, filename, container, fileInfo);
        })
      : doLoad(url, filename, container, fileInfo);
  });
}

function doLoad(
  url: string,
  filename: string,
  container: HTMLElement,
  fileInfo: FileInfo,
): Promise<void> {
  // 隐藏 GitHub 的大文件提示（View raw / Sorry...）
  const blobTarget = document.querySelector('.gitpreview-blob-target');
  if (blobTarget) (blobTarget as HTMLElement).style.display = 'none';

  container.innerHTML = `
    <div class="gitpreview-loading">
      <div class="gitpreview-spinner"></div>
      <div class="gitpreview-loading-text">Loading ${escapeHTML(filename)}...</div>
    </div>`;

  currentPlayer = new StreamVideoPlayer(url, filename);
  return currentPlayer.init(container, fileInfo).catch((err) => {
    console.error('GitPreview video error:', err);
    container.innerHTML = renderErrorContent((err as Error).message || 'Failed to load video');
  });
}

export function closeVideoPreview(): void {
  if (currentPlayer) {
    currentPlayer.destroy();
    currentPlayer = null;
  }
}

export const videoHandler: PreviewHandler = {
  extensions: VIDEO_EXTENSIONS,
  getBlobButtonSelector() {
    return 'a[data-testid="raw-button"], a[href*="/raw/"], a#raw-url';
  },
  openPreview(rawUrl: string, _filename: string, container?: HTMLElement) {
    if (!container) return;
    openVideoPreview(rawUrl, _filename, container);
  },
};
