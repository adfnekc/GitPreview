# Security Policy

## Reporting a vulnerability

Please report security issues privately via GitHub's
[Security Advisories](https://github.com/adfnekc/GitPreview/security/advisories/new)
rather than opening a public issue.

## Secrets and credentials

- **No credentials are stored in the repository.** Store API keys
  (Chrome Web Store, Firefox AMO, Microsoft Edge) live only as GitHub Actions
  secrets, are injected only into the `publish` job of
  `.github/workflows/release.yml`, and are masked in logs.
- The CRX signing key `keys/gitpreview.pem` is gitignored, is **never**
  committed, and is not included in the built `dist/`, the ZIP archives, or the
  CRX.
- `.gitignore` excludes `keys/`, `dist/`, `release/`, `web-ext-artifacts/`,
  `.claude/`, and the saved browser session used by e2e auth setup
  (`tests/e2e/github-auth-state.json`).

## Automated secret scanning

Every push to `main` and every pull request runs
[gitleaks](https://github.com/gitleaks/gitleaks) over the **full git history**
(see the `secret-scan` job in `.github/workflows/ci.yml`). The ruleset and the
one known-historical allowlist entry are in `.gitleaks.toml`.

To run it locally:

```bash
gitleaks git . --config .gitleaks.toml --redact
```

## Known historical finding (accepted)

Commit `68c1dfa` (2026-05-06) added two saved GitHub web pages,
`html/blob.html` and `html/tree.html` (deleted in `52cec5f`). They embed an
expired, session-scoped GitHub `uploadToken` and the author's public commit
email. The token is not revocable through git and has long expired, so it is
allowlisted in `.gitleaks.toml`. If you are the maintainer and want it erased
from history, use `git filter-repo` and force-push (rewrites all SHAs).

## Hardening notes

- The release workflow does not use `npm ci --ignore-scripts` because esbuild's
  postinstall is required; instead, build/test run in a job that has **no**
  store credentials, and publishing happens in a separate job on a fresh runner.
