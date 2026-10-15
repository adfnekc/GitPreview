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
