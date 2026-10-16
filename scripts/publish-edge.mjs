/**
 * Publish an extension ZIP to the Microsoft Edge Add-ons store.
 *
 * Uses the current Edge Add-ons **Publish API v1.1** (API-key auth):
 *   Authorization: ApiKey <key>
 *   X-ClientID: <client id>
 *
 * Required env:
 *   EDGE_PRODUCT_ID  - Partner Center > Extension identity > Product ID (GUID)
 *   EDGE_CLIENT_ID   - Partner Center > Publish API > Client ID
 *   EDGE_API_KEY     - Partner Center > Publish API > API key
 *
 * Optional env:
 *   EDGE_API_ENDPOINT (default https://api.addons.microsoftedge.microsoft.com)
 *   RELEASE_NOTES     (notes for certification)
 *
 * Usage: node scripts/publish-edge.mjs <path-to-zip>
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const API_ENDPOINT = process.env.EDGE_API_ENDPOINT || 'https://api.addons.microsoftedge.microsoft.com';
const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 60;

const filePath = process.argv[2];
if (!filePath || !existsSync(filePath)) {
  console.error(`Edge publish: zip not found: ${filePath ?? '(none)'}`);
  process.exit(1);
}

const REQUIRED = ['EDGE_PRODUCT_ID', 'EDGE_CLIENT_ID', 'EDGE_API_KEY'];
const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Edge publish: missing environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const productId = process.env.EDGE_PRODUCT_ID;
const headers = {
  Authorization: `ApiKey ${process.env.EDGE_API_KEY}`,
  'X-ClientID': process.env.EDGE_CLIENT_ID,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function operationIdFrom(response) {
  const location = response.headers.get('location') || response.headers.get('Location') || '';
  return location.split('/').filter(Boolean).pop() || '';
}

async function pollStatus(url, label) {
  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    const response = await fetch(url, { headers });
    if (response.ok) {
      const body = await response.json().catch(() => ({}));
      const status = body.status;
      if (status && status !== 'InProgress') {
        if (status !== 'Succeeded') {
          throw new Error(`${label} failed: ${JSON.stringify(body)}`);
        }
        return body;
      }
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`${label} did not finish within ${(MAX_POLLS * POLL_INTERVAL_MS) / 1000}s`);
}

console.log(`Edge publish: uploading ${filePath}`);
const packageBytes = await readFile(filePath);
const uploadResponse = await fetch(
  `${API_ENDPOINT}/v1/products/${productId}/submissions/draft/package`,
  {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/zip' },
    body: packageBytes,
  },
);

if (uploadResponse.status !== 202) {
  throw new Error(
    `Edge publish: upload failed (${uploadResponse.status}): ${await uploadResponse.text()}`,
  );
}

const uploadOperationId = operationIdFrom(uploadResponse);
await pollStatus(
  `${API_ENDPOINT}/v1/products/${productId}/submissions/draft/package/operations/${uploadOperationId}`,
  'upload',
);
console.log('Edge publish: upload succeeded; submitting for review');

const publishResponse = await fetch(`${API_ENDPOINT}/v1/products/${productId}/submissions`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ notes: process.env.RELEASE_NOTES || 'Automated release' }),
});

if (publishResponse.status !== 202) {
  throw new Error(
    `Edge publish: submit failed (${publishResponse.status}): ${await publishResponse.text()}`,
  );
}

const publishOperationId = operationIdFrom(publishResponse);
await pollStatus(
  `${API_ENDPOINT}/v1/products/${productId}/submissions/operations/${publishOperationId}`,
  'publish',
);
console.log('Edge publish: submitted successfully');
