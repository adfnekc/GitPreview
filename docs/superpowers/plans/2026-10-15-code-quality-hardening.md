# Code-Quality Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise code quality without changing user-visible behavior: fix known defects, gate CI on `tsc` + ESLint, remove dead code, deduplicate shared logic, and split oversized modules.

**Architecture:** Extract small single-purpose libs (`logger`, `debounce`, `mime`, `download`, `instances`), move page orchestration out of `content.ts` into `controller.ts`, and split the `audio`/`powerpoint`/`video` handlers into focused modules. Then turn on strict TS flags and ESLint.

**Tech Stack:** TypeScript 5, Vite 5, Vitest 2, ESLint 9 + typescript-eslint 8, jsdom, Chrome MV3.

**Spec:** `docs/superpowers/specs/2026-10-15-code-quality-hardening-design.md`

**Global gates (must pass after every task):**
```bash
npm test
npm run build
```
(Tasks 8–9 add `npm run typecheck` and `npm run lint` to the gate.)

---

## File Structure (target)

| File | Responsibility | Action |
| --- | --- | --- |
| `src/lib/logger.ts` | dev-gated logging | create |
| `src/lib/debounce.ts` | generic debounce | create |
| `src/lib/mime.ts` | filename → MIME | create |
| `src/lib/download.ts` | trigger a file download | create |
| `src/lib/instances.ts` | self-hosted instance storage helpers | create |
| `src/controller.ts` | page observation + preview orchestration | create |
| `src/content.ts` | entry: register handlers + boot | rewrite thin |
| `src/preview/ui.ts` | DOM helpers incl. loading/run/insert | modify |
| `src/preview/audio/waveform.ts` | pure waveform helpers | create |
| `src/preview/audio/player.ts` | `AudioPlayer` class | create |
| `src/preview/audio/index.ts` | handler + open/close | rewrite thin |
| `src/preview/video/stream-player.ts` | `StreamVideoPlayer` | create |
| `src/preview/video/index.ts` | handler + open/close | rewrite thin |
| `src/preview/powerpoint/viewer.ts` | typed pptx viewer | create |
| `src/preview/powerpoint/index.ts` | load + shell + handler | rewrite thin |
| `src/utils.ts` | pure utils (dead code removed) | modify |
| `src/preview/registry.ts` | handler registry (dead export removed) | modify |
| `src/background.ts` | background logic (dedup + instances lib) | modify |
| `src/options/options.ts` | use instances lib | modify |
| `tsconfig.json`, `package.json`, `eslint.config.js`, `.github/workflows/ci.yml` | tooling | modify/create |
| `tests/unit/{registry,keyboard,mime,instances,manifest}.spec.ts` | new tests | create |
| `tests/unit/utils.spec.ts` | drop tests for removed helpers | modify |

---

### Task 1: Dev-gated logger + real debounce

**Files:**
- Create: `src/lib/logger.ts`
- Create: `src/lib/debounce.ts`
- Modify: `src/content.ts`

- [ ] **Step 1: Create `src/lib/logger.ts`**

```ts
const PREFIX = '[GitPreview]';

/** True only in `vite dev` / unminified builds; false in production. */
const debugEnabled = (() => {
  try {
    return import.meta.env?.DEV === true;
  } catch {
    return false;
  }
})();

export function debug(...args: unknown[]): void {
  if (debugEnabled) console.log(PREFIX, ...args);
}

export function warn(...args: unknown[]): void {
  console.warn(PREFIX, ...args);
}

export function error(...args: unknown[]): void {
  console.error(PREFIX, ...args);
}
```

- [ ] **Step 2: Create `src/lib/debounce.ts`**

```ts
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
```

- [ ] **Step 3: Use them in `src/content.ts` (fixes bug B1 and B7)**

Replace the import of utils lines at the top by adding:

```ts
import { debug } from './lib/logger';
import { debounce } from './lib/debounce';
```

Delete the local helper block:

```ts
function log(...args: unknown[]): void {
  console.log('[GitPreview]', ...args);
}
```

Replace every remaining `log(` call in `src/content.ts` with `debug(` (search for `log(` and replace; there are calls in `init`, `onUrlChanged`, `retryBlobPage`, `addPreviewButtons`, `handleBlobPage`, `insertBlobPageButton`, `openPreview`, `closeAll`).

Delete the local `debounce` function at the bottom of the observer section.

- [ ] **Step 4: Fix the observer so debounce is created once**

Replace the body of `observePageChanges` start:

```ts
function observePageChanges(): void {
  const scheduleAddButtons = debounce(addPreviewButtons, 200);
  const observer = new MutationObserver(() => {
    scheduleAddButtons();
  });
  observer.observe(document.body, { childList: true, subtree: true });
```

