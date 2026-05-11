import { describe, test, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { NetworkAware } from '../../src/lib/network-aware';

describe('NetworkAware', () => {
  beforeAll(() => {
    vi.stubGlobal('navigator', {});
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  let originalConnection: any;

  beforeEach(() => {
    originalConnection = (navigator as any).connection;
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'connection', {
      value: originalConnection,
      configurable: true,
    });
  });

  test('isExpensiveConnection returns false when connection API is unavailable', () => {
    Object.defineProperty(navigator, 'connection', {
      value: undefined,
      configurable: true,
    });
    expect(NetworkAware.isExpensiveConnection()).toBe(false);
  });

  test('isExpensiveConnection returns true for cellular type', () => {
    Object.defineProperty(navigator, 'connection', {
      value: { type: 'cellular', effectiveType: '4g' },
      configurable: true,
    });
    expect(NetworkAware.isExpensiveConnection()).toBe(true);
  });

  test('isExpensiveConnection returns true for 3g effective type', () => {
    Object.defineProperty(navigator, 'connection', {
      value: { type: 'wifi', effectiveType: '3g' },
      configurable: true,
    });
    expect(NetworkAware.isExpensiveConnection()).toBe(true);
  });

  test('isExpensiveConnection returns false for wifi 4g', () => {
    Object.defineProperty(navigator, 'connection', {
      value: { type: 'wifi', effectiveType: '4g' },
      configurable: true,
    });
    expect(NetworkAware.isExpensiveConnection()).toBe(false);
  });

  test('exceedsThreshold returns true when size exceeds 5MB default', () => {
    expect(NetworkAware.exceedsThreshold(6 * 1024 * 1024)).toBe(true);
  });

  test('exceedsThreshold returns false when size is under 5MB default', () => {
    expect(NetworkAware.exceedsThreshold(4 * 1024 * 1024)).toBe(false);
  });

  test('exceedsThreshold respects custom threshold', () => {
    expect(NetworkAware.exceedsThreshold(2 * 1024 * 1024, 1)).toBe(true);
    expect(NetworkAware.exceedsThreshold(500 * 1024, 1)).toBe(false);
  });

  test('shouldWarn returns true when expensive and exceeds threshold', () => {
    Object.defineProperty(navigator, 'connection', {
      value: { type: 'cellular', effectiveType: '4g' },
      configurable: true,
    });
    expect(NetworkAware.shouldWarn(6 * 1024 * 1024)).toBe(true);
  });

  test('shouldWarn returns false when not expensive', () => {
    Object.defineProperty(navigator, 'connection', {
      value: { type: 'wifi', effectiveType: '4g' },
      configurable: true,
    });
    expect(NetworkAware.shouldWarn(100 * 1024 * 1024)).toBe(false);
  });
});
