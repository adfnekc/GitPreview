/// <reference types="node" />
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pkg from '../../package.json';

const repoRoot = resolve(__dirname, '../..');
const script = join(repoRoot, 'scripts/check-dist.mjs');

let dir: string;

function writeManifest(manifest: unknown): void {
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
}

function writeFiles(files: string[]): void {
  for (const file of files) {
    const abs = join(dir, file);
    mkdirSync(resolve(abs, '..'), { recursive: true });
    writeFileSync(abs, '');
  }
}

const chromeManifest = {
  manifest_version: 3,
  name: 'Test',
  version: pkg.version,
  icons: { 16: 'assets/icons/icon16.png' },
  permissions: ['storage'],
  options_ui: { page: 'options.html' },
  declarative_net_request: { rule_resources: [{ id: 'csp', enabled: true, path: 'rules.json' }] },
  content_scripts: [
    { matches: ['https://github.com/*'], js: ['content.js'], css: ['content.css'] },
  ],
  background: { service_worker: 'background.js' },
};

function runCheck(...args: string[]) {
  return spawnSync(process.execPath, [script, dir, ...args], { encoding: 'utf8' });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gitpreview-check-dist-'));
  writeFiles([
    'background.js',
    'content.js',
    'content.css',
    'assets/icons/icon16.png',
    'options.html',
    'rules.json',
  ]);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('check-dist', () => {
  test('accepts a valid Chrome build', () => {
    writeManifest(chromeManifest);
    const result = runCheck();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('chrome build');
  });

  test('rejects a Firefox manifest in the Chrome output dir', () => {
    // Regression: a stale Firefox manifest in dist/ makes Chrome skip the
    // service worker, so runtime messages fail with "Receiving end does not exist".
    writeManifest({
      ...chromeManifest,
      background: { scripts: ['background.js'] },
      browser_specific_settings: { gecko: { id: 'test@example.com' } },
    });
    const result = runCheck();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('background.service_worker');
  });

  test('rejects a Chrome build missing the service worker file', () => {
    writeManifest(chromeManifest);
    rmSync(join(dir, 'background.js'));
    const result = runCheck();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('missing file "background.js"');
  });

  test('accepts a valid Firefox build with --firefox', () => {
    writeManifest({
      manifest_version: 3,
      name: 'Test',
      version: pkg.version,
      icons: { 16: 'assets/icons/icon16.png' },
      content_scripts: [
        { matches: ['https://github.com/*'], js: ['content.js'], css: ['content.css'] },
      ],
      background: { scripts: ['background.js'] },
      browser_specific_settings: { gecko: { id: 'test@example.com' } },
    });
    const result = runCheck('--firefox');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('firefox build');
  });

  test('rejects a mismatched version', () => {
    writeManifest({ ...chromeManifest, version: '0.0.0' });
    const result = runCheck();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('does not match package.json');
  });
});