- [ ] **Step 5: Run gates**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/logger.ts src/lib/debounce.ts src/content.ts
git commit -m "refactor: add dev-gated logger and fix debounce usage"
```

---

### Task 2: Remove dead code and misleading settings

**Files:**
- Modify: `src/utils.ts`, `src/preview/audio/index.ts`, `src/preview/ui.ts`, `src/preview/registry.ts`, `src/content.ts`, `src/background.ts`
- Modify: `tests/unit/utils.spec.ts`

- [ ] **Step 1: Delete unused utils**

In `src/utils.ts`, delete `extractFilenameFromUrl` and `clamp`.

- [ ] **Step 2: Delete unused audio methods**

In `src/preview/audio/index.ts`, delete `isAudioExtension`, the `onError` method, `updateDuration`, and the `getCurrentPlayer` export.

- [ ] **Step 3: Delete unused UI helpers**

In `src/preview/ui.ts`, delete `showError` and `showErrorModal`.

- [ ] **Step 4: Delete unused registry export**

In `src/preview/registry.ts`, delete `getAllHandlers`.

- [ ] **Step 5: Simplify settings**

In `src/content.ts`, replace the settings block:

```ts
let settings = {
  autoPreview: true,
  previewMode: 'modal' as 'modal' | 'inline',
  keyboardShortcuts: true,
};
```

with:

```ts
let settings = { keyboardShortcuts: true };
```

and in `loadSettings` replace the `chrome.storage.sync.get({...})` defaults with `{ keyboardShortcuts: true }`.

- [ ] **Step 6: Simplify background defaults and drop dead actions**

In `src/background.ts`:
- Replace `DEFAULT_SETTINGS` with:

```ts
const DEFAULT_SETTINGS = { keyboardShortcuts: true };
```

- Delete the `getSettings` and `updateSettings` cases from the message listener.

- [ ] **Step 7: Update tests**

In `tests/unit/utils.spec.ts`, delete the `describe('extractFilenameFromUrl', ...)` and `describe('clamp', ...)` blocks and remove `extractFilenameFromUrl`, `clamp` from the import list.

- [ ] **Step 8: Run gates**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: remove dead code and unused settings"
```

---

### Task 3: Shared libs (mime, download, instances) + DRY helpers

**Files:**
- Create: `src/lib/mime.ts`, `src/lib/download.ts`, `src/lib/instances.ts`
- Modify: `src/preview/ui.ts`, `src/preview/audio/index.ts`, `src/preview/word/index.ts`, `src/preview/powerpoint/index.ts`, `src/preview/excel/index.ts`, `src/preview/font/index.ts`
- Modify: `src/background.ts`, `src/options/options.ts`

- [ ] **Step 1: Create `src/lib/mime.ts`**

```ts
const MIME_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
  aac: 'audio/aac',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}
```

- [ ] **Step 2: Create `src/lib/download.ts`**

```ts
export function downloadBuffer(buffer: ArrayBuffer, filename: string, mimeType: string): void {
  const blob = new Blob([buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 3: Create `src/lib/instances.ts`**

```ts
export const GITLAB_INSTANCES_KEY = 'gitlabInstances';
const SCRIPT_PREFIX = 'gitpreview-gitlab-';

export function instanceScriptId(origin: string): string {
  let host = origin;
  try {
    host = new URL(origin).host;
  } catch {
    /* keep origin */
  }
  return SCRIPT_PREFIX + host.replace(/[^a-z0-9.-]/gi, '_');
}

export function isInstanceScriptId(id: string): boolean {
  return id.startsWith(SCRIPT_PREFIX);
}

export function getInstanceOrigins(): Promise<string[]> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage?.sync) {
      resolve([]);
      return;
    }
    chrome.storage.sync.get({ [GITLAB_INSTANCES_KEY]: [] }, (result) => {
      resolve((result[GITLAB_INSTANCES_KEY] as string[]) ?? []);
    });
  });
}
```

- [ ] **Step 4: Add loading/run/insert helpers to `src/preview/ui.ts`**

Append:

```ts
export function renderLoading(filename: string): string {
  return `
    <div class="gitpreview-loading">
      <div class="gitpreview-spinner"></div>
      <div class="gitpreview-loading-text">Loading ${escapeHTML(filename)}...</div>
    </div>`;
}

export async function runContainerPreview(
  container: HTMLElement,
  filename: string,
  task: () => Promise<void>,
): Promise<void> {
  container.innerHTML = renderLoading(filename);
  try {
    await task();
  } catch (err) {
    console.error('GitPreview preview error:', err);
    container.innerHTML = renderErrorContent((err as Error).message || 'Failed to load file');
  }
}

