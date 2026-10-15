import {
  GITLAB_INSTANCES_KEY,
  getInstanceOrigins,
  instanceScriptId,
  isInstanceScriptId,
} from './lib/instances';

// Kept local (not imported from utils) so the background bundle stays free of
// modules shared with the content script, which must remain a classic script.
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

const DEFAULT_SETTINGS = { keyboardShortcuts: true };

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set(DEFAULT_SETTINGS);
  }
});

interface FetchBinaryResponse {
  success: boolean;
  data?: string;
  error?: string;
}

interface FetchHeadResponse {
  success: boolean;
  size?: number;
  acceptsRanges?: boolean;
  mimeType?: string;
  error?: string;
}

interface FetchRangeResponse extends FetchBinaryResponse {
  start?: number;
  end?: number;
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  switch (request.action) {
    case 'fetchBinary':
      void fetchBinaryData(request.url, sendResponse);
      return true;
    case 'fetchHead':
      void fetchHead(request.url, sendResponse);
      return true;
    case 'openPdfViewer':
      chrome.tabs.create({ url: request.viewerUrl });
      sendResponse({ success: true });
      return true;
    case 'fetchRange':
      void fetchRange(request.url, request.start, request.end, sendResponse);
      return true;
    default:
      sendResponse({ error: 'Unknown action' });
      return false;
  }
});

async function fetchBinaryData(
  url: string,
  sendResponse: (response: FetchBinaryResponse) => void,
): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    sendResponse({ success: true, data: arrayBufferToBase64(arrayBuffer) });
  } catch (error) {
    console.error('GitPreview: error fetching binary:', error);
    sendResponse({ success: false, error: (error as Error).message });
  }
}

async function fetchHead(
  url: string,
  sendResponse: (response: FetchHeadResponse) => void,
): Promise<void> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    sendResponse({
      success: true,
      size: parseInt(response.headers.get('Content-Length') || '0', 10),
      acceptsRanges: response.headers.get('Accept-Ranges') === 'bytes',
      mimeType: response.headers.get('Content-Type') || '',
    });
  } catch (error) {
    console.error('GitPreview: error fetching HEAD:', error);
    sendResponse({ success: false, error: (error as Error).message });
  }
}

async function fetchRange(
  url: string,
  start: number,
  end: number,
  sendResponse: (response: FetchRangeResponse) => void,
): Promise<void> {
  try {
    const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
    if (response.status !== 206) {
      throw new Error(`Expected 206 Partial Content, got ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    sendResponse({ success: true, data: arrayBufferToBase64(arrayBuffer), start, end });
  } catch (error) {
    console.error('GitPreview: error fetching range:', error);
    sendResponse({ success: false, error: (error as Error).message });
  }
}

// ── Self-hosted GitLab instances ────────────────────────────

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
    .filter((id) => isInstanceScriptId(id) && !granted.has(id));
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
