# GitLab Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full preview support for gitlab.com and self-hosted GitLab instances by extracting a per-site adapter abstraction shared with GitHub.

**Architecture:** A `SiteAdapter` interface owns all host-specific behavior (page detection, blob→raw URL conversion, DOM selectors, button mounting). `content.ts`/`ui.ts` resolve the active adapter via `getActiveSite()`. Self-hosted instances are added through an options page that requests origin permission; the background worker registers content scripts dynamically for granted origins.

**Tech Stack:** TypeScript, Vite (MV3 bundles), Vitest, Chrome Extension APIs (`storage`, `scripting`, `permissions`, `declarativeNetRequest`).

**Spec:** `docs/superpowers/specs/2026-10-15-gitlab-support-design.md`

**Verification commands:**
- `npm test` — unit tests
- `npm run build` — production build to `dist/`
- `npm run lint` — prettier check

---

## File Structure

| File | Responsibility | Action |
| --- | --- | --- |
| `src/sites/types.ts` | `SiteAdapter` interface + `SiteId` | create |
| `src/sites/github.ts` | GitHub adapter (extracted from current logic) | create |
| `src/sites/gitlab.ts` | GitLab adapter | create |
| `src/sites/index.ts` | `detectSite` / `getActiveSite` | create |
| `src/content.ts` | preview engine — route through active site | modify |
| `src/preview/ui.ts` | DOM insertion helpers — site selectors | modify |
| `src/preview/handler.ts` | drop `getBlobButtonSelector` | modify |
| `src/preview/{audio,excel,font,pdf,powerpoint,video,word}/index.ts` | drop boilerplate | modify |
| `options.html` | options page markup | create |
| `src/options/options.ts` | options page logic | create |
| `src/options/options.css` | options page styles | create |
| `src/background.ts` | dynamic content-script registration | modify |
| `manifest.json` | hosts, permissions, options_ui, version | modify |
| `vite.config.ts` | add options.html input | modify |
| `tests/unit/sites.spec.ts` | adapter tests | create |
| `tests/unit/utils.spec.ts` | fix test handler registration | modify |
| `README.md`, `CONTRIBUTING.md`, `package.json` | docs + version | modify |

---

### Task 1: SiteAdapter interface + GitHub adapter

**Files:**
- Create: `src/sites/types.ts`
- Create: `src/sites/github.ts`
- Test: `tests/unit/sites.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/sites.spec.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { githubAdapter } from '../../src/sites/github';
import { convertToRawUrl } from '../../src/utils';

describe('githubAdapter', () => {
  test('matches github.com hosts', () => {
    expect(githubAdapter.matches(new URL('https://github.com/user/repo/blob/main/a.mp3'))).toBe(
      true,
    );
    expect(githubAdapter.matches(new URL('https://gitlab.com/g/p/-/blob/main/a.mp3'))).toBe(false);
  });

  test('isBlobPage / isTreePage', () => {
    expect(githubAdapter.isBlobPage('https://github.com/user/repo/blob/main/a.mp3')).toBe(true);
    expect(githubAdapter.isBlobPage('https://github.com/user/repo/tree/main')).toBe(false);
    expect(githubAdapter.isTreePage('https://github.com/user/repo/tree/main')).toBe(true);
  });

  test('toRawUrl matches utils.convertToRawUrl', () => {
    const url = 'https://github.com/user/repo/blob/main/test.mp3';
    expect(githubAdapter.toRawUrl(url)).toBe(convertToRawUrl(url));
  });

  test('getBlobPath extracts the file path', () => {
    expect(githubAdapter.getBlobPath('https://github.com/user/repo/blob/main/dir/a.mp3')).toBe(
      'main/dir/a.mp3',
    );
    expect(githubAdapter.getBlobPath('https://github.com/user/repo/tree/main')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/sites.spec.ts`
Expected: FAIL — cannot resolve `../../src/sites/github`.

- [ ] **Step 3: Create `src/sites/types.ts`**

```ts
export type SiteId = 'github' | 'gitlab';

export interface SiteAdapter {
  id: SiteId;

  /** Whether the current URL belongs to this site. */
  matches(url: URL): boolean;

  /** Whether the URL is a single-file (blob) page. */
  isBlobPage(url: string): boolean;

  /** Whether the URL is a directory (tree) page. */
  isTreePage(url: string): boolean;

  /** Convert a blob page URL to the direct raw-file URL. Empty string if not applicable. */
  toRawUrl(blobUrl: string): string;

  /** File path after the blob marker, used to dedupe SPA navigation. Null when not a blob page. */
  getBlobPath(url: string): string | null;

  /** Selector for file links inside a directory listing. */
  fileLinkSelector: string;

  /** Whether a directory link points at a file (not a folder). */
  isFileLink(link: HTMLAnchorElement): boolean;

  /** Display filename for a directory link. */
  getLinkFilename(link: HTMLAnchorElement): string;

  /** Mount the preview button within a directory row. */
  mountTreeButton(link: HTMLAnchorElement, btn: HTMLElement): void;

  /** Ordered selectors for where to place the blob-page preview button. */
  blobButtonSelectors: string[];

  /** Ordered targets for the inline preview container; the matched element is hidden. */
  inlineInsertSelectors: string[];

  /** Fallback repo-content containers for inline insertion (appended, not hidden). */
  repoContentSelectors: string[];
}
```

