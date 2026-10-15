import { describe, test, expect } from 'vitest';
import manifest from '../../manifest.json';
import firefoxManifest from '../../manifest.firefox.json';
import pkg from '../../package.json';

describe('manifest', () => {
  test('version matches package.json', () => {
    expect(manifest.version).toBe(pkg.version);
    expect(firefoxManifest.version).toBe(pkg.version);
  });

  test('declares gitlab.com host permission and content script', () => {
    expect(manifest.host_permissions).toContain('https://gitlab.com/*');
    expect(manifest.content_scripts[0]?.matches).toContain('https://gitlab.com/*');
  });

  test('declares the options page and background worker', () => {
    expect(manifest.options_ui?.page).toBe('options.html');
    expect(manifest.background?.service_worker).toBe('background.js');
  });

  test('firefox manifest uses an event-page background and a gecko id', () => {
    expect(firefoxManifest.background?.scripts).toEqual(['background.js']);
    expect(firefoxManifest.browser_specific_settings?.gecko?.id).toBeTruthy();
  });
});
