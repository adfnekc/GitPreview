import { type PreviewHandler } from '../handler';
import { fetchBinary } from '../../lib/range-fetcher';
import { runContainerPreview } from '../ui';
import { AudioPlayer } from './player';

export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];

let currentPlayer: AudioPlayer | null = null;

export function openAudioPreview(
  url: string,
  filename: string,
  container: HTMLElement,
): Promise<void> {
  closeAudioPreview();

  return runContainerPreview(container, filename, async () => {
    const arrayBuffer = await fetchBinary(url);
    const player = new AudioPlayer({ url, filename, arrayBuffer });
    currentPlayer = player;
    container.innerHTML = '';
    container.appendChild(player.render());
  });
}

export function closeAudioPreview(): void {
  currentPlayer?.destroy();
  currentPlayer = null;
}

export function togglePlay(): void {
  currentPlayer?.togglePlay();
}

export function rewind(seconds: number): void {
  currentPlayer?.rewind(seconds);
}

export function forward(seconds: number): void {
  currentPlayer?.forward(seconds);
}

export function setVolume(percent: number): void {
  currentPlayer?.setVolume(percent);
}

export function getVolume(): number {
  return currentPlayer ? currentPlayer.volume * 100 : 100;
}

export const audioHandler: PreviewHandler = {
  extensions: AUDIO_EXTENSIONS,
  openPreview(rawUrl: string, filename: string, container?: HTMLElement) {
    if (!container) return;
    void openAudioPreview(rawUrl, filename, container);
  },
  close: closeAudioPreview,
};