- [ ] **Step 4: Create `src/sites/github.ts`**

```ts
import { convertToRawUrl, isBlobPage, isTreePage } from '../utils';
import type { SiteAdapter } from './types';

const BLOB_PATH_RE = /\/blob\/(.+?)(?:\?|#|$)/;

export const githubAdapter: SiteAdapter = {
  id: 'github',

  matches(url) {
    return url.hostname === 'github.com' || url.hostname.endsWith('.github.com');
  },

  isBlobPage: (url) => isBlobPage(url),
  isTreePage: (url) => isTreePage(url),
  toRawUrl: (blobUrl) => convertToRawUrl(blobUrl),

  getBlobPath(url) {
    const match = url.match(BLOB_PATH_RE);
    return match ? match[1] : null;
  },

  fileLinkSelector: 'a[href*="/blob/"]',
  isFileLink: () => true,

  getLinkFilename(link) {
    const href = link.getAttribute('href') || '';
    return link.textContent?.trim() || href.split('/').pop() || '';
  },

  mountTreeButton(link, btn) {
    const truncateContainer = link.closest('.react-directory-truncate');
    if (truncateContainer) {
      truncateContainer.appendChild(btn);
    } else {
      link.after(btn);
    }
  },

  blobButtonSelectors: [
    'button[data-testid="download-raw-button"]',
    '[class*="react-blob-header-edit-and-raw-actions"]',
    'a[data-testid="raw-button"]',
    'a[href*="/raw/"]',
    'a#raw-url',
    '[class*="react-blob-header-actions"]',
    '[class*="BlobViewHeader-module"]',
    '.file-actions',
    '[data-testid="file-header"]',
    '.react-blob-header',
    '.Box-header .d-flex',
    '.Box-header',
  ],

  inlineInsertSelectors: [
    '[class*="BlobViewContent-module__blobContentWrapper"]',
    '[class*="BlobContent-module__blobContentSection"]',
    '[data-testid="blob-content"]',
    '.blob-wrapper',
    '.Box-body',
    '.react-code-view',
    '[data-testid="file-content"]',
  ],

  repoContentSelectors: [
    '.repository-content',
    '[data-testid="repo-content"]',
    '[id="repo-content-pjax-container"]',
    '[class*="PageLayout-PageLayoutContent"]',
    'main',
    '#js-repo-pjax-container',
  ],
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/sites.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/sites/types.ts src/sites/github.ts tests/unit/sites.spec.ts
git commit -m "feat(sites): add site adapter interface and GitHub adapter"
```

---

### Task 2: GitLab adapter + site detection

**Files:**
- Create: `src/sites/gitlab.ts`
- Create: `src/sites/index.ts`
- Test: `tests/unit/sites.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/sites.spec.ts`:

```ts
import { gitlabAdapter } from '../../src/sites/gitlab';
import { detectSite } from '../../src/sites/index';

describe('gitlabAdapter', () => {
  test('matches GitLab blob/tree/raw paths (any host, any sub-path)', () => {
    expect(gitlabAdapter.matches(new URL('https://gitlab.com/g/p/-/blob/main/a.mp3'))).toBe(true);
    expect(gitlabAdapter.matches(new URL('https://gl.example.com/pfx/g/p/-/tree/main'))).toBe(true);
    expect(gitlabAdapter.matches(new URL('https://gitlab.com/g/p'))).toBe(false);
  });

  test('isBlobPage / isTreePage', () => {
    expect(gitlabAdapter.isBlobPage('https://gitlab.com/g/p/-/blob/main/a.mp3')).toBe(true);
    expect(gitlabAdapter.isBlobPage('https://gitlab.com/g/p/-/tree/main')).toBe(false);
    expect(gitlabAdapter.isTreePage('https://gitlab.com/g/p/-/tree/main')).toBe(true);
  });

  test('toRawUrl converts /-/blob/ to /-/raw/', () => {
    expect(gitlabAdapter.toRawUrl('https://gitlab.com/g/p/-/blob/main/dir/a.mp3')).toBe(
      'https://gitlab.com/g/p/-/raw/main/dir/a.mp3',
    );
  });

  test('toRawUrl supports self-hosted sub-path instances', () => {
    expect(gitlabAdapter.toRawUrl('https://gl.example.com/gitlab/g/p/-/blob/main/a.pdf')).toBe(
      'https://gl.example.com/gitlab/g/p/-/raw/main/a.pdf',
    );
  });

  test('toRawUrl strips query and hash', () => {
    expect(gitlabAdapter.toRawUrl('https://gitlab.com/g/p/-/blob/main/a.mp3?ref_type=heads#x')).toBe(
      'https://gitlab.com/g/p/-/raw/main/a.mp3',
    );
  });

  test('toRawUrl returns empty string for non-blob URLs', () => {
    expect(gitlabAdapter.toRawUrl('https://gitlab.com/g/p/-/tree/main')).toBe('');
  });

  test('getBlobPath extracts the file path', () => {
    expect(gitlabAdapter.getBlobPath('https://gitlab.com/g/p/-/blob/main/dir/a.mp3')).toBe(
      'main/dir/a.mp3',
    );
    expect(gitlabAdapter.getBlobPath('https://gitlab.com/g/p/-/tree/main')).toBeNull();
  });
});

describe('detectSite', () => {
  test('detects github', () => {
    expect(detectSite(new URL('https://github.com/u/r/blob/main/a.mp3'))?.id).toBe('github');
  });

  test('detects gitlab.com and self-hosted', () => {
    expect(detectSite(new URL('https://gitlab.com/g/p/-/blob/main/a.mp3'))?.id).toBe('gitlab');
    expect(detectSite(new URL('https://gitlab.example.com/g/p/-/tree/main'))?.id).toBe('gitlab');
    expect(detectSite(new URL('https://example.com/pfx/g/p/-/blob/main/a.mp4'))?.id).toBe('gitlab');
  });

  test('returns null for unrelated pages', () => {
    expect(detectSite(new URL('https://gitlab.com/g/p'))).toBeNull();
    expect(detectSite(new URL('https://example.com/'))).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/sites.spec.ts`
