export type SiteId = 'github' | 'gitlab';

export interface SiteAdapter {
  id: SiteId;

  /** Whether the current URL belongs to this site. */
  matches(url: URL): boolean;

  /** Whether the URL is a single-file (blob) page. */
  isBlobPage(url: string): boolean;

  /** Whether the URL is a directory (tree) page. */
  isTreePage(url: string): boolean;

  /** Convert a blob page URL to the direct raw-file URL. Empty string if not applicable. */
  toRawUrl(blobUrl: string): string;

  /** File path after the blob marker, used to dedupe SPA navigation. Null when not a blob page. */
  getBlobPath(url: string): string | null;

  /** Selector for file links inside a directory listing. */
  fileLinkSelector: string;

  /** Whether a directory link points at a file (not a folder). */
  isFileLink(link: HTMLAnchorElement): boolean;

  /** Display filename for a directory link. */
  getLinkFilename(link: HTMLAnchorElement): string;

  /** Mount the preview button within a directory row. */
  mountTreeButton(link: HTMLAnchorElement, btn: HTMLElement): void;

  /** Ordered selectors for where to place the blob-page preview button. */
  blobButtonSelectors: string[];

  /** Ordered targets for the inline preview container; the matched element is hidden. */
  inlineInsertSelectors: string[];

  /** Fallback repo-content containers for inline insertion (appended, not hidden). */
  repoContentSelectors: string[];
}