export function insertBlobPageButton(btn: HTMLElement, site: SiteAdapter): boolean {
  for (const selector of site.blobButtonSelectors) {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) continue;

    const isActionElement = el.tagName === 'A' || el.tagName === 'BUTTON';
    if (isActionElement && el.parentElement) {
      el.parentElement.insertBefore(btn, el);
    } else {
      el.appendChild(btn);
    }
    return true;
  }

  const blobHeader = document.querySelector<HTMLElement>(
    '[class*="blob-header"], [class*="file-header"], [class*="BlobViewHeader"], .file-title-flex-parent',
  );
  if (blobHeader) {
    blobHeader.appendChild(btn);
    return true;
  }

  return false;
}
```

Add to the top of `ui.ts`:

```ts
import type { SiteAdapter } from '../sites/types';
```

- [ ] **Step 5: Update `content.ts` to import `insertBlobPageButton` from ui and delete the local copy**

Remove the local `insertBlobPageButton` function; add `insertBlobPageButton` to the existing `./preview/ui` import list. Logging inside the removed function disappears.

- [ ] **Step 6: Convert the container handlers to `runContainerPreview`**

In `src/preview/excel/index.ts`, `word/index.ts`, `font/index.ts`, replace the pattern

```ts
container.innerHTML = `...loading...`;
try {
  ...
} catch (err) {
  console.error(...);
  container.innerHTML = renderErrorContent(...);
}
```

with:

```ts
await runContainerPreview(container, filename, async () => {
  ...body without the loading assignment and without try/catch...
});
```

(Keep imports consistent: import `runContainerPreview` from `../ui`.)

For `font/index.ts`, the function is `openFontPreview` and already imports `renderErrorContent`; replace the outer `try/catch` + loading assignment with `runContainerPreview`.

- [ ] **Step 7: Use `getMimeType` + `downloadBuffer` in audio/word/powerpoint**

- `audio/index.ts`: delete `getAudioMimeType`; in `download()` call `downloadBuffer(this.arrayBuffer, this.filename, getMimeType(this.filename))` (guard `this.arrayBuffer` non-null).
- `word/index.ts`: keep the anchor-based download (it points at the raw URL) — no change; but remove the now-unused `renderErrorContent` import if `runContainerPreview` replaced it.
- `powerpoint/index.ts`: replace the inline download body with `downloadBuffer(arrayBuffer, filename, getMimeType(filename))`.

- [ ] **Step 8: Deduplicate background fetch + use instances lib**

In `src/background.ts`:
- Import: `import { arrayBufferToBase64 } from './utils';` and `import { getInstanceOrigins, instanceScriptId, isInstanceScriptId } from './lib/instances';`
- Delete the local `arrayBufferToBase64` and the `fetchAudio` function.
- In the message switch, delete `case 'fetchAudio'` and keep `case 'fetchBinary'` calling `fetchBinary(request.url, sendResponse)` (rename the function `fetchAudio` → `fetchBinaryData`; update the `case`).

```ts
    case 'fetchBinary':
      fetchBinaryData(request.url, sendResponse);
      return true;
```

- Replace `GITLAB_INSTANCES_KEY`, `INSTANCE_SCRIPT_PREFIX`, `instanceScriptId`, `getInstanceOrigins` definitions with imports; update `syncInstanceContentScripts` to use `isInstanceScriptId(id)` instead of `id.startsWith(INSTANCE_SCRIPT_PREFIX)`.

- [ ] **Step 9: Use instances lib in `src/options/options.ts`**

Import `GITLAB_INSTANCES_KEY`, `instanceScriptId` from `../lib/instances`; delete the local `STORAGE_KEY`, `scriptIdFor`, and replace usages.

- [ ] **Step 10: Update `audio/index.ts`'s background fetch to `fetchBinary`**

Replace `fetchAudioFromBackground(url)` with `fetchBinary(url)` from `../../lib/range-fetcher`; delete `fetchAudioFromBackground`.

- [ ] **Step 11: Run gates**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "refactor: extract shared mime/download/instances/loading helpers"
```

---

### Task 4: Video handler cleanup

**Files:**
- Create: `src/preview/video/stream-player.ts`
- Modify: `src/preview/video/index.ts`

- [ ] **Step 1: Create `src/preview/video/stream-player.ts`**

```ts
import { RangeFetcher, type FileInfo, fetchBinary } from '../../lib/range-fetcher';
import { getMimeType } from '../../lib/mime';

const CHUNK_SIZE = 1024 * 1024; // 1 MB

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
  private container: HTMLElement | null = null;
  private fileInfo: FileInfo | null = null;
  private loadedBytes = 0;
  private loading = false;
  private aborted = false;

  constructor(url: string, filename: string) {
    this.url = url;
    this.filename = filename;
  }

  async init(container: HTMLElement, fileInfo: FileInfo): Promise<void> {
    this.container = container;
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
    if (!this.mediaSource || !this.fileInfo) return;

    const mimeType = this.fileInfo.mimeType || getMimeType(this.filename);
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
      if (this.aborted || !this.sourceBuffer || this.sourceBuffer.updating) {
        this.loading = false;
        if (!this.aborted) this.loadNextChunk();
        return;
      }
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
    const blob = new Blob([arrayBuffer], { type: this.fileInfo?.mimeType || getMimeType(this.filename) });
    this.video.src = URL.createObjectURL(blob);
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
    this.container = null;
  }
}
```

