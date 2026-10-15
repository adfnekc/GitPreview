// @vitest-environment jsdom
import { describe, test, expect, vi, afterEach } from 'vitest';
import { bindKeyboardShortcuts } from '../../src/preview/keyboard';

function makePlayer() {
  return {
    togglePlay: vi.fn(),
    rewind: vi.fn(),
    forward: vi.fn(),
    setVolume: vi.fn(),
    getVolume: vi.fn(() => 50),
  };
}

function addPreview(id: string): HTMLElement {
  const el = document.createElement('div');
  el.id = id;
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('bindKeyboardShortcuts', () => {
  test('does nothing when shortcuts are disabled', () => {
    const closeAll = vi.fn();
    const player = makePlayer();
    const preview = addPreview('gitpreview-inline');
    const unbind = bindKeyboardShortcuts({ keyboardShortcuts: false }, closeAll, player);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));

    expect(player.togglePlay).not.toHaveBeenCalled();
    unbind();
    preview.remove();
  });

  test('controls the player when a preview is open', () => {
    const closeAll = vi.fn();
    const player = makePlayer();
    const preview = addPreview('gitpreview-inline');
    const unbind = bindKeyboardShortcuts({ keyboardShortcuts: true }, closeAll, player);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));

    expect(player.togglePlay).toHaveBeenCalledTimes(1);
    expect(player.rewind).toHaveBeenCalledWith(10);
    expect(player.forward).toHaveBeenCalledWith(10);
    expect(player.setVolume).toHaveBeenCalledWith(60);
    expect(player.setVolume).toHaveBeenCalledWith(40);
    unbind();
    preview.remove();
  });

  test('ignores key events when no preview is open', () => {
    const closeAll = vi.fn();
    const player = makePlayer();
    const unbind = bindKeyboardShortcuts({ keyboardShortcuts: true }, closeAll, player);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));

    expect(player.togglePlay).not.toHaveBeenCalled();
    unbind();
  });

  test('closes on Escape and unbinds cleanly', () => {
    const closeAll = vi.fn();
    const player = makePlayer();
    const preview = addPreview('gitpreview-modal-overlay');
    const unbind = bindKeyboardShortcuts({ keyboardShortcuts: true }, closeAll, player);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closeAll).toHaveBeenCalledTimes(1);

    unbind();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closeAll).toHaveBeenCalledTimes(1);
    preview.remove();
  });
});