Expected: FAIL — cannot resolve `../../src/sites/gitlab`.

- [ ] **Step 3: Create `src/sites/gitlab.ts`**

```ts
import type { SiteAdapter } from './types';

const BLOB_PATH_RE = /\/-\/blob\/(.+?)(?:\?|#|$)/;
const GITLAB_ACTION_RE = /\/-\/(?:blob|tree|raw)\//;

function parse(url: string): URL | null {
  try {
    const base = typeof location !== 'undefined' ? location.origin : 'https://gitlab.com';
    return new URL(url, base);
  } catch {
    return null;
  }
}

export const gitlabAdapter: SiteAdapter = {
  id: 'gitlab',

  matches(url) {
    return GITLAB_ACTION_RE.test(url.pathname);
  },

  isBlobPage(url) {
    const parsed = parse(url);
    return !!parsed && parsed.pathname.includes('/-/blob/');
  },

  isTreePage(url) {
    const parsed = parse(url);
    return !!parsed && parsed.pathname.includes('/-/tree/');
  },

  toRawUrl(blobUrl) {
    const parsed = parse(blobUrl);
    if (!parsed || !parsed.pathname.includes('/-/blob/')) return '';
    parsed.pathname = parsed.pathname.replace('/-/blob/', '/-/raw/');
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  },

  getBlobPath(url) {
    const parsed = parse(url);
    if (!parsed) return null;
    const match = parsed.pathname.match(BLOB_PATH_RE);
    return match ? match[1] : null;
  },

  fileLinkSelector: 'a[data-testid="file-row"]',

  isFileLink(link) {
    const href = link.getAttribute('href') || '';
    return href.includes('/-/blob/');
  },

  getLinkFilename(link) {
    const nameAttr = link
      .querySelector('[data-qa-file-name]')
      ?.getAttribute('data-qa-file-name');
    if (nameAttr) return nameAttr;
    const href = link.getAttribute('href') || '';
    const path = href.split('?')[0].split('#')[0];
    return decodeURIComponent(path.split('/').pop() || '');
  },

  mountTreeButton(link, btn) {
    const row = link.closest('[data-testid="file-row-container"]');
    if (row) {
      row.appendChild(btn);
    } else {
      link.after(btn);
    }
  },

  blobButtonSelectors: ['.file-actions', '.js-file-title', '#fileHolder .file-title-flex-parent'],

  inlineInsertSelectors: ['#fileHolder > .blob-viewer', '.blob-viewer', '.file-content'],

  repoContentSelectors: ['#fileHolder', '#content-body', '.content', '.tree-holder', 'main'],
};
```

- [ ] **Step 4: Create `src/sites/index.ts`**

```ts
import type { SiteAdapter } from './types';
import { githubAdapter } from './github';
import { gitlabAdapter } from './gitlab';

export type { SiteAdapter, SiteId } from './types';

const ADAPTERS: SiteAdapter[] = [githubAdapter, gitlabAdapter];

export function detectSite(url: URL): SiteAdapter | null {
  return ADAPTERS.find((adapter) => adapter.matches(url)) ?? null;
}

let _cachedHref: string | null = null;
let _cachedSite: SiteAdapter | null = null;

/** Resolve the adapter for the current document, cached per URL. */
export function getActiveSite(): SiteAdapter | null {
  const href = typeof location !== 'undefined' ? location.href : '';
  if (href === _cachedHref) return _cachedSite;
  _cachedHref = href;

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    _cachedSite = null;
    return null;
  }

  _cachedSite = detectSite(url);
  return _cachedSite;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/sites.spec.ts`
Expected: PASS (all adapter + detection tests).

- [ ] **Step 6: Commit**

```bash
git add src/sites/gitlab.ts src/sites/index.ts tests/unit/sites.spec.ts
git commit -m "feat(sites): add GitLab adapter and site detection"
```

---

### Task 3: Route `content.ts` through the active site

**Files:**
- Modify: `src/content.ts`

- [ ] **Step 1: Update imports and remove the local blob-path helper**

