import { describe, test, expect } from 'vitest';
import { RangeFetcher } from '../../src/lib/range-fetcher';

describe('RangeFetcher', () => {
  test('supportsRange returns false when MediaSource is undefined', () => {
    const originalMediaSource = (globalThis as any).MediaSource;
    (globalThis as any).MediaSource = undefined;
    expect(RangeFetcher.supportsRange()).toBe(false);
    (globalThis as any).MediaSource = originalMediaSource;
  });

  test('supportsRange returns true when MediaSource is defined', () => {
    (globalThis as any).MediaSource = class {};
    expect(RangeFetcher.supportsRange()).toBe(true);
  });
});
