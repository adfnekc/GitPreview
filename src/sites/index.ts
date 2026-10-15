import type { SiteAdapter } from './types';
import { githubAdapter } from './github';
import { gitlabAdapter } from './gitlab';

export type { SiteAdapter, SiteId } from './types';

const ADAPTERS: SiteAdapter[] = [githubAdapter, gitlabAdapter];

export function detectSite(url: URL): SiteAdapter | null {
  return ADAPTERS.find((adapter) => adapter.matches(url)) ?? null;
}

let _cachedHref: string | null = null;
let _cachedSite: SiteAdapter | null = null;

/** Resolve the adapter for the current document, cached per URL. */
export function getActiveSite(): SiteAdapter | null {
  const href = typeof location !== 'undefined' ? location.href : '';
  if (href === _cachedHref) return _cachedSite;
  _cachedHref = href;

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    _cachedSite = null;
    return null;
  }

  _cachedSite = detectSite(url);
  return _cachedSite;
}
