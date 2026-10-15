const DEFAULT_SETTINGS = { keyboardShortcuts: true };

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set(DEFAULT_SETTINGS);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'fetchAudio':
      fetchAudio(request.url, sendResponse);
      return true;
    case 'fetchBinary':
      fetchAudio(request.url, sendResponse);
      return true;
    case 'fetchHead':
      fetchHead(request.url, sendResponse);
      return true;
    case 'openPdfViewer':
      chrome.tabs.create({ url: request.viewerUrl });
      sendResponse({ success: true });
      return true;
    case 'fetchRange':
      fetchRange(request.url, request.start, request.end, sendResponse);
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

function fetchHead(url: string, sendResponse: (response: any) => void): void {
  fetch(url, { method: 'HEAD' })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const size = parseInt(response.headers.get('Content-Length') || '0', 10);
      const acceptsRanges = response.headers.get('Accept-Ranges') === 'bytes';
      const mimeType = response.headers.get('Content-Type') || '';
      sendResponse({ success: true, size, acceptsRanges, mimeType });
    })
    .catch((error: Error) => {
      console.error('Error fetching HEAD:', error);
      sendResponse({ success: false, error: error.message });
    });
}

function fetchRange(
  url: string,
  start: number,
  end: number,
  sendResponse: (response: any) => void,
): void {
  fetch(url, { headers: { Range: `bytes=${start}-${end}` } })
    .then((response) => {
      if (response.status !== 206) {
        throw new Error(`Expected 206 Partial Content, got ${response.status}`);
      }
      return response.arrayBuffer();
    })
    .then((arrayBuffer) => {
      const base64 = arrayBufferToBase64(arrayBuffer);
      sendResponse({ success: true, data: base64, start, end });
    })
    .catch((error: Error) => {
      console.error('Error fetching range:', error);
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
