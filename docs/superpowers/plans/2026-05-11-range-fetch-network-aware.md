# RangeFetch + 网络感知加载 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 为 GitPreview 添加 Range Request 基础设施和网络感知加载能力，并新增视频预览 handler。

**架构：** background worker 新增 `fetchHead` / `fetchRange` 两个消息类型；content script 侧 `RangeFetcher` 工具类封装通信逻辑；`NetworkAware` 工具类封装网络检测和用户确认；video handler 使用 MediaSource API 实现流式分块加载。

**Tech Stack:** TypeScript, Chrome Extension MV3, MediaSource API, Network Information API, Vitest

---

### Task 1: Background worker — 新增 `fetchHead` 消息处理

**Files:**
- Modify: `src/background.ts`

- [ ] **Step 1: 修改 background.ts**

在 `switch (request.action)` 中新增 `fetchHead` case：

```typescript
case 'fetchHead':
  fetchHead(request.url, sendResponse);
  return true;
```

同时新增 `fetchHead` 函数：

```typescript
function fetchHead(url: string, sendResponse: (response: any) => void): void {
  fetch(url, { method: 'HEAD' })
    .then((response) => {
      const size = parseInt(response.headers.get('Content-Length') || '0', 10);
      const acceptsRanges = response.headers.get('Accept-Ranges') === 'bytes';
      const mimeType = response.headers.get('Content-Type') || '';
      sendResponse({ success: true, size, acceptsRanges, mimeType });
    })
    .catch((error: Error) => {
      sendResponse({ success: false, error: error.message });
    });
}
```

- [ ] **Step 2: 验证编译通过**

```bash
npx tsc --noEmit
```
预期：编译无错误。

- [ ] **Step 3: 提交**

```bash
git add src/background.ts
git commit -m "feat: 新增 fetchHead 消息处理"
```

---

### Task 2: Background worker — 新增 `fetchRange` 消息处理

**Files:**
- Modify: `src/background.ts`

- [ ] **Step 1: 修改 background.ts**

在 `switch (request.action)` 中新增 `fetchRange` case：

```typescript
case 'fetchRange':
  fetchRange(request.url, request.start, request.end, sendResponse);
  return true;
```

同时新增 `fetchRange` 函数：

```typescript
function fetchRange(
  url: string,
  start: number,
  end: number,
  sendResponse: (response: any) => void,
): void {
  fetch(url, { headers: { Range: `bytes=${start}-${end}` } })
    .then((response) => {
      if (!response.ok && response.status !== 206) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.arrayBuffer();
    })
    .then((arrayBuffer) => {
      const base64 = arrayBufferToBase64(arrayBuffer);
      sendResponse({ success: true, data: base64, start, end });
    })
    .catch((error: Error) => {
      sendResponse({ success: false, error: error.message });
    });
}
```

- [ ] **Step 2: 验证编译通过**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: 提交**

```bash
git add src/background.ts
git commit -m "feat: 新增 fetchRange 消息处理"
```

---

### Task 3: `src/lib/range-fetcher.ts` — Range Request 工具类

**Files:**
- Create: `src/lib/range-fetcher.ts`

- [ ] **Step 1: 创建 range-fetcher.ts**

```typescript
export interface FileInfo {
  size: number;
  acceptsRanges: boolean;
  mimeType: string;
}

export class RangeFetcher {
  static getFileInfo(url: string): Promise<FileInfo> {
    return new Promise((resolve, reject) => {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ action: 'fetchHead', url }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (response.success) {
            resolve({
              size: response.size,
              acceptsRanges: response.acceptsRanges,
              mimeType: response.mimeType,
            });
          } else {
            reject(new Error(response.error || 'Failed to get file info'));
          }
        });
      } else {
        reject(new Error('Chrome runtime not available'));
      }
    });
  }

  static fetchChunk(url: string, start: number, end: number): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage(
          { action: 'fetchRange', url, start, end },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (response.success) {
              resolve(base64ToArrayBuffer(response.data));
            } else {
              reject(new Error(response.error || 'Failed to fetch chunk'));
            }
          },
        );
      } else {
        reject(new Error('Chrome runtime not available'));
      }
    });
  }

  static supportsRange(): boolean {
    return typeof MediaSource !== 'undefined' && MediaSource !== null;
  }
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const byteString = atob(base64);
  const byteArray = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    byteArray[i] = byteString.charCodeAt(i);
  }
  return byteArray.buffer;
}
```

