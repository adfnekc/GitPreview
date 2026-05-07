# GitPreview

Preview audio files directly on GitHub without leaving the page.

## Features

- **Inline preview** — Play audio files on blob pages with a waveform visualizer
- **Modal preview** — Preview files from tree/directory pages without navigating away
- **Keyboard shortcuts** — Space (play/pause), arrows (seek, volume)
- **Download** — Save audio files directly from the preview player

## Usage

Install from the Chrome Web Store, or load unpacked from `dist/`:

1. Run `npm run build`
2. Open `chrome://extensions`
3. Enable Developer mode
4. Click "Load unpacked" and select the `dist/` folder

## Development

```bash
npm run build     # Build extension to dist/
npm run dev       # Watch mode
npm test          # Run unit tests
npm run clean     # Remove dist/
```

### Smoke Tests

Requires a GitHub session and a repo with audio files:

```bash
npm run test:e2e:setup
export TEST_BLOB_URL="https://github.com/user/repo/blob/main/file.mp3"
export TEST_TREE_URL="https://github.com/user/repo/tree/main/dir"
npm run test:e2e:smoke
```

## License

MIT
