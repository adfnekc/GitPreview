const DEFAULT_SETTINGS = {
  autoPreview: true,
  previewMode: 'modal',
  keyboardShortcuts: true,
  enabledFileTypes: {
    audio: true,
    image: true,
    font: true,
    html: true,
  },
};

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set(DEFAULT_SETTINGS);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'getSettings':
      chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
        sendResponse(settings);
      });
      return true;
    case 'updateSettings':
      chrome.storage.sync.set(request.settings, () => {
        sendResponse({ success: true });
      });
      return true;
    case 'getRawFileUrl': {
      const rawUrl = convertToRawUrl(request.url);
      sendResponse({ rawUrl });
      return true;
    }
    case 'fetchAudio':
      fetchAudio(request.url, sendResponse);
      return true;
    default:
      sendResponse({ error: 'Unknown action' });
      return false;
  }
});

function fetchAudio(url: string, sendResponse: (response: any) => void): void {
  fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.arrayBuffer();
    })
    .then((arrayBuffer) => {
      const base64 = arrayBufferToBase64(arrayBuffer);
      sendResponse({ success: true, data: base64 });
    })
    .catch((error: Error) => {
      console.error('Error fetching audio:', error);
      sendResponse({ success: false, error: error.message });
    });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function convertToRawUrl(githubUrl: string): string {
  const isBlob = githubUrl.includes('blob');
  if (!isBlob) return githubUrl;
  let rawUrl = githubUrl.replace('github.com', 'raw.githubusercontent.com');
  rawUrl = rawUrl.replace('/blob/', '/');
  return rawUrl;
}