- [ ] **Step 2: Rewrite `src/preview/video/index.ts`**

```ts
import { type PreviewHandler } from '../handler';
import { escapeHTML } from '../../utils';
import { RangeFetcher, type FileInfo } from '../../lib/range-fetcher';
import { NetworkAware } from '../../lib/network-aware';
import { renderErrorContent, renderLoading, runContainerPreview } from '../ui';
import { StreamVideoPlayer } from './stream-player';

export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi', 'mkv'];

let currentPlayer: StreamVideoPlayer | null = null;

export async function openVideoPreview(
  url: string,
  filename: string,
  container: HTMLElement,
): Promise<void> {
  closeVideoPreview();
  const fileInfo: FileInfo = await RangeFetcher.getFileInfo(url);

  if (NetworkAware.shouldWarn(fileInfo.size)) {
    const confirmed = await NetworkAware.confirmLoad(filename, fileInfo.size);
    if (!confirmed) {
      container.innerHTML = renderErrorContent('Loading cancelled on cellular network.');
      return;
    }
  }

  const blobTarget = document.querySelector('.gitpreview-blob-target');
  if (blobTarget) (blobTarget as HTMLElement).style.display = 'none';

  await runContainerPreview(container, filename, async () => {
    currentPlayer = new StreamVideoPlayer(url, filename);
    await currentPlayer.init(container, fileInfo);
  });
}

export function closeVideoPreview(): void {
  currentPlayer?.destroy();
  currentPlayer = null;
}

export const videoHandler: PreviewHandler = {
  extensions: VIDEO_EXTENSIONS,
  openPreview(rawUrl: string, filename: string, container?: HTMLElement) {
    if (!container) return;
    void openVideoPreview(rawUrl, filename, container);
  },
  close: closeVideoPreview,
};
```

Note: `escapeHTML` and `renderLoading` imports are only needed if referenced; remove any unused import to satisfy lint. `runContainerPreview` sets the loading HTML, so `renderLoading`/`escapeHTML` are not needed in this file — omit them.

- [ ] **Step 3: Run gates**

Run: `npm test && npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/preview/video
git commit -m "refactor(video): single HEAD, shared fetch, deduped retry"
```

---

### Task 5: Split `content.ts` into `controller.ts`

**Files:**
- Create: `src/controller.ts`
- Modify: `src/content.ts`

- [ ] **Step 1: Move orchestration into `src/controller.ts`**

Move from `content.ts` into `controller.ts` (module-scope, exported `start()`):
`settings`, `isInitialized`, `_currentPreviewBlobPath`, `_urlChangeTimer`, `_unbindKeyboardShortcuts`, `init()`, `loadSettings()`, `observePageChanges()`, `onUrlChanged()`, `retryBlobPage()`, `addPreviewButtons()`, `handleBlobPage()`, `openPreview()`, `closeAll()`, `safeInit()`, `start()` (rename exported), the `window.addEventListener('load', ...)` boot line, and the keyboard binding.

`controller.ts` imports `getActiveSite`, `SiteAdapter`, `getFileExtension`, all `preview/ui` helpers, `registry` helpers, audio keyboard controls, `bindKeyboardShortcuts`, `logger`, `debounce`.

```ts
import { getFileExtension } from './utils';
import { getActiveSite } from './sites/index';
import { debug } from './lib/logger';
import { debounce } from './lib/debounce';
import {
  createPreviewButton,
  updatePreviewButtonState,
  removeExistingPlayer,
  removeExistingModal,
  showLoading,
  showLoadingModal,
  getCurrentPreviewContent,
} from './preview/ui';
import { getHandler, isSupported, closeAllHandlers } from './preview/registry';
import { togglePlay, rewind, forward, setVolume, getVolume } from './preview/audio/index';
import { bindKeyboardShortcuts } from './preview/keyboard';

export function start(): void {
  /* former safeInit body */
}
```

- [ ] **Step 2: Make `src/content.ts` a thin entry**

