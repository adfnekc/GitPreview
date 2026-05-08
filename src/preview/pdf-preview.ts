function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function getRealFilename(fallback: string): string {
  if (location.href.includes('/blob/')) {
    const match = document.title.match(/^(.+?)\s·\s/);
    if (match) return match[1].trim();
  }
  return decodeURIComponent(fallback);
}

function getTabTitle(filename: string): string {
  const pathMatch = location.pathname.match(/^\/([^/]+\/[^/]+)/);
  const repoPath = pathMatch ? pathMatch[1] : '';
  return `${filename} · ${repoPath} · GitHub`;
}

function fetchPdfFromBackground(url: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ action: 'fetchBinary', url }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response.success) {
          resolve(base64ToArrayBuffer(response.data));
        } else {
          reject(new Error(response.error || 'Failed to fetch PDF'));
        }
      });
    } else {
      reject(new Error('Chrome runtime not available'));
    }
  });
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function openPdfPreview(rawUrl: string, filename: string): void {
  const realFilename = getRealFilename(filename);
  const tabTitle = getTabTitle(realFilename);

  const pdfWindow = window.open('', '_blank');
  if (!pdfWindow) return;

  pdfWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${tabTitle}</title>
      <style>
        body {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        .gitpreview-pdf-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          gap: 16px;
          color: #656d76;
          font-size: 14px;
        }
        .gitpreview-pdf-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid #d1d9e0;
          border-top-color: #0969da;
          border-radius: 50%;
          animation: gitpreview-pdf-spin 1s ease-in-out infinite;
        }
        @keyframes gitpreview-pdf-spin {
          to { transform: rotate(360deg); }
        }
        .gitpreview-pdf-error {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          gap: 12px;
          color: #cf222e;
          font-size: 14px;
          text-align: center;
          padding: 20px;
        }
      </style>
    </head>
    <body>
      <div class="gitpreview-pdf-loading">
        <div class="gitpreview-pdf-spinner"></div>
        <div>Loading ${escapeHTML(realFilename)}...</div>
      </div>
    </body>
    </html>
  `);
  pdfWindow.document.close();

  fetchPdfFromBackground(rawUrl)
    .then((arrayBuffer) => {
      const file = new File([arrayBuffer], realFilename, { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(file);

      pdfWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${tabTitle}</title>
          <style>
            body { margin: 0; }
            iframe { width: 100%; height: 100vh; border: none; display: block; }
          </style>
        </head>
        <body>
          <iframe src="${blobUrl}"></iframe>
        </body>
        </html>
      `);
      pdfWindow.document.close();
    })
    .catch((err) => {
      pdfWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head><title>Error - ${tabTitle}</title></head>
        <body>
          <div class="gitpreview-pdf-error">
            <p>Failed to load PDF: ${escapeHTML(err.message)}</p>
          </div>
        </body>
        </html>
      `);
      pdfWindow.document.close();
    });
}
