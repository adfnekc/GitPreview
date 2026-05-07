/**
 * GitPreview - Auth Setup for GitHub Smoke Tests
 *
 * Opens a browser with the extension loaded so you can log in to GitHub.
 * Your authenticated session is saved for automated smoke tests.
 *
 * Usage: node tests/e2e/auth-setup.js
 */

const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const AUTH_FILE = path.join(__dirname, 'github-auth-state.json');
const EXTENSION_PATH = path.resolve(__dirname, '../..');

function ask(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(query, answer => { rl.close(); resolve(answer); }));
}

async function main() {
  console.log('');
  console.log('══════════════════════════════════════════════');
  console.log('  GitPreview — Smoke Test Auth Setup');
  console.log('══════════════════════════════════════════════');
  console.log('');

  if (fs.existsSync(AUTH_FILE)) {
    const answer = await ask('⚠  Auth state already exists. Re-create it? (y/N): ');
    if (answer.toLowerCase() !== 'y') {
      console.log('  Skipped. Run `npm run test:e2e:smoke` to start tests.\n');
      return;
    }
  }

  console.log('  Launching browser with extension loaded...\n');

  const userDataDir = '/tmp/gitpreview-auth-profile';
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--proxy-bypass-list=<-loopback>',
    ],
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();
  await page.goto('https://github.com/login');

  console.log('  ┌─────────────────────────────────────────────────────┐');
  console.log('  │  1. Log in to GitHub in the opened browser window   │');
  console.log('  │  2. Complete 2FA if prompted                       │');
  console.log('  │  3. Return here and press Enter to save session    │');
  console.log('  └─────────────────────────────────────────────────────┘');
  console.log('');
  await ask('  Press Enter after logging in...');

  await context.storageState({ path: AUTH_FILE });
  console.log(`\n  ✓  Session saved: ${AUTH_FILE}`);

  await context.close();

  console.log('');
  console.log('  ───────────────────────────────────────────');
  console.log('  Next step:');
  console.log('    1. Set environment variables:');
  console.log('       export TEST_BLOB_URL="https://github.com/user/repo/blob/main/file.mp3"');
  console.log('       export TEST_TREE_URL="https://github.com/user/repo/tree/main/sounds"');
  console.log('    2. Run: npm run test:e2e:smoke');
  console.log('  ───────────────────────────────────────────');
  console.log('');
}

main().catch(err => {
  console.error('\n✗  Setup failed:', err.message);
  process.exit(1);
});
