import { type PreviewHandler } from '../handler';
import { RangeFetcher, type FileInfo } from '../../lib/range-fetcher';
import { NetworkAware } from '../../lib/network-aware';
import { renderErrorContent, runContainerPreview } from '../ui';
import { StreamVideoPlayer } from './stream-player';

export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi', 'mkv'];

let currentPlayer: StreamVideoPlayer | null = null;

export async function openVideoPreview(
  url: string,
  filename: string,
  container: HTMLElement,
): Promise<void> {
  closeVideoPreview();

  const fileInfo: FileInfo = await RangeFetcher.getFileInfo(url);

  if (NetworkAware.shouldWarn(fileInfo.size)) {
    const confirmed = await NetworkAware.confirmLoad(filename, fileInfo.size);
    if (!confirmed) {
      container.innerHTML = renderErrorContent('Loading cancelled on cellular network.');
      return;
    }
  }

  // Hide the host page's own large-file notice while the preview is open.
  const blobTarget = document.querySelector('.gitpreview-blob-target');
  if (blobTarget) (blobTarget as HTMLElement).style.display = 'none';

  await runContainerPreview(container, filename, async () => {
    currentPlayer = new StreamVideoPlayer(url, filename);
    await currentPlayer.init(container, fileInfo);
  });
}

export function closeVideoPreview(): void {
  currentPlayer?.destroy();
  currentPlayer = null;
}

export const videoHandler: PreviewHandler = {
  extensions: VIDEO_EXTENSIONS,
  openPreview(rawUrl: string, filename: string, container?: HTMLElement) {
    if (!container) return;
    void openVideoPreview(rawUrl, filename, container);
  },
  close: closeVideoPreview,
};
