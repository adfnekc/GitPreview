# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Chrome: PDF preview did nothing / "Receiving end does not exist"** — the
  packaging scripts used to leave the Firefox manifest in `dist/`, so Chrome
  ignored `background.scripts` and never started the service worker. Firefox
  builds now go to `dist-firefox/`, `dist/` always stays a Chrome build, and
  `scripts/check-dist.mjs` fails the build if the output directory is invalid.

## [1.1.1] - 2026-10-16

### Removed

- Dropped the unused `activeTab` permission from the Chrome and Firefox manifests
  (the extension has no browser action, so it could never be granted). This also
  resolves a Chrome Web Store permission-justification issue.

## [1.1.0] - 2026-10-15

### Added

- **GitLab support** — full preview parity on `gitlab.com` and self-hosted GitLab
  instances (audio, video, PDF, fonts, Word, Excel, PowerPoint).
- **Self-hosted GitLab instances** — an options page to add instances and grant
  access; the background worker registers the content script dynamically.
- **Cross-browser builds** — a Firefox manifest and packaging (`build:firefox`,
  `pack:firefox`), separate from the Chrome/Edge build.
- **Release automation** — `.github/workflows/release.yml` builds the CRX/zip
  artifacts, creates a GitHub Release, and (when secrets are configured)
  publishes to the Chrome Web Store, Firefox AMO, and Microsoft Edge Add-ons.
- Site adapter abstraction (`src/sites/`) so new hosts can be added without
  touching the preview engine.
- Unit tests for adapters, registry, keyboard, mime, instances, and manifests.

### Changed

- `content.ts` is now a thin entry point; page orchestration lives in
  `controller.ts`.
- Oversized modules split: `audio` → `player.ts` + `waveform.ts`,
  `powerpoint` → typed `viewer.ts`.
- Shared helpers extracted: `lib/{logger,debounce,mime,download,instances}.ts`
  and `preview/ui.ts` loading/run helpers.
- TypeScript now type-checks (`typecheck`) with strict flags in CI, and ESLint
  runs in CI alongside Prettier.

### Fixed

- Debounced button injection no longer creates a new debouncer per mutation.
- The blob-page preview button is retried when the host DOM changes, not only on
  URL changes.
- Video issues a single HEAD request and reuses the shared binary fetch.
- Removed production `console.log` noise.

### Removed

- Dead exports and unused settings (`autoPreview`, `previewMode`, `getSettings`,
  `updateSettings`, `fetchAudio`).

## [1.0.5] - 2026-05-19

- PowerPoint preview improvements (zoom, pan, fullscreen).
- Various bug fixes.

## [1.0.0] - 2026-05-07

- Initial release: audio, video, PDF, font, Word, Excel, and PowerPoint previews
  on GitHub.
