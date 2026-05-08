/**
 * PDF preview powered by PDF.js (https://mozilla.github.io/pdf.js/)
 * PDF.js is licensed under Apache License 2.0
 * Source: https://github.com/mozilla/pdf.js
 * Version: 5.7.284
 *
 * Official viewer is bundled at dist/pdf-viewer/ from the pre-built release.
 * See vendor/pdfjs-viewer/pdfjs-5.7.284-dist.zip for the original distribution.
 */

function getRealFilename(fallback: string): string {
  if (location.href.includes('/blob/')) {
    const match = document.title.match(/^(.+?)\s·\s/);
    if (match) return match[1].trim();
  }
  return decodeURIComponent(fallback);
}

export function openPdfPreview(rawUrl: string, filename: string): void {
  const realFilename = getRealFilename(filename);
  const tabTitle = document.title;

  const viewerUrl =
    chrome.runtime.getURL('pdf-viewer/web/viewer.html') +
    '?rawUrl=' + encodeURIComponent(rawUrl) +
    '&filename=' + encodeURIComponent(realFilename) +
    '&title=' + encodeURIComponent(tabTitle);

  chrome.runtime.sendMessage({ action: 'openPdfViewer', viewerUrl }, () => {
    if (chrome.runtime.lastError) {
      console.error('Failed to open PDF viewer:', chrome.runtime.lastError.message);
    }
  });
}
