# GitPreview

Preview various file types directly on GitHub without leaving the page.

## Features

- **Audio preview** — Play audio files (mp3, wav, ogg, m4a, flac, aac) with waveform visualizer
- **Video preview** — Play video files (mp4, webm, mov, avi, mkv) with streaming chunked loading via MediaSource API
- **PDF preview** — View PDF files using PDF.js viewer in a new tab
- **Network-aware loading** — Detects cellular/metered connections and warns before loading files over 5MB
- **Inline & Modal preview** — Preview on blob pages inline, or from tree pages in a modal
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
npm test          # Run unit tests (60+ tests)
npm run clean     # Remove dist/
npm run package   # Build and package CRX
```

### Smoke Tests

Requires a GitHub session and a repo with supported files:

```bash
npm run test:e2e:setup
export TEST_BLOB_URL="https://github.com/user/repo/blob/main/file.mp3"
export TEST_TREE_URL="https://github.com/user/repo/tree/main/dir"
npm run test:e2e:smoke
```

## License

MIT
