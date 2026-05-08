export interface PreviewHandler {
  /** File extensions this handler supports (lowercase, no dot). */
  extensions: string[];
  /**
   * CSS selector for the element before which the preview button should
   * be inserted on blob pages.
   */
  getBlobButtonSelector(): string;
  /**
   * If true, openPreview opens content in a new tab (e.g. PDF).
   * When false, content.ts creates an inline/modal container and passes
   * it to openPreview.
   */
  opensInNewTab?: boolean;
  /**
   * Open the preview. Handlers that render into a container (e.g. audio)
   * receive one; handlers that open a new tab (e.g. PDF) ignore it.
   */
  openPreview(rawUrl: string, filename: string, container?: HTMLElement): void;
}