```ts
/**
 * GitPreview content script entry.
 *
 * Handlers are registered here; page orchestration lives in `controller.ts`.
 */
import { audioHandler } from './preview/audio/index';
import { pdfHandler } from './preview/pdf/index';
import { videoHandler } from './preview/video/index';
import { fontHandler } from './preview/font/index';
import { wordHandler } from './preview/word/index';
import { excelHandler } from './preview/excel/index';
import { powerPointHandler } from './preview/powerpoint/index';
import { registerHandler } from './preview/registry';
import { start } from './controller';
import './preview/preview.css';

registerHandler(audioHandler);
registerHandler(pdfHandler);
registerHandler(videoHandler);
registerHandler(fontHandler);
registerHandler(wordHandler);
registerHandler(excelHandler);
registerHandler(powerPointHandler);

start();
```

- [ ] **Step 3: Verify no duplicate boot**

Ensure `safeInit()` logic and the `load` listener live only in `controller.ts` and are invoked by `start()`.

- [ ] **Step 4: Run gates**

Run: `npm test && npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/content.ts src/controller.ts
git commit -m "refactor: split preview orchestration into controller module"
```

---

### Task 6: Split the audio module

**Files:**
- Create: `src/preview/audio/waveform.ts`
- Create: `src/preview/audio/player.ts`
- Modify: `src/preview/audio/index.ts`

- [ ] **Step 1: Create `src/preview/audio/waveform.ts`**

```ts
const SAMPLE_COUNT = 200;

export function computeWaveform(channelData: Float32Array, samples = SAMPLE_COUNT): number[] {
  const blockSize = Math.max(1, Math.floor(channelData.length / samples));
  const values: number[] = [];

  for (let i = 0; i < samples; i++) {
    let sum = 0;
    for (let j = 0; j < blockSize; j++) {
      sum += Math.abs(channelData[i * blockSize + j] ?? 0);
    }
    values.push(sum / blockSize);
  }

  const max = Math.max(...values);
  return max > 0 ? values.map((value) => value / max) : values;
}

export function drawWaveform(canvas: HTMLCanvasElement, data: number[]): void {
  const ctx = canvas.getContext('2d');
  if (!ctx || data.length === 0) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const { width, height } = rect;
  const barWidth = width / data.length;
  const barGap = 1;

  ctx.clearRect(0, 0, width, height);

  data.forEach((value, index) => {
    const barHeight = Math.max(2, value * height * 0.8);
    const x = index * barWidth;
    const y = (height - barHeight) / 2;

    const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
    gradient.addColorStop(0, '#8b949e');
    gradient.addColorStop(0.5, '#6e7681');
    gradient.addColorStop(1, '#8b949e');

    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, barWidth - barGap, barHeight);
  });
}
```

- [ ] **Step 2: Create `src/preview/audio/player.ts`**

Move the `GitPreviewAudioPlayer` class here verbatim, renamed `AudioPlayer`, with these changes:
- Fields declared `private` except `volume` (kept public, read by `getVolume`).
- `arrayBuffer: ArrayBuffer | null`.
- `this.waveformData = computeWaveform(this.audioBuffer.getChannelData(0))` and `drawWaveform(canvas, this.waveformData)` from `./waveform`.
- Import `type { PreviewHandler }`-free; import `escapeHTML`/`formatTime` from `../../utils`; `downloadBuffer` from `../../lib/download`; `getMimeType` from `../../lib/mime`.
- Delete the class-local `formatTime` and call `formatTime` from utils.
- `destroy()` sets `this.arrayBuffer = null`.
- Replace `this.elements.totalTime!.textContent` with `this.setText('totalTime', ...)` helper that no-ops on null (add private `setText(key, text)`).
- `download()` guards `if (!this.arrayBuffer) return;`.

Export `class AudioPlayer` and `type AudioPlayerOptions`.

- [ ] **Step 3: Rewrite `src/preview/audio/index.ts`**

```ts
import { type PreviewHandler } from '../handler';
import { fetchBinary } from '../../lib/range-fetcher';
import { runContainerPreview } from '../ui';
import { AudioPlayer } from './player';

export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];

let currentPlayer: AudioPlayer | null = null;

export async function openAudioPreview(
  url: string,
  filename: string,
  container: HTMLElement,
): Promise<void> {
  closeAudioPreview();
  await runContainerPreview(container, filename, async () => {
    const arrayBuffer = await fetchBinary(url);
    currentPlayer = new AudioPlayer({ url, filename, arrayBuffer });
    container.innerHTML = '';
    container.appendChild(currentPlayer.render());
  });
}

export function closeAudioPreview(): void {
  currentPlayer?.destroy();
  currentPlayer = null;
}

export function togglePlay(): void {
  currentPlayer?.togglePlay();
}

export function rewind(seconds: number): void {
  currentPlayer?.rewind(seconds);
}

export function forward(seconds: number): void {
  currentPlayer?.forward(seconds);
}

export function setVolume(percent: number): void {
  currentPlayer?.setVolume(percent);
}

export function getVolume(): number {
  return currentPlayer ? currentPlayer.volume * 100 : 100;
}

export const audioHandler: PreviewHandler = {
  extensions: AUDIO_EXTENSIONS,
  openPreview(rawUrl: string, filename: string, container?: HTMLElement) {
    if (!container) return;
    void openAudioPreview(rawUrl, filename, container);
  },
  close: closeAudioPreview,
};
```

