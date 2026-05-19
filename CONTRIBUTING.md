# Contributing

## Quick start

```bash
git clone <your-fork>
cd gitpreview
npm install
npm run dev        # Watch-mode build
npm test           # Run unit tests
```

Load unpacked from `dist/` in Chrome Extensions page.

## Adding a new preview type

Adding a new file type takes 2 steps:

### 1. Create handler

```
src/preview/<type>/index.ts
```

```ts
import { type PreviewHandler, DEFAULT_BLOB_BUTTON_SELECTOR } from '../handler';
import { renderErrorContent } from '../ui';

const EXTENSIONS = ['ext1', 'ext2'];

export const myHandler: PreviewHandler = {
  extensions: EXTENSIONS,
  getBlobButtonSelector: () => DEFAULT_BLOB_BUTTON_SELECTOR,
  openPreview(rawUrl, filename, container) {
    if (!container) return;
    try {
      // 1. fetch data (use fetchBinary from range-fetcher)
      // 2. render preview into container.innerHTML
    } catch (err) {
      container.innerHTML = renderErrorContent((err as Error).message);
    }
  },
  close() {
    // destroy players, remove listeners, clean up
  },
};
```

### 2. Register in content.ts

```ts
import { myHandler } from './preview/<type>/index';

// In the registration section:
registerHandler(myHandler);
```

Done. The registry handles lifecycle automatically.

### Notes

- **New-tab handler** (e.g. PDF): set `opensInNewTab: true`, ignore `container` param.
- **Binary files**: use `fetchBinary(url)` from `src/lib/range-fetcher.ts`.
- **Network-aware**: call `NetworkAware.shouldWarn(size)` / `.confirmLoad()` from `src/lib/network-aware.ts` before loading large files on cellular.
- **Error display**: use `renderErrorContent(message)` from `src/preview/ui.ts`.
- **CSS**: add styles to `src/preview/preview.css`. Prefix classes with `gitpreview-`.

## Code conventions

- **Language**: TypeScript, strict mode
- **Naming**: camelCase functions/variables, PascalCase classes/types, UPPER_CASE constants
- **File structure**: `src/preview/<type>/index.ts` per handler
- **Imports**: group by 1) external, 2) internal, 3) CSS
- **No classes** unless stateful (audio/video players). Prefer functions + module-level state.
- **Error handling**: catch at handler boundary, render error in container, do not rethrow
- **Async**: prefer `async/await` over raw promises. Use `.catch()` at call site for error display.

## Architecture

```
src/
  content.ts          ← Entry point. Registers handlers, manages page observation.
  utils.ts            ← Pure utility functions (no handler-specific code).
  lib/
    range-fetcher.ts  ← Binary fetch + Range-request streaming.
    network-aware.ts  ← Cellular detection + large-file warning dialog.
  preview/
    handler.ts        ← PreviewHandler interface.
    registry.ts       ← Handler registration + lifecycle dispatch.
    ui.ts             ← DOM helpers (buttons, containers, loading/error states).
    preview.css       ← All preview styles.
    audio/            ← Audio player.
    video/            ← StreamVideoPlayer (MediaSource).
    pdf/              ← PDF.js viewer (new tab).
    font/             ← Font face preview.
    word/             ← DOCX → HTML (mammoth.js).
    excel/            ← XLSX → HTML table (SheetJS).
    powerpoint/       ← PPTX slide viewer (pptx-preview).
```

## Testing

```bash
npm test              # Unit tests (vitest)
npm run test:e2e:smoke  # Playwright smoke tests
```

- Unit tests in `tests/unit/`
- Add tests for new utilities, not for render logic
- E2E tests require a real GitHub session (see `tests/e2e/`)

## PR guidelines

- One feature per PR
- Run `npm test` before pushing
- Keep handler files under 400 lines. If larger, extract into `src/preview/<type>/` directory with helper files.
- Reference related issue if applicable

## Project

- **License**: MIT
- **Build**: Vite (single-file content script bundle)
