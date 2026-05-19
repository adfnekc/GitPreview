/**
 * Preview handler interface.
 *
 * To add a new file type:
 * 1. Create `src/preview/<type>/index.ts` with a handler object
 * 2. Import and call `registerHandler(yourHandler)` in `content.ts`
 */

export interface PreviewHandler {
  /** File extensions this handler supports (lowercase, no dot). */
  extensions: string[];

  /**
   * CSS selector for the button element before which to insert the preview
   * button on blob pages. Override if your handler needs a different position.
   * Defaults to DEFAULT_BLOB_BUTTON_SELECTOR.
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

  /**
   * Cleanup when the preview is closed. Called by registry.closeAll().
   * Use this to destroy players, remove event listeners, etc.
   */
  close?(): void;
}

/** Default blob button selector used by most handlers. */
export const DEFAULT_BLOB_BUTTON_SELECTOR =
  'a[data-testid="raw-button"], a[href*="/raw/"], a#raw-url';