- [ ] **Step 4: Run gates**

Run: `npm test && npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/preview/audio
git commit -m "refactor(audio): split player and waveform into focused modules"
```

---

### Task 7: Split the PowerPoint module and type it

**Files:**
- Create: `src/preview/powerpoint/viewer.ts`
- Modify: `src/preview/powerpoint/index.ts`

- [ ] **Step 1: Create `src/preview/powerpoint/viewer.ts`**

```ts
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
  previewer: PptxPreviewer;
  showSlide(index: number): void;
  dispose(): void;
}

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

  const applyTransform = (): void => {
    const slide = stage.firstElementChild as HTMLElement | null;
    if (!slide) return;
    const intW = slide.offsetWidth;
    const intH = slide.offsetHeight;
    const vpW = viewport.clientWidth;
    const vpH = viewport.clientHeight;
    if (!intW || !intH || vpW <= 0 || vpH <= 0) return;

    const scale = Math.min(vpW / intW, vpH / intH, 1) * zoom;
    slide.style.cssText +=
      `position:relative;margin:0;transform-origin:0 0;flex-shrink:0;` +
      `transform:translate(${panX}px, ${panY}px) scale(${scale});`;

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

  const onWheel = (event: WheelEvent): void => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const factor = 1 + Math.abs(event.deltaY) / 200;
    zoom = event.deltaY > 0 ? Math.min(5, zoom * factor) : Math.max(0.1, zoom / factor);
    if (zoom <= 1) { panX = 0; panY = 0; }
    applyTransform();
  };

  const onMouseDown = (event: MouseEvent): void => {
    const slide = stage.firstElementChild as HTMLElement | null;
    if (!slide) return;
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

  let currentIndex = 0;
  const slides: HTMLElement[] = [];

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

  const setZoom = (next: number): void => {
    zoom = Math.min(5, Math.max(0.1, next));
    if (zoom <= 1) { panX = 0; panY = 0; }
    applyTransform();
  };

  return {
    previewer,
    showSlide,
    setZoom,
    resetZoom: () => setZoom(1),
    dispose: () => {
      viewport.removeEventListener('wheel', onWheel);
      viewport.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('resize', onResize);
      try {
        previewer.destroy();
      } catch {
        /* ignore */
      }
    },
  };
}
```

Adjust the exported `PptxViewer` interface to include `setZoom`/`resetZoom` used by the shell (declare them explicitly).

- [ ] **Step 2: Rewrite `src/preview/powerpoint/index.ts`**

