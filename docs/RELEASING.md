# Releasing

## Local artifacts

```bash
npm run release:artifacts
```

Produces, in `release/`:

| File | Used for |
| --- | --- |
| `gitpreview-v<version>.crx` | manual/sideload install, Opera |
| `gitpreview-v<version>-chrome.zip` | Chrome Web Store, Microsoft Edge Add-ons |
| `gitpreview-v<version>-firefox.zip` | Firefox AMO |

The CRX is signed with `keys/gitpreview.pem` (do not commit changes to it once a
listing exists — the key determines the extension ID).

## Automated release

`.github/workflows/release.yml` runs on tags matching `v*` (or manually via
`workflow_dispatch`). It type-checks, lints, tests, builds the Chrome + Firefox
zips, creates a GitHub Release with those artifacts attached, and then publishes
to each store **only if the corresponding secrets are configured**.

The signed `.crx` is only produced locally (`npm run package` / `release:artifacts`)
because it needs the private key; the stores accept the ZIP archives.

### Required repository secrets

Chrome Web Store (`chrome-webstore-upload-cli`):

| Secret | Where to get it |
| --- | --- |
| `CWS_CLIENT_ID` | Google Cloud OAuth client |
| `CWS_CLIENT_SECRET` | Google Cloud OAuth client |
| `CWS_REFRESH_TOKEN` | OAuth refresh token for the Web Store API |
| `CWS_EXTENSION_ID` | Chrome Web Store item ID |
| `CWS_PUBLISHER_ID` | Chrome Web Store publisher ID |

Firefox AMO (`web-ext sign`):

| Secret | Where to get it |
| --- | --- |
| `AMO_API_KEY` | AMO → Tools → Manage API Keys (JWT issuer) |
| `AMO_API_SECRET` | AMO → Tools → Manage API Keys (JWT secret) |

Microsoft Edge Add-ons (`scripts/publish-edge.mjs`):

| Secret | Where to get it |
| --- | --- |
| `EDGE_PRODUCT_ID` | Partner Center → extension product id |
| `EDGE_CLIENT_ID` | Azure AD app registration |
| `EDGE_CLIENT_SECRET` | Azure AD app registration |
| `EDGE_ACCESS_TOKEN_URL` | Azure AD token endpoint |

### Stores without an automated step

- **Opera Add-ons** has no public upload API. Upload
  `gitpreview-v<version>-chrome.zip` manually at
  <https://addons.opera.com/developer/>.
- **Brave / Vivaldi** install extensions from the Chrome Web Store, so no
  separate submission is needed.

## Cutting a release

```bash
# 1. Bump the version in package.json, manifest.json, manifest.firefox.json
# 2. Update CHANGELOG.md
npm run typecheck && npm run lint && npm test
npm run release:artifacts
git add -A && git commit -m "release: v<version>"
git tag v<version>
git push origin main --tags
# The tag push triggers .github/workflows/release.yml
```

Pushing to the remote requires explicit approval (see `AGENTS.md`).
