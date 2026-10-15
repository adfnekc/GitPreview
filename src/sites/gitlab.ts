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
    return match?.[1] ?? null;
  },

  fileLinkSelector: 'a[data-testid="file-row"]',

  isFileLink(link) {
    const href = link.getAttribute('href') || '';
    return href.includes('/-/blob/');
  },

  getLinkFilename(link) {
    const nameAttr = link.querySelector('[data-qa-file-name]')?.getAttribute('data-qa-file-name');
    if (nameAttr) return nameAttr;
    const href = link.getAttribute('href') || '';
    const path = href.split('?')[0]?.split('#')[0] ?? '';
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