Keep: loading via `runContainerPreview`, header/shell HTML, `fetchBinary`, metadata, slide pre-render (`for` loop calling `previewer.htmlRender.renderSlide(i)`, pushing `previewer.wrapper.querySelectorAll('.pptx-preview-slide-wrapper')` into the viewer's slide list — expose a `collectSlides()` on `PptxViewer` or pass the selector), navigation buttons, zoom buttons, fullscreen button, keyboard handler, download via `downloadBuffer`.

Remove all module-level mutable state; keep only `let currentViewer: PptxViewer | null` for `closePowerPointPreview`.

```ts
let currentViewer: PptxViewer | null = null;
let boundKeydown: ((e: KeyboardEvent) => void) | null = null;

export function closePowerPointPreview(): void {
  if (boundKeydown) {
    document.removeEventListener('keydown', boundKeydown);
    boundKeydown = null;
  }
  currentViewer?.dispose();
  currentViewer = null;
}
```

- [ ] **Step 3: Run gates**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 4: Manual smoke (optional but recommended)**

Load `dist/` unpacked and open a `.pptx` in `test_files/` via the local GitLab-shaped server used previously (or defer to Task 11).

- [ ] **Step 5: Commit**

```bash
git add src/preview/powerpoint
git commit -m "refactor(powerpoint): typed viewer module without module globals"
```

---

### Task 8: Enable strict TypeScript flags

**Files:**
- Modify: `tsconfig.json`, `package.json`

- [ ] **Step 1: Update `tsconfig.json`**

```jsonc
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["chrome"],
    "isolatedModules": true
  },
  "include": ["src", "tests/unit"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 2: Add the `typecheck` script**

In `package.json` `scripts`, add:

```json
"typecheck": "tsc --noEmit",
```

- [ ] **Step 3: Fix every reported error**

Run: `npm run typecheck`
Expected: errors listed. Fix them:
- `noUncheckedIndexedAccess`: add `?? 0` / guards where arrays are indexed (waveform, registry map lookups already guarded).
- `noUnusedParameters`: rename unused params to `_name`.
- `noImplicitReturns`: add explicit `return;` / `return undefined;` where a function mixes `return x` and bare `return`.
- Any remaining null-safety issues: use early returns, not `!`.

Run `npm run typecheck` until it exits 0. Do not add `// @ts-ignore`.

- [ ] **Step 4: Run gates**

Run: `npm run typecheck && npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tsconfig.json package.json src tests
git commit -m "chore: enable strict TS flags and add typecheck script"
```

---

### Task 9: Add ESLint

**Files:**
- Create: `eslint.config.js`
- Modify: `package.json`, `.github/workflows/ci.yml`

- [ ] **Step 1: Install dev dependencies**

Run:
```bash
npm install -D eslint@^9 typescript-eslint@^8 jsdom@^30
```
Expected: `package.json` and `package-lock.json` updated.

- [ ] **Step 2: Create `eslint.config.js`**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'vendor/**', 'release/**', 'dist/**/*.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['src/lib/logger.ts', 'src/preview/pdf/pdf-viewer-loader.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['tests/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off', 'no-console': 'off' },
  },
);
```

- [ ] **Step 3: Add scripts**

In `package.json` `scripts`:

```json
"lint:js": "eslint .",
"lint": "prettier --check \"src/**/*.ts\" \"tests/**/*.ts\" && eslint .",
"format": "prettier --write \"src/**/*.ts\" \"tests/**/*.ts\""
```

- [ ] **Step 4: Fix ESLint violations**

Run: `npm run lint:js`
Expected: warnings/errors. Fix all errors. For `no-console` warnings, route through `src/lib/logger.ts` or keep the allowlisted files. Re-run until clean (`--max-warnings=0` is not required, but aim for zero).

- [ ] **Step 5: Update CI**

In `.github/workflows/ci.yml`, in the `lint` job after `npm ci`, add:

```yaml
      - run: npm run typecheck
      - run: npm run lint
```

(Replace the existing `npx prettier --check ...` step with `npm run lint`.)

- [ ] **Step 6: Run gates**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add eslint.config.js package.json package-lock.json .github/workflows/ci.yml
git commit -m "chore: add ESLint and gate CI on typecheck + lint"
```

---

### Task 10: Add unit tests

**Files:**
- Create: `tests/unit/registry.spec.ts`, `tests/unit/keyboard.spec.ts`, `tests/unit/mime.spec.ts`, `tests/unit/instances.spec.ts`, `tests/unit/manifest.spec.ts`

- [ ] **Step 1: `tests/unit/registry.spec.ts`**

```ts
import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  registerHandler,
  getHandler,
  isSupported,
  closeAllHandlers,
} from '../../src/preview/registry';
import type { PreviewHandler } from '../../src/preview/handler';

function makeHandler(extensions: string[], onClose?: () => void): PreviewHandler {
  return { extensions, openPreview: () => {}, close: onClose };
}

describe('registry', () => {
  test('getHandler returns the handler for an extension', () => {
    const handler = makeHandler(['zzz']);
    registerHandler(handler);
    expect(getHandler('zzz')).toBe(handler);
    expect(isSupported('zzz')).toBe(true);
  });

  test('isSupported is false for unknown extensions', () => {
    expect(isSupported('nope')).toBe(false);
  });

  test('closeAllHandlers calls every registered close()', () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    registerHandler(makeHandler(['aaa'], closeA));
    registerHandler(makeHandler(['bbb'], closeB));
    closeAllHandlers();
    expect(closeA).toHaveBeenCalled();
    expect(closeB).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: `tests/unit/keyboard.spec.ts`** (jsdom)

```ts
// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest';
import { bindKeyboardShortcuts } from '../../src/preview/keyboard';

function makePlayer() {
  return {
    togglePlay: vi.fn(),
    rewind: vi.fn(),
    forward: vi.fn(),
    setVolume: vi.fn(),
    getVolume: vi.fn(() => 50),
  };
}