- [ ] **Step 2: 验证编译通过**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: 提交**

```bash
git add src/lib/
git commit -m "feat: 新增 RangeFetcher 工具类"
```

---

### Task 4: `src/lib/network-aware.ts` — 网络检测 + 大文件警告

**Files:**
- Create: `src/lib/network-aware.ts`

- [ ] **Step 1: 创建 network-aware.ts**

```typescript
import { escapeHTML, formatFileSize } from '../utils';

export class NetworkAware {
  static isExpensiveConnection(): boolean {
    const conn = (navigator as any).connection;
    if (!conn) return false;

    if (conn.type === 'cellular') return true;

    const effectiveType = conn.effectiveType;
    if (effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g') {
      return true;
    }

    return false;
  }

  static exceedsThreshold(bytes: number, thresholdMB: number = 5): boolean {
    return bytes > thresholdMB * 1024 * 1024;
  }

  static shouldWarn(fileSize: number): boolean {
    return this.isExpensiveConnection() && this.exceedsThreshold(fileSize);
  }

  static confirmLoad(filename: string, size: number): Promise<boolean> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'gitpreview-warning-overlay';
      overlay.innerHTML = `
        <div class="gitpreview-warning-dialog">
          <h3 class="gitpreview-warning-title">Cellular Network Detected</h3>
          <p class="gitpreview-warning-message">
            Loading <strong>${escapeHTML(filename)}</strong> (${formatFileSize(size)}) over a cellular or metered connection may use significant data.
          </p>
          <div class="gitpreview-warning-actions">
            <button class="gitpreview-warning-cancel gitpreview-btn-secondary">Cancel</button>
            <button class="gitpreview-warning-continue gitpreview-btn-primary">Continue</button>
          </div>
        </div>`;

      const cancelBtn = overlay.querySelector('.gitpreview-warning-cancel')!;
      const continueBtn = overlay.querySelector('.gitpreview-warning-continue')!;

      const cleanup = (result: boolean) => {
        overlay.remove();
        resolve(result);
      };

      cancelBtn.addEventListener('click', () => cleanup(false));
      continueBtn.addEventListener('click', () => cleanup(true));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cleanup(false);
      });

      document.body.appendChild(overlay);
    });
  }
}
```

- [ ] **Step 2: 验证编译通过**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: 提交**

```bash
git add src/lib/network-aware.ts
git commit -m "feat: 新增 NetworkAware 网络检测工具类"
```

---

### Task 5: 视频预览 Handler

**Files:**
- Create: `src/preview/video/index.ts`
- Modify: `src/utils.ts` — 新增 `VIDEO_EXTENSIONS`

- [ ] **Step 1: 在 `src/utils.ts` 中添加视频扩展名常量**

```typescript
export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'ogg'];
```

更新 `isSupportedExtension` 函数：

```typescript
export function isSupportedExtension(ext: string | null | undefined): boolean {
  if (!ext) return false;
  const e = ext.toLowerCase();
  return AUDIO_EXTENSIONS.includes(e) || PDF_EXTENSIONS.includes(e) || VIDEO_EXTENSIONS.includes(e);
}
```

- [ ] **Step 2: 创建 `src/preview/video/index.ts`**