Replace the import block in `src/content.ts`:

```ts
import { getFileExtension } from './utils';
```

with:

```ts
import { getFileExtension } from './utils';
import { getActiveSite } from './sites/index';
import type { SiteAdapter } from './sites/types';
```

Delete the existing line `import { convertToRawUrl, isTreePage } from './utils';` (the second utils import near the bottom).

Delete the now-unused type import:

```ts
import type { PreviewHandler } from './preview/handler';
```

Delete the local `getBlobFilePath` function:

```ts
function getBlobFilePath(url: string): string | null {
  const m = url.match(/\/blob\/(.+?)(?:\?|#|$)/);
  return m ? m[1] : null;
}
```

- [ ] **Step 2: Guard `init()` on a recognized site**

Replace the start of `init()`:

```ts
function init(): void {
  if (isInitialized) return;
  isInitialized = true;
  log('init — start');
```

with:

```ts
function init(): void {
  if (isInitialized) return;
  if (!getActiveSite()) {
    log('init — unsupported site, skipping');
    return;
  }
  isInitialized = true;
  log('init — start');
```

- [ ] **Step 3: Use the adapter in `onUrlChanged` and `retryBlobPage`**

Replace the body of `onUrlChanged()` (the blob-path dedupe) with:

```ts
function onUrlChanged(): void {
  if (_urlChangeTimer) clearTimeout(_urlChangeTimer);

  const site = getActiveSite();
  const newBlobPath = site ? site.getBlobPath(location.href) : null;
  if (_currentPreviewBlobPath && newBlobPath === _currentPreviewBlobPath) {
    log('onUrlChanged — same blob file, skipping cleanup:', newBlobPath);
    return;
  }
```

(the rest of `onUrlChanged` is unchanged).

In `retryBlobPage`, replace:

```ts
  if (!isBlobPage(location.href)) return;
  let retries = maxRetries;

  function tryHandle(): void {
    if (!isBlobPage(location.href)) return;
```

with:

```ts
  const site = getActiveSite();
  if (!site?.isBlobPage(location.href)) return;
  let retries = maxRetries;

  function tryHandle(): void {
    if (!site.isBlobPage(location.href)) return;
```

- [ ] **Step 4: Rewrite `addPreviewButtons`**

Replace the whole `addPreviewButtons` function with:

```ts
function addPreviewButtons(): void {
  const site = getActiveSite();
  if (!site) return;

  const fileLinks = document.querySelectorAll<HTMLAnchorElement>(site.fileLinkSelector);

  fileLinks.forEach((link) => {
    if (link.classList.contains('gitpreview-link-processed')) return;
    if (!site.isFileLink(link)) return;

    const href = link.getAttribute('href');
    if (!href) return;

    const extension = getFileExtension(href);
    if (!isSupported(extension)) return;

    link.classList.add('gitpreview-link-processed');
    log('addPreviewButtons — adding button for:', href);

    const btn = createPreviewButton(href, site.getLinkFilename(link), true, openPreview);
    site.mountTreeButton(link, btn);
  });
}
```

- [ ] **Step 5: Rewrite `handleBlobPage` + `insertBlobPageButton`**

Replace both functions with:

```ts
function handleBlobPage(): void {
  if (document.querySelector('.gitpreview-blob-preview-btn')) {
    log('handleBlobPage — button already exists, skip');
    return;
  }

  const site = getActiveSite();
  if (!site) return;

  const url = location.href;
  if (!site.isBlobPage(url)) return;

  const extension = getFileExtension(url);
  const handler = getHandler(extension);
  if (!handler) {
    log('handleBlobPage — no handler for:', extension);
    return;
  }

  const filename = decodeURIComponent(url.split('/').pop()!.split('?')[0]);
  log('handleBlobPage — setting up for:', filename);

  const btn = createPreviewButton(url, filename, false, openPreview);
  btn.classList.add('gitpreview-blob-preview-btn');

  if (!handler.opensInNewTab) {
    updatePreviewButtonState(btn, true);
  }

  if (!insertBlobPageButton(btn, site)) {
    log('handleBlobPage — FAILED to find any insertion target, no button');
    return;
  }

  if (!handler.opensInNewTab) {
    openPreview(url, filename);
  }
}

function insertBlobPageButton(btn: HTMLElement, site: SiteAdapter): boolean {
  for (const selector of site.blobButtonSelectors) {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) continue;

    const isActionElement = el.tagName === 'A' || el.tagName === 'BUTTON';
    if (isActionElement && el.parentElement) {
      el.parentElement.insertBefore(btn, el);
    } else {
      el.appendChild(btn);
    }
    log('insertBlobPageButton — inserted via:', selector);
    return true;
  }

  const fallback = document.querySelector<HTMLElement>(
    '[class*="blob-header"], [class*="file-header"], [class*="BlobViewHeader"], .file-title-flex-parent',
  );
  if (fallback) {
    fallback.appendChild(btn);
    log('insertBlobPageButton — inserted via last-resort fallback');
    return true;
  }

  return false;
}
```

- [ ] **Step 6: Rewrite `openPreview` to use the adapter**

Replace the start of `openPreview` up to the `isTreePage` branch:

```ts
function openPreview(fileUrl: string, filename: string): void {
  const site = getActiveSite();
  if (!site) return;

  const rawUrl = site.toRawUrl(fileUrl);
  if (!rawUrl) {
    log('openPreview — cannot resolve raw url for:', fileUrl);
    return;
  }

  const ext = getFileExtension(fileUrl);
  const handler = getHandler(ext);
  if (!handler) return;

  log('openPreview —', filename, 'handler:', ext);

  const blobPath = site.getBlobPath(fileUrl);
  if (blobPath) _currentPreviewBlobPath = blobPath;

  if (handler.opensInNewTab) {
    handler.openPreview(rawUrl, filename);
    return;
  }

  if (site.isTreePage(location.href)) {
    showLoadingModal(filename, closeAll);
  } else {
    if (document.getElementById('gitpreview-inline')) {
      log('openPreview — toggling off, already open');
      closeAll();
      return;
    }
    showLoading(filename);
  }

  const container = getCurrentPreviewContent();
  if (container) {
    handler.openPreview(rawUrl, filename, container);
  }
}
```

- [ ] **Step 7: Verify compilation and tests**

Run: `npm test`
Expected: PASS (existing tests unaffected).

Run: `npx tsc --noEmit`
Expected: no errors. (If `tsc` is not configured for this, skip; `npm run build` in Task 9 covers it.)

- [ ] **Step 8: Commit**

```bash
git add src/content.ts
git commit -m "refactor(content): route page logic through site adapters"
```

---

### Task 4: Site-aware container insertion in `ui.ts`

**Files:**
- Modify: `src/preview/ui.ts`

- [ ] **Step 1: Add the import**

At the top of `src/preview/ui.ts`, after `import { escapeHTML, isBlobPage } from '../utils';` add:

```ts
import { getActiveSite } from '../sites/index';
```

- [ ] **Step 2: Rewrite `insertInlineContainer`**

Replace the entire `insertInlineContainer` function with:

```ts
export function insertInlineContainer(container: HTMLElement): void {
  const site = getActiveSite();

  if (site) {
    for (const selector of site.inlineInsertSelectors) {
      const target = document.querySelector<HTMLElement>(selector);
      if (target?.parentElement) {
        target.parentElement.insertBefore(container, target);
        target.classList.add('gitpreview-blob-target');
        target.style.display = 'none';
        return;
      }
    }
  }

  const treeTargets = [
    '[class*="react-directory"]',
    '[data-testid="list-view"]',
    '.js-navigation-container',
    '[role="table"]',
    '[role="grid"]',
    'table.files',
    '.Box',
  ];

  for (const selector of treeTargets) {
    const target = document.querySelector<HTMLElement>(selector);
    if (target?.parentElement) {
      target.parentElement.insertBefore(container, target.nextSibling);
      return;
    }
  }

  const repoSelectors = [...(site?.repoContentSelectors ?? []), 'main', 'body'];
  for (const selector of repoSelectors) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) {
      el.appendChild(container);
      return;
    }
  }

  document.body.appendChild(container);
}
```

- [ ] **Step 3: Verify tests still pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/preview/ui.ts
git commit -m "refactor(ui): resolve inline container targets from the active site"
```

---

### Task 5: Remove `getBlobButtonSelector` from the handler contract

**Files:**
- Modify: `src/preview/handler.ts`
- Modify: `src/preview/audio/index.ts`, `excel/index.ts`, `font/index.ts`, `pdf/index.ts`, `powerpoint/index.ts`, `video/index.ts`, `word/index.ts`
- Modify: `tests/unit/utils.spec.ts`

- [ ] **Step 1: Update the interface**

In `src/preview/handler.ts`, remove the `getBlobButtonSelector` block from the `PreviewHandler` interface:

```ts
  /**
   * CSS selector for the button element before which to insert the preview
   * button on blob pages. Override if your handler needs a different position.
   * Defaults to DEFAULT_BLOB_BUTTON_SELECTOR.
   */
  getBlobButtonSelector(): string;

```

and delete the trailing constant:

```ts
/** Default blob button selector used by most handlers. */
export const DEFAULT_BLOB_BUTTON_SELECTOR =
  'a[data-testid="raw-button"], a[href*="/raw/"], a#raw-url';
```

- [ ] **Step 2: Remove boilerplate from every handler**

In each of these files, change the import:

```ts
import { type PreviewHandler, DEFAULT_BLOB_BUTTON_SELECTOR } from '../handler';
```

to:

```ts
import { type PreviewHandler } from '../handler';
```

and delete the `getBlobButtonSelector: () => DEFAULT_BLOB_BUTTON_SELECTOR,` line from the exported handler object:

- `src/preview/audio/index.ts:584`
- `src/preview/excel/index.ts:79`
- `src/preview/font/index.ts:126`
- `src/preview/powerpoint/index.ts:419`
- `src/preview/video/index.ts:218`
- `src/preview/word/index.ts:73`

In `src/preview/pdf/index.ts`, change the import to `import { type PreviewHandler } from '../handler';` and delete the `getBlobButtonSelector() { ... }` method from the `pdfHandler` object (PDF now relies on the GitHub adapter’s first selector, `button[data-testid="download-raw-button"]`).

- [ ] **Step 3: Fix the test handler registration**

In `tests/unit/utils.spec.ts`, remove the `getBlobButtonSelector: () => '',` line inside the `beforeAll` `registerHandler({ ... })` call.

- [ ] **Step 4: Verify**

Run: `npm test`
Expected: PASS.
Run: `grep -rn "getBlobButtonSelector\|DEFAULT_BLOB_BUTTON_SELECTOR" src tests`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/preview tests/unit/utils.spec.ts
git commit -m "refactor(preview): move blob button placement into site adapters"
```

