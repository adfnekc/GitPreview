#!/usr/bin/env node
/**
 * Validates a built extension directory before it is loaded or packaged.
 *
 * Catches the class of bug where the wrong manifest ends up in the output
 * directory (e.g. the Firefox manifest left in `dist/`, which makes Chrome
 * silently fail to start the service worker).
 *
 * Usage:
 *   node scripts/check-dist.mjs [dir] [--firefox]
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const firefox = args.includes('--firefox');
const dirArg = args.find((a) => !a.startsWith('--'));
const dir = resolve(dirArg ?? 'dist');
const label = `${firefox ? 'firefox' : 'chrome'} build at ${dir}`;

const errors = [];
const fail = (message) => errors.push(message);

const mustExist = (relPath, why) => {
  const abs = join(dir, relPath);
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    fail(`missing file "${relPath}" (${why})`);
  }
};

const manifestPath = join(dir, 'manifest.json');
if (!existsSync(manifestPath)) {
  console.error(`✗ ${label}: manifest.json not found`);
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (error) {
  console.error(`✗ ${label}: manifest.json is not valid JSON: ${error.message}`);
  process.exit(1);
}

// Version must match package.json (guards against stale build output).
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));
if (manifest.version !== pkg.version) {
  fail(`manifest version ${manifest.version} does not match package.json ${pkg.version}`);
}

// Background: exactly one of the two shapes, matching the target browser.
const background = manifest.background ?? {};
if (firefox) {
  if (!Array.isArray(background.scripts) || background.scripts.length === 0) {
    fail('firefox manifest must declare background.scripts');
  }
  if (background.service_worker) {
    fail('firefox manifest must not declare background.service_worker');
  }
  background.scripts?.forEach((file) => mustExist(file, 'background script'));
  if (!manifest.browser_specific_settings?.gecko?.id) {
    fail('firefox manifest must declare browser_specific_settings.gecko.id');
  }
} else {
  if (typeof background.service_worker !== 'string') {
    fail('chrome manifest must declare background.service_worker (got background.scripts?)');
  } else {
    mustExist(background.service_worker, 'service worker');
  }
  if (background.scripts) {
    fail('chrome manifest must not declare background.scripts');
  }
  if (manifest.browser_specific_settings) {
    fail('chrome manifest must not declare browser_specific_settings');
  }
}

// Content scripts.
const contentScripts = manifest.content_scripts ?? [];
if (contentScripts.length === 0) fail('manifest declares no content_scripts');
for (const script of contentScripts) {
  script.js?.forEach((file) => mustExist(file, 'content script'));
  script.css?.forEach((file) => mustExist(file, 'content style'));
}

// Icons.
for (const file of Object.values(manifest.icons ?? {})) {
  mustExist(file, 'icon');
}

// Options page.
if (!firefox) {
  const optionsPage = manifest.options_ui?.page;
  if (!optionsPage) fail('chrome manifest must declare options_ui.page');
  else mustExist(optionsPage, 'options page');
}

// Declarative net request rules.
for (const resource of manifest.declarative_net_request?.rule_resources ?? []) {
  mustExist(resource.path, 'declarativeNetRequest ruleset');
}

if (errors.length > 0) {
  console.error(`✗ ${label} is invalid:`);
  errors.forEach((message) => console.error(`  - ${message}`));
  process.exit(1);
}

console.log(`✓ ${label} is valid (v${manifest.version})`);
