interface PlayerControls {
  togglePlay: () => void;
  rewind: (seconds: number) => void;
  forward: (seconds: number) => void;
  setVolume: (percent: number) => void;
  getVolume: () => number;
}

export function bindKeyboardShortcuts(
  options: { keyboardShortcuts: boolean },
  closeAll: () => void,
  player: PlayerControls,
): () => void {
  const handler = (e: KeyboardEvent) => {
    if (!options.keyboardShortcuts) return;

    const isPreviewOpen =
      !!document.getElementById('gitpreview-inline') ||
      !!document.getElementById('gitpreview-modal-overlay');

    if (e.key === 'Escape' && isPreviewOpen) {
      e.preventDefault();
      closeAll();
    }

    if (isPreviewOpen) {
      switch (e.key) {
        case ' ':
          e.preventDefault();
          player.togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          player.rewind(10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          player.forward(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          player.setVolume(Math.min(100, player.getVolume() + 10));
          break;
        case 'ArrowDown':
          e.preventDefault();
          player.setVolume(Math.max(0, player.getVolume() - 10));
          break;
      }
    }
  };

  document.addEventListener('keydown', handler);

  return () => document.removeEventListener('keydown', handler);
}