---

### Task 6: Options page for self-hosted instances

**Files:**
- Create: `options.html`
- Create: `src/options/options.ts`
- Create: `src/options/options.css`
- Modify: `vite.config.ts`
- Modify: `manifest.json`

- [ ] **Step 1: Create `options.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GitPreview Settings</title>
    <link rel="stylesheet" href="/src/options/options.css" />
  </head>
  <body>
    <main class="options-page">
      <h1>GitPreview — Self-hosted GitLab</h1>
      <p class="options-desc">
        Add your GitLab instance (for example <code>https://gitlab.example.com</code>) to enable
        file previews there. You will be asked to grant access to that site.
      </p>

      <div class="options-form">
        <input
          id="instance-input"
          type="text"
          placeholder="https://gitlab.example.com"
          autocomplete="off"
          spellcheck="false"
        />
        <button id="add-btn" type="button">Add instance</button>
      </div>

      <p id="message" class="options-message"></p>
      <ul id="instance-list" class="options-list"></ul>
    </main>
    <script type="module" src="/src/options/options.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `src/options/options.ts`**

```ts
export {};

const STORAGE_KEY = 'gitlabInstances';

const input = document.getElementById('instance-input') as HTMLInputElement;
const addBtn = document.getElementById('add-btn') as HTMLButtonElement;
const listEl = document.getElementById('instance-list') as HTMLUListElement;
const messageEl = document.getElementById('message') as HTMLParagraphElement;

function setMessage(text: string, kind: 'info' | 'error' | 'success' = 'info'): void {
  messageEl.textContent = text;
  messageEl.className = `options-message options-message-${kind}`;
}

function normalizeOrigin(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  return url.origin;
}

function getInstances(): Promise<string[]> {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ [STORAGE_KEY]: [] }, (result) => {
      resolve((result[STORAGE_KEY] as string[]) ?? []);
    });
  });
}

function saveInstances(instances: string[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: instances }, () => resolve());
  });
}

function scriptIdFor(origin: string): string {
  let host = origin;
  try {
    host = new URL(origin).host;
  } catch {
    /* keep origin */
  }
  return `gitpreview-gitlab-${host.replace(/[^a-z0-9.-]/gi, '_')}`;
}

async function render(): Promise<void> {
  const instances = await getInstances();
  listEl.replaceChildren();

  if (instances.length === 0) {
    const li = document.createElement('li');
    li.className = 'options-empty';
    li.textContent = 'No self-hosted instances added yet.';
    listEl.appendChild(li);
    return;
  }

  for (const origin of instances) {
    const li = document.createElement('li');
    li.className = 'options-instance';

    const label = document.createElement('span');
    label.textContent = origin;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'options-remove';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      void removeInstance(origin);
    });

    li.append(label, remove);
    listEl.appendChild(li);
  }
}

async function addInstance(): Promise<void> {
  const origin = normalizeOrigin(input.value);
  if (!origin) {
    setMessage('Please enter a valid http(s) URL.', 'error');
    return;
  }

  const instances = await getInstances();
  if (instances.includes(origin)) {
    setMessage('Instance already added.', 'info');
    return;
  }

  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) {
    setMessage('Permission denied — instance not added.', 'error');
    return;
  }

  await saveInstances([...instances, origin]);
  input.value = '';
  setMessage(`Added ${origin}`, 'success');
  await render();
}

async function removeInstance(origin: string): Promise<void> {
  const instances = await getInstances();
  await saveInstances(instances.filter((item) => item !== origin));

  try {
    await chrome.scripting.unregisterContentScripts({ ids: [scriptIdFor(origin)] });
  } catch {
    /* script was not registered */
  }

  try {
    await chrome.permissions.remove({ origins: [`${origin}/*`] });
  } catch {
    /* permission already gone */
  }

  setMessage(`Removed ${origin}`, 'info');
  await render();
}

addBtn.addEventListener('click', () => {
  void addInstance();
});

input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') void addInstance();
});

void render();
```

- [ ] **Step 3: Create `src/options/options.css`**

```css
:root {
  color-scheme: light dark;
  --gp-bg: #ffffff;
  --gp-fg: #1f2328;
  --gp-muted: #656d76;
  --gp-border: #d0d7de;
  --gp-accent: #0969da;
  --gp-error: #cf222e;
  --gp-success: #1a7f37;
}

@media (prefers-color-scheme: dark) {
  :root {
    --gp-bg: #0d1117;
    --gp-fg: #e6edf3;
    --gp-muted: #8b949e;
    --gp-border: #30363d;
    --gp-accent: #2f81f7;
    --gp-error: #f85149;
    --gp-success: #3fb950;
  }
}