```typescript
import { type PreviewHandler } from '../handler';
import { VIDEO_EXTENSIONS, escapeHTML } from '../../utils';
import { RangeFetcher, base64ToArrayBuffer, type FileInfo } from '../../lib/range-fetcher';
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

  async init(container: HTMLElement): Promise<void> {
    this.container = container;

    // 获取文件元数据
    this.fileInfo = await RangeFetcher.getFileInfo(this.url);

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
          return doLoad(url, filename, container);
        })
      : doLoad(url, filename, container);
  });
}

function doLoad(
  url: string,
  filename: string,
  container: HTMLElement,
): Promise<void> {
  container.innerHTML = `
    <div class="gitpreview-loading">
      <div class="gitpreview-spinner"></div>
      <div class="gitpreview-loading-text">Loading ${escapeHTML(filename)}...</div>
    </div>`;

  currentPlayer = new StreamVideoPlayer(url, filename);
  return currentPlayer.init(container).catch((err) => {
    console.error('GitPreview video error:', err);
    container.innerHTML = renderErrorContent((err as Error).message || 'Failed to load video');
  });
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
```

- [ ] **Step 3: 验证编译通过**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: 提交**

```bash
git add src/utils.ts src/preview/video/
git commit -m "feat: 新增视频预览 handler，支持分块流式加载"
```

---

### Task 6: 在 content.ts 中注册 video handler

**Files:**
- Modify: `src/content.ts`

- [ ] **Step 1: 在 content.ts 中导入并注册 videoHandler**

在文件顶部的 import 区域添加：

```typescript
import { videoHandler } from './preview/video/index';
```

在现有的 `registerHandler(pdfHandler)` 之后添加：

```typescript
registerHandler(videoHandler);
```

- [ ] **Step 2: 验证编译通过**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: 提交**

```bash
git add src/content.ts
git commit -m "feat: 注册 video handler 到 content script"
```

---

### Task 7: CSS 样式 — 视频播放器 + 网络警告对话框

**Files:**
- Modify: `src/preview/preview.css`

- [ ] **Step 1: 添加视频和警告对话框样式**

追加到 `src/preview/preview.css` 末尾：

```css
/* ── Video player ─────────────────────────────── */

.gitpreview-video {
  display: block;
  background: #000;
}

.gitpreview-video:focus {
  outline: none;
}

/* ── Network warning dialog ───────────────────── */

.gitpreview-warning-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.gitpreview-warning-dialog {
  background: #fff;
  border-radius: 12px;
  padding: 32px;
  max-width: 480px;
  width: 90%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.gitpreview-warning-title {
  margin: 0 0 12px 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2328;
}

.gitpreview-warning-message {
  margin: 0 0 24px 0;
  font-size: 14px;
  color: #656d76;
  line-height: 1.5;
}

.gitpreview-warning-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.gitpreview-warning-cancel,
.gitpreview-warning-continue {
  padding: 6px 16px;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid;
}

.gitpreview-warning-cancel {
  background: #f6f8fa;
  border-color: rgba(31, 35, 40, 0.15);
  color: #24292f;
}

.gitpreview-warning-continue {
  background: #0969da;
  border-color: #0969da;
  color: #fff;
}

.gitpreview-warning-continue:hover {
  background: #0860ca;
}

/* Dark theme support for warning dialog */
@media (prefers-color-scheme: dark) {
  .gitpreview-warning-dialog {
    background: #161b22;
    border: 1px solid #30363d;
  }

  .gitpreview-warning-title {
    color: #e6edf3;
  }

  .gitpreview-warning-message {
    color: #8b949e;
  }

  .gitpreview-warning-cancel {
    background: #21262d;
    border-color: #30363d;
    color: #c9d1d9;
  }

  .gitpreview-warning-overlay {
    background: rgba(0, 0, 0, 0.6);
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/preview/preview.css
git commit -m "style: 添加视频播放器和网络警告对话框样式"
```

---

### Task 8: 单元测试

**Files:**
- Create: `tests/unit/range-fetcher.spec.ts`
- Create: `tests/unit/network-aware.spec.ts`

- [ ] **Step 1: 创建 range-fetcher 测试**

