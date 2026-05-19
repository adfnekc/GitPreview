/**
 * PDF.js viewer integration for GitPreview Chrome extension.
 *
 * This script:
 * 1. Shows a loading overlay while the PDF is being fetched
 * 2. Fetches PDF binary data via chrome.runtime.sendMessage (background worker proxy)
 * 3. Opens the PDF in the viewer using PDFViewerApplication.open({ data: bytes })
 *    which bypasses PDF.js's cross-origin URL security check.
 *
 * PDF.js viewer: https://mozilla.github.io/pdf.js/ (Apache 2.0)
 *
 * NOTE: This script runs inside the PDF.js viewer page (viewer.html), NOT on
 * GitHub. It is bundled as a separate Vite entry and injected into viewer.html
 * via the build script (sed).
 */

interface FetchBinaryResponse {
  success: boolean;
  data?: string;
  error?: string;
}

(function () {
  const params = new URLSearchParams(location.search);
  const rawUrl = params.get('rawUrl');
  const filename = params.get('filename');
  const decodedFilename = filename ? decodeURIComponent(filename) : 'document.pdf';
  const pageTitle = params.get('title')
    ? decodeURIComponent(params.get('title')!)
    : decodedFilename;

  if (!rawUrl) return;

  document.title = pageTitle;

  // --- Loading overlay ---
  const overlay = document.createElement('div');
  overlay.id = 'gp-loading';
  overlay.innerHTML =
    '<div class="gp-loading-box">' +
    '<div class="gp-spinner"></div>' +
    '<div class="gp-loading-text">Loading ' +
    decodedFilename.replace(/</g, '&lt;') +
    '...</div>' +
    '</div>';
  document.body.appendChild(overlay);

  const style = document.createElement('style');
  style.textContent =
    '#gp-loading{' +
    'position:fixed;top:0;left:0;width:100%;height:100%;' +
    'display:flex;align-items:center;justify-content:center;' +
    'background:#e6e9ed;z-index:9999;' +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;' +
    '}' +
    '.gp-loading-box{display:flex;flex-direction:column;align-items:center;gap:16px;}' +
    '.gp-spinner{' +
    'width:32px;height:32px;' +
    'border:3px solid #d1d9e0;' +
    'border-top-color:#0969da;' +
    'border-radius:50%;' +
    'animation:gp-spin 1s ease-in-out infinite;' +
    '}' +
    '.gp-loading-text{color:#656d76;font-size:14px;}' +
    '@keyframes gp-spin{to{transform:rotate(360deg);}}';
  document.head.appendChild(style);
  // ----------------------

  (async () => {
    try {
      // Fetch PDF binary data via the extension's background worker
      const response = await new Promise<FetchBinaryResponse>((resolve, reject) => {
        chrome.runtime.sendMessage(
          { action: 'fetchBinary', url: rawUrl },
          (res: FetchBinaryResponse) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (!res?.success) {
              reject(new Error(res?.error || 'Failed to fetch PDF'));
            } else {
              resolve(res);
            }
          },
        );
      });

      // Decode base64 to Uint8Array
      const binary = atob(response.data!);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const app = (window as any).PDFViewerApplication as
        | {
            initializedPromise?: Promise<void>;
            url?: string;
            _downloadUrl?: string;
            open: (args: { data: Uint8Array }) => Promise<void>;
          }
        | undefined;
      if (!app) throw new Error('PDFViewerApplication not available');

      // Remove loading overlay
      overlay.remove();

      // Wait for the viewer to finish initializing
      if (app.initializedPromise) {
        await app.initializedPromise;
      }

      // Set filename so the toolbar and download button work correctly
      app.url = decodedFilename;
      app._downloadUrl = rawUrl;

      // Open the PDF from raw bytes (no URL origin check needed)
      await app.open({ data: bytes });
    } catch (err) {
      console.error('GitPreview PDF load error:', err);
      overlay.querySelector('.gp-spinner')?.remove();
      const textEl = overlay.querySelector('.gp-loading-text');
      if (textEl)
        textEl.textContent =
          'Failed to load PDF: ' + (err instanceof Error ? err.message : String(err));
    }
  })();
})();
