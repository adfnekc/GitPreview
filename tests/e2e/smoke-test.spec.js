const { test: base, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const EXT_PATH = path.resolve(__dirname, '../..');
const AUTH_FILE = path.join(__dirname, 'github-auth-state.json');
const hasAuth = fs.existsSync(AUTH_FILE);
const blobUrl = process.env.TEST_BLOB_URL;
const treeUrl = process.env.TEST_TREE_URL;
const isConfigured = hasAuth && blobUrl && treeUrl;

// Shared persistent context — extensions only work with persistent profiles
let sharedContext;

const test = base.extend({
  page: async ({}, use) => {
    if (!sharedContext) {
      const userDataDir = '/tmp/gitpreview-smoke-profile';
      sharedContext = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
          `--disable-extensions-except=${EXT_PATH}`,
          `--load-extension=${EXT_PATH}`,
          '--proxy-bypass-list=<-loopback>',
        ],
        viewport: { width: 1280, height: 720 },
      });

      // Load auth cookies into the persistent context
      if (hasAuth) {
        const state = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
        if (state.cookies && state.cookies.length > 0) {
          await sharedContext.addCookies(state.cookies);
        }
      }
    }

    const page = await sharedContext.newPage();
    await use(page);
    await page.close();
  },
});

test.afterAll(async () => {
  if (sharedContext) {
    await sharedContext.close();
    sharedContext = null;
  }
});

test.describe('GitHub Smoke Tests', () => {

  test('configuration guide', () => {
    console.log('');
    console.log('══════════════════════════════════════════════════');
    console.log('  GitPreview — Smoke Test Configuration');
    console.log('══════════════════════════════════════════════════');
    console.log('');
    console.log(`  Auth state:      ${hasAuth ? '✓ ready' : '✗ missing — run npm run test:e2e:setup'}`);
    console.log(`  TEST_BLOB_URL:   ${blobUrl || '(not set)'}`);
    console.log(`  TEST_TREE_URL:   ${treeUrl || '(not set)'}`);
    console.log('');
    console.log('  To run smoke tests:');
    console.log('    1. npm run test:e2e:setup');
    console.log('    2. export TEST_BLOB_URL="https://github.com/user/repo/blob/main/file.mp3"');
    console.log('    3. export TEST_TREE_URL="https://github.com/user/repo/tree/main/dir"');
    console.log('    4. npm run test:e2e:smoke');
    console.log('');
    console.log('  The smoke tests verify the extension works on real GitHub pages.');
    console.log('  They require an authenticated session and a repo with audio files.');
    console.log('══════════════════════════════════════════════════');
    console.log('');

    expect(true).toBe(true);
  });

  test.describe('Extension Functionality', () => {

    test.beforeEach(async () => {
      test.setTimeout(60_000);
    });

    test('blob page shows inline audio player', async ({ page }) => {
      test.skip(!isConfigured, 'Auth or test URLs not configured');
      await page.goto(blobUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      await expect(page.locator('.gitpreview-inline-container'))
        .toBeVisible({ timeout: 20000 });
      await expect(page.locator('.gitpreview-audio-player'))
        .toBeVisible({ timeout: 10000 });

      const filename = page.locator('.gitpreview-audio-filename');
      await expect(filename).toBeVisible({ timeout: 5000 });
      const text = await filename.textContent();
      console.log(`  Filename displayed: ${text}`);
    });

    test('preview button toggles player on blob page', async ({ page }) => {
      test.skip(!isConfigured, 'Auth or test URLs not configured');
      await page.goto(blobUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      const toggleBtn = page.locator('.gitpreview-blob-preview-btn');
      await expect(toggleBtn).toBeVisible({ timeout: 20000 });

      await expect(toggleBtn).toContainText(/hide/i, { timeout: 3000 });

      await toggleBtn.click();
      await expect(page.locator('.gitpreview-inline-container'))
        .not.toBeVisible({ timeout: 5000 });

      await expect(toggleBtn).toContainText(/preview/i, { timeout: 3000 });

      await toggleBtn.click();
      await expect(page.locator('.gitpreview-inline-container'))
        .toBeVisible({ timeout: 5000 });
    });

    test('tree page shows preview buttons for audio files', async ({ page }) => {
      test.skip(!isConfigured, 'Auth or test URLs not configured');
      await page.goto(treeUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      const previewBtns = page.locator('.gitpreview-preview-btn.gitpreview-btn-icon');
      const count = await previewBtns.count();
      console.log(`  Preview buttons found: ${count}`);
      expect(count).toBeGreaterThan(0);

      // Buttons may be hidden by horizontal overflow; check they're in the DOM
      await expect(previewBtns.first()).toBeAttached({ timeout: 5000 });
    });

    test('modal preview opens from tree page', async ({ page }) => {
      test.skip(!isConfigured, 'Auth or test URLs not configured');
      await page.goto(treeUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      const firstBtn = page.locator('.gitpreview-preview-btn.gitpreview-btn-icon').first();
      await expect(firstBtn).toBeAttached({ timeout: 20000 });

      // Button may be hidden by horizontal overflow; dispatch click via JS
      await firstBtn.dispatchEvent('click');

      await expect(page.locator('.gitpreview-modal-overlay'))
        .toBeVisible({ timeout: 10000 });
      await expect(page.locator('.gitpreview-modal-content .gitpreview-audio-player'))
        .toBeVisible({ timeout: 10000 });

      await page.keyboard.press('Escape');
      await expect(page.locator('.gitpreview-modal-overlay'))
        .not.toBeVisible({ timeout: 5000 });
    });

    test('Escape key closes inline player on blob page', async ({ page }) => {
      test.skip(!isConfigured, 'Auth or test URLs not configured');
      await page.goto(blobUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      await expect(page.locator('.gitpreview-inline-container'))
        .toBeVisible({ timeout: 20000 });

      await page.keyboard.press('Escape');

      await expect(page.locator('.gitpreview-inline-container'))
        .not.toBeVisible({ timeout: 5000 });
    });

    test('audio player elements are all present', async ({ page }) => {
      test.skip(!isConfigured, 'Auth or test URLs not configured');
      await page.goto(blobUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      await expect(page.locator('.gitpreview-inline-container'))
        .toBeVisible({ timeout: 20000 });

      const checks = [
        page.locator('.gitpreview-audio-play-btn'),
        page.locator('#gitpreview-waveform'),
        page.locator('#gitpreview-volume'),
        page.locator('#gitpreview-current-time'),
        page.locator('#gitpreview-total-time'),
        page.locator('.gitpreview-audio-filename'),
        page.locator('.gitpreview-audio-filesize'),
      ];

      for (const el of checks) {
        await expect(el).toBeVisible({ timeout: 10000 });
      }

      const filename = await page.locator('.gitpreview-audio-filename').textContent();
      const filesize = await page.locator('.gitpreview-audio-filesize').textContent();
      const volume = await page.locator('#gitpreview-volume').getAttribute('value');
      console.log(`  File: ${filename} | Size: ${filesize} | Volume: ${volume}`);
    });
  });
});