body {
  margin: 0;
  background: var(--gp-bg);
  color: var(--gp-fg);
  font: 14px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.options-page {
  max-width: 640px;
  margin: 0 auto;
  padding: 32px 24px;
}

h1 {
  font-size: 20px;
  margin: 0 0 8px;
}

.options-desc {
  color: var(--gp-muted);
  margin: 0 0 20px;
}

.options-form {
  display: flex;
  gap: 8px;
}

.options-form input {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid var(--gp-border);
  border-radius: 6px;
  background: var(--gp-bg);
  color: var(--gp-fg);
  font: inherit;
}

.options-form button {
  padding: 8px 14px;
  border: 1px solid var(--gp-accent);
  border-radius: 6px;
  background: var(--gp-accent);
  color: #fff;
  font: inherit;
  cursor: pointer;
}

.options-message {
  min-height: 20px;
  margin: 12px 0;
  color: var(--gp-muted);
}

.options-message-error {
  color: var(--gp-error);
}

.options-message-success {
  color: var(--gp-success);
}

.options-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--gp-border);
  border-radius: 6px;
}

.options-instance,
.options-empty {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
}

.options-instance + .options-instance {
  border-top: 1px solid var(--gp-border);
}

.options-empty {
  color: var(--gp-muted);
}

.options-remove {
  border: 1px solid var(--gp-border);
  border-radius: 6px;
  background: transparent;
  color: var(--gp-error);
  padding: 4px 10px;
  font: inherit;
  cursor: pointer;
}
```

- [ ] **Step 4: Add the options input to `vite.config.ts`**

Inside `rollupOptions.input`, after the `'pdf-suppress-warnings'` entry, add:

```ts
        options: resolve(__dirname, 'options.html'),
```

- [ ] **Step 5: Update `manifest.json`**

Replace `manifest.json` with:

```json
{
  "manifest_version": 3,
  "name": "GitPreview - GitHub & GitLab File Previewer",
  "version": "1.1.0",
  "description": "Preview various file types directly on GitHub and GitLab without leaving the page.",
  "icons": {
    "16": "assets/icons/icon16.png",
    "48": "assets/icons/icon48.png",
    "128": "assets/icons/icon128.png"
  },
  "permissions": [
    "storage",
    "activeTab",
    "declarativeNetRequest",
    "scripting"
  ],
  "host_permissions": [
    "https://github.com/*",
    "https://raw.githubusercontent.com/*",
    "https://gitlab.com/*"
  ],
  "optional_host_permissions": [
    "http://*/*",
    "https://*/*"
  ],
  "options_ui": {
    "page": "options.html",
    "open_in_tab": true
  },
  "declarative_net_request": {
    "rule_resources": [
      {
        "id": "csp_media",
        "enabled": true,
        "path": "rules.json"
      }
    ]
  },
  "content_scripts": [
    {
      "matches": ["https://github.com/*", "https://gitlab.com/*"],
      "js": ["content.js"],
      "css": ["content.css"],
      "run_at": "document_idle"
    }
  ],
  "background": {
    "service_worker": "background.js"
  }
}
```

- [ ] **Step 6: Verify the build emits `options.html`**

Run: `npm run build`
Expected: build succeeds, and `ls dist/options.html` prints the file.

- [ ] **Step 7: Commit**

```bash
git add options.html src/options vite.config.ts manifest.json
git commit -m "feat(options): add self-hosted GitLab instance settings page"
```

---

### Task 7: Dynamic content-script registration in the background worker

**Files:**
- Modify: `src/background.ts`

- [ ] **Step 1: Remove the dead `getRawFileUrl` action**

In `src/background.ts`, delete this case from the message listener:

```ts
    case 'getRawFileUrl': {
      const rawUrl = convertToRawUrl(request.url);
      sendResponse({ rawUrl });
      return true;
    }
```

and delete the now-unused helper at the bottom of the file:

```ts
function convertToRawUrl(githubUrl: string): string {
  const isBlob = githubUrl.includes('blob');
  if (!isBlob) return githubUrl;
  let rawUrl = githubUrl.replace('github.com', 'raw.githubusercontent.com');
  rawUrl = rawUrl.replace('/blob/', '/');
  return rawUrl;
}
```

- [ ] **Step 2: Add instance script sync logic**

Append to `src/background.ts`:

```ts
// ── Self-hosted GitLab instances ────────────────────────────

const GITLAB_INSTANCES_KEY = 'gitlabInstances';
const INSTANCE_SCRIPT_PREFIX = 'gitpreview-gitlab-';

function instanceScriptId(origin: string): string {
  let host = origin;
  try {
    host = new URL(origin).host;
  } catch {
    /* keep origin */
  }
  return INSTANCE_SCRIPT_PREFIX + host.replace(/[^a-z0-9.-]/gi, '_');
}

function getInstanceOrigins(): Promise<string[]> {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ [GITLAB_INSTANCES_KEY]: [] }, (result) => {
      resolve((result[GITLAB_INSTANCES_KEY] as string[]) ?? []);
    });
  });
}

