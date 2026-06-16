# peptide-e2e

Playwright smoke tests and shared CI/CD pipelines for the [peptiderepo.com](https://peptiderepo.com) estate.

## Reusable workflows

This repo hosts shared GitHub Actions workflows called by all 7 app repos.

### `deploy-app.yml` — shared deploy pipeline

Handles staging rsync → Playwright smoke → production rsync → inventory guard →
LiteSpeed cache purge → health check. Called by every app's `deploy.yml` via
`uses: peptiderepo/peptide-e2e/.github/workflows/deploy-app.yml@main`.

### `ci.yml` — reusable CI (PHP lint, PHPCS, 300-line, PHPUnit, JS lint)

Standardised CI for every estate repo. Consistent job names so `deploy-app.yml`
can gate on them uniformly.

**Adopt in any repo** — create `.github/workflows/ci.yml` in the caller repo:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

# Required: the called ci.yml phpcs job declares contents: write for phpcbf
# commit-back. GitHub enforces that callers must grant at least the permission
# level the reusable workflow's jobs request.
permissions:
  contents: write

jobs:
  ci:
    uses: peptiderepo/peptide-e2e/.github/workflows/ci.yml@main
    with:
      tests: stubs        # stubs | wp-framework | brain-monkey | none
      has_js: false       # set true if the repo ships JS
    secrets: inherit
```

**Full input reference:**

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `php_versions` | string | `'["8.1","8.2","8.3"]'` | JSON array of PHP versions to matrix over |
| `tests` | string | `stubs` | PHPUnit environment: `stubs`, `wp-framework`, `brain-monkey`, or `none` |
| `enforce_300` | boolean | `true` | Fail if any tracked `*.php` file under `line_limit_paths` exceeds 300 lines |
| `line_limit_paths` | string | `includes` | Space-separated paths the 300-line rule applies to |
| `has_js` | boolean | `false` | Whether to run JS linting (`npm run lint` or `node --check`) |
| `phpcs_autofix` | boolean | `true` | On PRs: run phpcbf and commit fixes back before strict PHPCS |

**PHPUnit `tests` values explained:**

- `stubs` — WP stubs only (fast, no DB); just runs `composer test`.
- `brain-monkey` — Brain Monkey mocking; no DB; runs `composer test`.
- `wp-framework` — Full WordPress test framework: provisions MySQL service,
  installs svn, runs `bin/install-wp-tests.sh`, then `composer test`. Handles
  the three known gotchas: svn install, `--skip-db-create` with MySQL service,
  `WP_CORE_DIR` trailing slash.
- `none` — Skips the `phpunit` job entirely (temporary; repos without a suite
  yet; remove at rollout).

**phpcbf auto-commit:** on `pull_request` events, phpcbf runs first and commits
any auto-fixable violations back to the PR branch via `GITHUB_TOKEN`. GitHub
prevents loops — bot commits do not trigger a new CI run. Strict PHPCS then
runs and fails only on non-auto-fixable violations.

**Job names** (fixed — callers and `deploy-app.yml` `needs:` these):
`lint-php`, `phpcs`, `file-size`, `phpunit`, `lint-js`.

## Smoke tests

The `tests/` directory contains Playwright specs that run against
`https://staging.peptiderepo.com` (via `deploy-app.yml`) and can also target
production. See `playwright.config.ts` for environment configuration.

```
tests/
  00-homepage.spec.ts
  01-reconstitution-calculator.spec.ts
  02-peptide-search.spec.ts
  03-admin-plugins.spec.ts
  04-rest-api.spec.ts
  05-dossier-edit.spec.ts
  06-board-generate-now.spec.ts
```

## Development

```bash
npm ci
npx playwright install --with-deps chromium
BASE_URL=https://staging.peptiderepo.com npm test
```