describe('bindKeyboardShortcuts', () => {
  test('does nothing when keyboardShortcuts is disabled', () => {
    const closeAll = vi.fn();
    const player = makePlayer();
    const unbind = bindKeyboardShortcuts({ keyboardShortcuts: false }, closeAll, player);
    const preview = document.createElement('div');
    preview.id = 'gitpreview-inline';
    document.body.appendChild(preview);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(player.togglePlay).not.toHaveBeenCalled();
    unbind();
    preview.remove();
  });

  test('toggles play on space when a preview is open', () => {
    const closeAll = vi.fn();
    const player = makePlayer();
    const preview = document.createElement('div');
    preview.id = 'gitpreview-inline';
    document.body.appendChild(preview);
    const unbind = bindKeyboardShortcuts({ keyboardShortcuts: true }, closeAll, player);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(player.togglePlay).toHaveBeenCalledTimes(1);
    unbind();
    preview.remove();
  });

  test('closes on Escape and unbinds cleanly', () => {
    const closeAll = vi.fn();
    const player = makePlayer();
    const preview = document.createElement('div');
    preview.id = 'gitpreview-modal-overlay';
    document.body.appendChild(preview);
    const unbind = bindKeyboardShortcuts({ keyboardShortcuts: true }, closeAll, player);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closeAll).toHaveBeenCalled();
    unbind();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closeAll).toHaveBeenCalledTimes(1);
    preview.remove();
  });
});
```

- [ ] **Step 3: `tests/unit/mime.spec.ts`**

```ts
import { describe, test, expect } from 'vitest';
import { getMimeType } from '../../src/lib/mime';

describe('getMimeType', () => {
  test('maps known extensions', () => {
    expect(getMimeType('a.mp3')).toBe('audio/mpeg');
    expect(getMimeType('dir/b.MP4')).toBe('video/mp4');
    expect(getMimeType('c.docx')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  test('falls back to octet-stream', () => {
    expect(getMimeType('file.unknown')).toBe('application/octet-stream');
    expect(getMimeType('noextension')).toBe('application/octet-stream');
  });
});
```

- [ ] **Step 4: `tests/unit/instances.spec.ts`**

```ts
import { describe, test, expect } from 'vitest';
import { instanceScriptId, isInstanceScriptId } from '../../src/lib/instances';

describe('instanceScriptId', () => {
  test('builds a stable id from the origin host', () => {
    expect(instanceScriptId('https://gitlab.example.com')).toBe(
      'gitpreview-gitlab-gitlab.example.com',
    );
    expect(instanceScriptId('https://gitlab.example.com/sub')).toBe(
      'gitpreview-gitlab-gitlab.example.com',
    );
  });

  test('isInstanceScriptId recognizes generated ids', () => {
    expect(isInstanceScriptId(instanceScriptId('https://gl.test'))).toBe(true);
    expect(isInstanceScriptId('other-id')).toBe(false);
  });
});
```

- [ ] **Step 5: `tests/unit/manifest.spec.ts`**

```ts
import { describe, test, expect } from 'vitest';
import manifest from '../../manifest.json';
import pkg from '../../package.json';

describe('manifest', () => {
  test('version matches package.json', () => {
    expect(manifest.version).toBe(pkg.version);
  });

  test('declares gitlab.com host and content script', () => {
    expect(manifest.host_permissions).toContain('https://gitlab.com/*');
    expect(manifest.content_scripts[0]?.matches).toContain('https://gitlab.com/*');
  });
});
```

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: all suites PASS.

- [ ] **Step 7: Commit**

```bash
git add tests/unit
git commit -m "test: cover registry, keyboard, mime, instances, manifest"
```

---

### Task 11: Docs + final verification

**Files:**
- Modify: `CONTRIBUTING.md`
- Verification only

- [ ] **Step 1: Update `CONTRIBUTING.md`**

- Add to "Quick start" commands: `npm run typecheck` and `npm run lint`.
- In "Architecture", add the new libs:

```
  lib/
    debounce.ts       ← Generic debounce.
    download.ts       ← Blob download helper.
    instances.ts      ← Self-hosted instance storage helpers.
    logger.ts         ← Dev-gated logging.
    mime.ts           ← Filename → MIME map.
```

- Add: `src/controller.ts ← Page observation + preview orchestration.`

- [ ] **Step 2: Run the full gate**

Run:
```bash
npm run typecheck && npm run lint && npm test && npm run build
```
Expected: all PASS.

- [ ] **Step 3: Behavior smoke test**

Repeat the verification from the GitLab work:
1. Load `dist/` unpacked; open a gitlab.com blob page for a `.pdf` → preview button appears in `.file-actions`.
2. Open a gitlab.com tree page with supported files → icon buttons appear in `[data-testid="file-row-container"]`.
3. Against the local GitLab-shaped server, confirm audio/video/word/excel/ppt render inline with `.blob-viewer` hidden.

- [ ] **Step 4: Confirm no console noise**

Inspect the background/content pages: no `[GitPreview]` info logs in the production build.

- [ ] **Step 5: Final commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs: document code-quality tooling and new libs"
```

---

## Notes for the implementer

- `git push` requires explicit user approval (see `AGENTS.md`). Commit locally only.
- Run the four gates after **every** task; never leave a task with a red build.
- Do not change DOM class names, `manifest.json` permissions/matches, or URL conversion logic — behavior must stay identical.
- Prefer early returns over non-null assertions; ESLint error on `any` and `!`-free is enforced.
