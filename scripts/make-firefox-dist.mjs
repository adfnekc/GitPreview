#!/usr/bin/env node
/**
 * Builds `dist-firefox/` from the Chrome build in `dist/` without touching it.
 *
 * Keeping the Chrome output pristine matters: `dist/` is what developers load
 * unpacked from, and a Firefox manifest there makes Chrome skip the service
 * worker entirely (`background.scripts` is ignored, so runtime messages fail
 * with "Receiving end does not exist").
 */

import { cpSync, copyFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

// Refuse to derive a Firefox build from an invalid Chrome build.
execFileSync(process.execPath, ['scripts/check-dist.mjs'], { cwd: root, stdio: 'inherit' });

rmSync(`${root}dist-firefox`, { recursive: true, force: true });
cpSync(`${root}dist`, `${root}dist-firefox`, { recursive: true });
copyFileSync(`${root}manifest.firefox.json`, `${root}dist-firefox/manifest.json`);

execFileSync(process.execPath, ['scripts/check-dist.mjs', 'dist-firefox', '--firefox'], {
  cwd: root,
  stdio: 'inherit',
});

console.log('✓ created dist-firefox/ from dist/ (dist/ left as a Chrome build)');
