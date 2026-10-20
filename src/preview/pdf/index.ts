import { type PreviewHandler } from '../handler';

/**
 * PDF preview powered by PDF.js (https://mozilla.github.io/pdf.js/)
 * PDF.js is licensed under Apache License 2.0
 * Source: https://github.com/mozilla/pdf.js
 * Version: 5.7.284
 *
 * Official viewer is bundled at dist/pdf-viewer/ from the pre-built release.
 * See vendor/pdfjs-viewer/pdfjs-5.7.284-dist.zip for the original distribution.
 */

function basename(path: string): string {
  return path.split(/[?#]/)[0]?.split('/').filter(Boolean).pop()?.trim() ?? '';
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Resolves the file name shown in the viewer (loading text, download name and
 * tab title). The `fallback` from the content script is already the last URL
 * segment, so it wins; the page title is only used when it is missing.
 */
export function deriveFilename(fallback: string, pageTitle: string): string {
  const fromFallback = basename(safeDecode(fallback));
  if (fromFallback) return fromFallback;

  // GitHub tab title: "path/to/file.pdf at main · owner/repo · GitHub"
  const titlePath = pageTitle.match(/^(.+?)\s·\s/)?.[1] ?? '';
  const fromTitle = basename(safeDecode(titlePath).replace(/\s+at\s+\S+\s*$/, ''));
  return fromTitle || 'document.pdf';
}

export function openPdfPreview(rawUrl: string, filename: string): void {
  const realFilename = deriveFilename(filename, document.title);
  const viewerTitle = `${realFilename} · GitPreview`;

  const viewerUrl =
    chrome.runtime.getURL('pdf-viewer/web/viewer.html') +
    '?rawUrl=' +
    encodeURIComponent(rawUrl) +
    '&filename=' +
    encodeURIComponent(realFilename) +
    '&title=' +
    encodeURIComponent(viewerTitle);

  chrome.runtime.sendMessage({ action: 'openPdfViewer', viewerUrl }, () => {
    if (chrome.runtime.lastError) {
      console.error('Failed to open PDF viewer:', chrome.runtime.lastError.message);
    }
  });
}

export const pdfHandler: PreviewHandler = {
  extensions: ['pdf'],
  opensInNewTab: true,
  openPreview(rawUrl: string, filename: string, _container?: HTMLElement) {
    openPdfPreview(rawUrl, filename);
  },
};
