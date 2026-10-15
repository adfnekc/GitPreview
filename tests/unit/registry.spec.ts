import { describe, test, expect, vi } from 'vitest';
import {
  registerHandler,
  getHandler,
  isSupported,
  closeAllHandlers,
} from '../../src/preview/registry';
import type { PreviewHandler } from '../../src/preview/handler';

function makeHandler(extensions: string[], onClose?: () => void): PreviewHandler {
  return { extensions, openPreview: () => {}, close: onClose };
}

describe('registry', () => {
  test('getHandler returns the handler for an extension', () => {
    const handler = makeHandler(['zzz']);
    registerHandler(handler);
    expect(getHandler('zzz')).toBe(handler);
    expect(isSupported('zzz')).toBe(true);
  });

  test('isSupported is false for unknown extensions', () => {
    expect(isSupported('nope')).toBe(false);
    expect(getHandler('nope')).toBeUndefined();
  });

  test('registers every extension of a handler', () => {
    const handler = makeHandler(['e1', 'e2']);
    registerHandler(handler);
    expect(getHandler('e1')).toBe(handler);
    expect(getHandler('e2')).toBe(handler);
  });

  test('closeAllHandlers calls every registered close()', () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    registerHandler(makeHandler(['aaa'], closeA));
    registerHandler(makeHandler(['bbb'], closeB));
    closeAllHandlers();
    expect(closeA).toHaveBeenCalled();
    expect(closeB).toHaveBeenCalled();
  });
});