async function syncInstanceContentScripts(): Promise<void> {
  if (!chrome.scripting?.getRegisteredContentScripts) return;

  const origins = await getInstanceOrigins();

  const granted = new Map<string, string>(); // scriptId -> origin
  for (const origin of origins) {
    const hasPermission = await chrome.permissions.contains({ origins: [`${origin}/*`] });
    if (hasPermission) granted.set(instanceScriptId(origin), origin);
  }

  const existing = await chrome.scripting.getRegisteredContentScripts();
  const existingIds = new Set(existing.map((script) => script.id));

  const staleIds = existing
    .map((script) => script.id)
    .filter((id) => id.startsWith(INSTANCE_SCRIPT_PREFIX) && !granted.has(id));
  if (staleIds.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: staleIds });
  }

  const toRegister = Array.from(granted.entries())
    .filter(([id]) => !existingIds.has(id))
    .map(([id, origin]) => ({
      id,
      matches: [`${origin}/*`],
      js: ['content.js'],
      css: ['content.css'],
      runAt: 'document_idle' as const,
      persistAcrossSessions: true,
    }));

  if (toRegister.length > 0) {
    await chrome.scripting.registerContentScripts(toRegister);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void syncInstanceContentScripts();
});

chrome.runtime.onStartup.addListener(() => {
  void syncInstanceContentScripts();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[GITLAB_INSTANCES_KEY]) {
    void syncInstanceContentScripts();
  }
});
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/background.ts
git commit -m "feat(background): register content scripts for granted GitLab instances"
```

---

### Task 8: Documentation and version bump

**Files:**
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `package.json`

- [ ] **Step 1: Update `README.md`**

- Change the opening line to:

```markdown
  <p><b>Preview 20+ file types directly on GitHub and GitLab.</b> No downloads. No new tabs. Just click and view.</p>
```

- Change the sentence after the badges to:

```markdown
Tired of downloading files just to see what's inside them? GitPreview renders audio, video, PDF, Office documents, fonts, and more — right inside your GitHub or GitLab repository page.
```

- Under `## Quick start`, add:

```markdown
### Self-hosted GitLab

1. Open the extension's **Options** page
2. Enter your instance URL (for example `https://gitlab.example.com`) and click **Add instance**
3. Grant access when Chrome asks — previews then work on that instance
```

- Update the `## Development` note to mention unit tests cover adapters:

```markdown
See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add new preview types or support a new site.
```

- [ ] **Step 2: Update `CONTRIBUTING.md`**

- In the "Create handler" code block, remove the line
  `getBlobButtonSelector: () => DEFAULT_BLOB_BUTTON_SELECTOR,`
  and change the import to `import { type PreviewHandler } from '../handler';`.
- In the "Architecture" tree, add:

```
  sites/              ← Site adapters (GitHub, GitLab) + detection
```

- Add a new section before `## Code conventions`:

```markdown
## Adding a new site

1. Create `src/sites/<site>.ts` exporting a `SiteAdapter`
2. Register it in the `ADAPTERS` array in `src/sites/index.ts`

The adapter owns page detection, blob→raw URL conversion, DOM selectors, and button mounting. Handlers and the preview UI stay site-agnostic.
```

- [ ] **Step 3: Bump `package.json` version**

Change `"version": "1.0.5"` to `"version": "1.1.0"`.

- [ ] **Step 4: Commit**

```bash
git add README.md CONTRIBUTING.md package.json
git commit -m "docs: document GitLab support and bump version to 1.1.0"
```

---

### Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run unit tests**

Run: `npm test`
Expected: all suites PASS, including `tests/unit/sites.spec.ts`.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: build succeeds; `dist/manifest.json`, `dist/content.js`, `dist/background.js`, `dist/options.html` all exist.

Verify:
```bash
ls dist/manifest.json dist/content.js dist/background.js dist/options.html
```

- [ ] **Step 3: Run the formatter check**

Run: `npm run lint`
Expected: PASS. If it fails, run `npm run format` and re-commit.

- [ ] **Step 4: Manual GitLab smoke check**

Load `dist/` as an unpacked extension, then:

1. Open a public repo blob page, e.g. any file on `https://gitlab.com/gitlab-org/cli`, at `/{ns}/{proj}/-/blob/{ref}/{path}`.
   - Expected: a **Preview** button appears in the file action bar; supported files auto-open inline; tree sidebar rows get icon buttons.
2. Open a tree page `/{ns}/{proj}/-/tree/{ref}`.
   - Expected: supported file rows get icon buttons that open the modal preview.
3. Add a self-hosted instance in Options and confirm the preview button appears on that instance.

- [ ] **Step 5: Final commit (if formatting changed anything)**

```bash
git add -A
git commit -m "chore: format"
```

---

## Notes for the implementer

- `git push` is NOT permitted without explicit user approval (see `AGENTS.md`). Commit locally only.
- `rules.json` stays GitHub-only — GitLab's CSP already allows `blob:` media and the raw endpoint is same-origin.
- GitLab raw URLs support byte ranges (`206`), so the existing video streaming path works unchanged.
- Do not hide `#fileHolder` / `.file-holder` during inline preview; that would hide the header and the preview button.