```typescript
import { describe, test, expect, vi } from 'vitest';
import { RangeFetcher } from '../../src/lib/range-fetcher';

describe('RangeFetcher', () => {
  test('supportsRange returns false when MediaSource is undefined', () => {
    const originalMediaSource = (globalThis as any).MediaSource;
    (globalThis as any).MediaSource = undefined;
    expect(RangeFetcher.supportsRange()).toBe(false);
    (globalThis as any).MediaSource = originalMediaSource;
  });

  test('supportsRange returns true when MediaSource is defined', () => {
    (globalThis as any).MediaSource = class {};
    expect(RangeFetcher.supportsRange()).toBe(true);
  });
});
```

- [ ] **Step 2: 创建 network-aware 测试**

```typescript
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { NetworkAware } from '../../src/lib/network-aware';

describe('NetworkAware', () => {
  const originalConnection = (navigator as any).connection;

  afterEach(() => {
    Object.defineProperty(navigator, 'connection', {
      value: originalConnection,
      configurable: true,
    });
  });

  test('isExpensiveConnection returns false when connection API is unavailable', () => {
    Object.defineProperty(navigator, 'connection', {
      value: undefined,
      configurable: true,
    });
    expect(NetworkAware.isExpensiveConnection()).toBe(false);
  });

  test('isExpensiveConnection returns true for cellular type', () => {
    Object.defineProperty(navigator, 'connection', {
      value: { type: 'cellular', effectiveType: '4g' },
      configurable: true,
    });
    expect(NetworkAware.isExpensiveConnection()).toBe(true);
  });

  test('isExpensiveConnection returns true for 3g effective type', () => {
    Object.defineProperty(navigator, 'connection', {
      value: { type: 'wifi', effectiveType: '3g' },
      configurable: true,
    });
    expect(NetworkAware.isExpensiveConnection()).toBe(true);
  });

  test('isExpensiveConnection returns false for wifi 4g', () => {
    Object.defineProperty(navigator, 'connection', {
      value: { type: 'wifi', effectiveType: '4g' },
      configurable: true,
    });
    expect(NetworkAware.isExpensiveConnection()).toBe(false);
  });

  test('exceedsThreshold returns true when size exceeds 5MB default', () => {
    expect(NetworkAware.exceedsThreshold(6 * 1024 * 1024)).toBe(true);
  });

  test('exceedsThreshold returns false when size is under 5MB default', () => {
    expect(NetworkAware.exceedsThreshold(4 * 1024 * 1024)).toBe(false);
  });

  test('exceedsThreshold respects custom threshold', () => {
    expect(NetworkAware.exceedsThreshold(2 * 1024 * 1024, 1)).toBe(true);
    expect(NetworkAware.exceedsThreshold(500 * 1024, 1)).toBe(false);
  });

  test('shouldWarn returns true when expensive and exceeds threshold', () => {
    Object.defineProperty(navigator, 'connection', {
      value: { type: 'cellular', effectiveType: '4g' },
      configurable: true,
    });
    expect(NetworkAware.shouldWarn(6 * 1024 * 1024)).toBe(true);
  });

  test('shouldWarn returns false when not expensive', () => {
    Object.defineProperty(navigator, 'connection', {
      value: { type: 'wifi', effectiveType: '4g' },
      configurable: true,
    });
    expect(NetworkAware.shouldWarn(100 * 1024 * 1024)).toBe(false);
  });
});
```

- [ ] **Step 3: 运行测试，确认全部通过**

```bash
npm test
```

预期输出：49 个原有用例 + 新用例全部 PASS。

- [ ] **Step 4: 提交**

```bash
git add tests/unit/
git commit -m "test: 添加 RangeFetcher 和 NetworkAware 单元测试"
```

---

### Task 9: TODO.md 进度更新

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: 更新 TODO.md，标记视频预览已完成**

将 TODO.md 中的视频条目标记为已完成，或在文件末尾追加状态记录。

- [ ] **Step 2: 提交**

```bash
git add TODO.md
git commit -m "docs: 更新 TODO 进度"
```
