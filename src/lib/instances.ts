export const GITLAB_INSTANCES_KEY = 'gitlabInstances';
const SCRIPT_PREFIX = 'gitpreview-gitlab-';

export function instanceScriptId(origin: string): string {
  let host = origin;
  try {
    host = new URL(origin).host;
  } catch {
    /* keep origin as-is */
  }
  return SCRIPT_PREFIX + host.replace(/[^a-z0-9.-]/gi, '_');
}

export function isInstanceScriptId(id: string): boolean {
  return id.startsWith(SCRIPT_PREFIX);
}

export function getInstanceOrigins(): Promise<string[]> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage?.sync) {
      resolve([]);
      return;
    }
    chrome.storage.sync.get({ [GITLAB_INSTANCES_KEY]: [] }, (result) => {
      resolve((result[GITLAB_INSTANCES_KEY] as string[]) ?? []);
    });
  });
}
