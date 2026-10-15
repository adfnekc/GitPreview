import { describe, test, expect } from 'vitest';
import manifest from '../../manifest.json';
import pkg from '../../package.json';

describe('manifest', () => {
  test('version matches package.json', () => {
    expect(manifest.version).toBe(pkg.version);
  });

  test('declares gitlab.com host permission and content script', () => {
    expect(manifest.host_permissions).toContain('https://gitlab.com/*');
    expect(manifest.content_scripts[0]?.matches).toContain('https://gitlab.com/*');
  });

  test('declares the options page and background worker', () => {
    expect(manifest.options_ui?.page).toBe('options.html');
    expect(manifest.background?.service_worker).toBe('background.js');
  });
});
