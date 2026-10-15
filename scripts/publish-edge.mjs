/**
 * Publish an extension ZIP to the Microsoft Edge Add-ons store.
 *
 * Requires (env): EDGE_PRODUCT_ID, EDGE_CLIENT_ID, EDGE_CLIENT_SECRET,
 * EDGE_ACCESS_TOKEN_URL (Azure AD token endpoint from Partner Center).
 *
 * Usage: node scripts/publish-edge.mjs <path-to-zip>
 */
import { existsSync } from 'node:fs';
import { EdgeWebstoreClient } from 'edge-addons-api';

const filePath = process.argv[2];
if (!filePath || !existsSync(filePath)) {
  console.error(`Edge publish: zip not found: ${filePath ?? '(none)'}`);
  process.exit(1);
}

const REQUIRED = ['EDGE_PRODUCT_ID', 'EDGE_CLIENT_ID', 'EDGE_CLIENT_SECRET', 'EDGE_ACCESS_TOKEN_URL'];
const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Edge publish: missing environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const client = new EdgeWebstoreClient({
  productId: process.env.EDGE_PRODUCT_ID,
  clientId: process.env.EDGE_CLIENT_ID,
  clientSecret: process.env.EDGE_CLIENT_SECRET,
  accessTokenUrl: process.env.EDGE_ACCESS_TOKEN_URL,
});

const operationId = await client.submit({
  filePath,
  notes: process.env.RELEASE_NOTES || 'Automated release',
});

console.log(`Edge publish submitted (operation: ${operationId})`);
