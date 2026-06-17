# Changelog

## [1.7.1] - 2026-06-17

### Changed
- **CI/CD**: Switch `deploy-staging`, `deploy-production`, and `smoke` jobs from
  `ubuntu-latest` (GitHub-hosted) to `[self-hosted, peptide-vps]` (org runner on
  KVM8 VPS). This routes all Hostinger SSH/rsync traffic through our stable VPS IP,
  fixing the Azure-region throttle that caused intermittent deploy failures.
  Callers' CI/validate jobs are unaffected (remain on `ubuntu-latest`).

## [1.7.0] - 2026-06-17

### Added
- **Peptide News admin smoke (07)** (`07-peptide-news-admin.spec.ts`).
  Covers the Peptide News Plugin admin surfaces: dashboard (HTTP 200, no fatal,
  h1 "Peptide News Analytics" heading, `.pn-summary-cards`, `.pn-date-filter`),
  settings (form present), articles, and LLM costs sub-pages. Skip-if-absent guard
  on all tests using the standard 05/06 merge-early binding pattern. Slugs sourced
  from `admin/class-pn-admin-menu.php`.

- **PR Vision admin smoke (08)** (`08-pr-vision-admin.spec.ts`).
  Covers the PR Vision plugin admin surfaces: dashboard (HTTP 200, no fatal,
  h1 "PR Vision" visible), Settings page (API-key-manager card `#prv-key-card`
  present, status badge `#prv-key-source-badge` visible), write-only security
  invariant (`#prv_api_key` value="" + full HTML must not contain "sk-or-"),
  Costs sub-page (`pr-vision-costs`), and Call Log sub-page (`pr-vision-calls`).
  Skip-if-absent at two levels: plugin absent (loud annotation + skip), and
  `#prv-key-card` absent (Settings v0.2.0 not yet deployed on environment).
  Selectors sourced from `class-prv-admin-page.php`, `class-prv-key-manager-renderer.php`.


All notable changes to the peptide-e2e smoke suite will be documented here.

## [1.6.0] - 2026-06-16

## [1.6.1] - 2026-06-16

### Fixed
- **P2-A injection** (`ci.yml:239`): `${{ inputs.line_limit_paths }}` moved
  from raw shell assignment into an `env:` block (`PATHS`); shell now reads
  `$PATHS` — eliminates template-injection surface for caller-supplied input.
- **P2-B lint-js fallback** (`ci.yml:378`): replaced `npm run lint --if-present`
  (exits 0 when no lint script exists, killing the fallback branch) with
  explicit `node -e "process.exit(…)"` detection; `node --check` scan now
  actually runs when no `lint` npm script is defined.
- **P2-C phpcs config mismatch** (`ci.yml:178-199, 206-223`): both phpcbf
  and phpcs steps now detect which of `phpcs.xml` / `phpcs.xml.dist` /
  `.phpcs.xml.dist` is present and pass that file to `--standard`; guard and
  command now agree for all three variants.


### Added
- **Reusable CI workflow** (`.github/workflows/ci.yml`).
  `on: workflow_call` entrypoint that every estate repo will adopt as a thin
  caller. Inputs: `php_versions` (JSON matrix), `tests`
  (stubs|wp-framework|brain-monkey|none), `enforce_300`, `line_limit_paths`,
  `has_js`, `phpcs_autofix`. Fixed job names (`lint-php`, `phpcs`, `file-size`,
  `phpunit`, `lint-js`) so deploy-app.yml can `needs:` them uniformly.
  - **phpcbf auto-commit** (prautoblogger gold-standard pattern): on
    `pull_request` events, phpcbf runs and pushes any fixes back to the branch
    before strict PHPCS; on `push` events auto-commit is skipped to prevent
    loops.
  - **wp-framework PHPUnit path** replicates all three peptide-starter-theme
    gotchas: (1) install svn; (2) pass skip-db-create=true so the MySQL
    service's pre-created DB is reused; (3) WP_CORE_DIR trailing slash.
  - **Self-test caller** (`.github/workflows/ci-self-test.yml`): exercises
    the reusable workflow on this repo with `tests: none` so the workflow is
    validated on this PR itself.
  - **README.md**: adoption snippet documenting how any repo becomes a caller.


## [1.5.0] - 2026-06-14

### Added
- **Board Generate Now smoke (M4, skip-if-absent)** (`06-board-generate-now.spec.ts`).
  Asserts the PRAutoBlogger board page loads, `#prab-generate-now` button is present
  and carries a nonce, and the kick-off AJAX action returns valid JSON (no PHP fatal).
  READ-ONLY: never waits for generation to complete; `kick_off()` is idempotent.
  SKIPS with a loud annotation when `#prab-board` or `#prab-generate-now` is absent
  (v0.21.0 M4 not yet deployed) so the e2e PR can merge before prautoblogger PR #166
  per the M2/M3 merge-order binding. 27 tests total (was 25), delta = 2.

## [1.4.0] - 2026-06-12

### Added
- **Dossier edit + re-run smoke (M3, skip-if-absent)** (`05-dossier-edit.spec.ts`).
  Opens a discovered post's dossier and exercises the v0.20.0 edit surface READ-ONLY:
  opens/closes the first edit panel (asserts textareas, Save/Re-run buttons, the
  fork-preserved + queued-execution copy), asserts every disabled edit affordance
  carries a visible reason, and checks the M3 sidebar cards (Run Spend, Models &
  Prompts). NEVER clicks Save or any Re-run button (those fork inputs / queue paid
  LLM jobs). SKIPS with a loud annotation when `.prab-stage-rerun-footer` is absent
  (plugin v0.20.0 not yet deployed) so this PR can merge before prautoblogger PR #161
  per the M3 merge-order binding. 25 tests total (was 24), delta = 1.

## [1.3.0] - 2026-06-12

### Fixed
- **Auth setup survives `ERR_ABORTED` on wp-login.php** (`global.setup.ts`).
  When Hostinger's LiteSpeed throttles a GitHub runner IP, `page.goto` can
  throw `net::ERR_ABORTED` rather than a `TimeoutError`. Playwright marks the
  browser context closed internally on abort, so the existing
  `context.close()` call in the catch block threw
  `"browserContext.close: Target page, context or browser has been closed"`,
  which propagated out of catch and killed setup before the remaining retries
  ran. Two production deploys were blocked by this flake on 2026-06-12.

  Fix: introduced `safeClose()` helper that swallows the already-closed
  error, so an aborted context never terminates the retry loop. Max attempts
  raised from 3 → 5; backoff is now exponential (5 s / 10 s / 20 s / 40 s)
  instead of a flat 15 s, giving the throttle window more time to clear.
  Worst-case timing: 5 × 90 s navigation + 75 s backoff = ~525 s, well under
  the 900 s (15 min) job timeout. Final-failure message explicitly names the
  LiteSpeed throttle hypothesis so future CI logs self-diagnose.

## [1.2.0] - 2026-06-12

### Added
- **Dossier page smoke test** (`03-admin-plugins.spec.ts` — `WP Admin — PRAutoBlogger Article Dossier`).
  Navigates to `/wp-admin/admin.php?page=prautoblogger-dossier&post_id=<N>`, asserts HTTP 200,
  `#prab-dossier` container visible, body does NOT contain "Invalid plugin page" or "Fatal error".
  Guards against: menu-ordering regression (wrong hookname → wp_die 404), PHP fatals on dossier
  load, missing dossier container, and stage-section regression.

  Defensive strategy: tries canonical staging post IDs 925/930 first, then falls back to the
  most recent REST post, then falls back to post_id=0 (graceful empty state). Stage-section
  assertions are conditional on a run record existing. Loud test.info() annotations on fallback
  paths. New in PRAutoBlogger v0.19.2 / v0.19.3.

## [1.1.0] - 2026-06-12

### Added
- **Board page smoke test** (`03-admin-plugins.spec.ts` — `WP Admin — PRAutoBlogger board page`).
  Navigates to `/wp-admin/admin.php?page=prautoblogger-board`, asserts HTTP 200,
  `#prab-board` container visible, and body does NOT contain "Invalid plugin page".
  Guards against the v0.19.1 regression class: Board submenu registered before parent
  menu existed (both at admin_menu priority 10) → WordPress fallback hookname →
  wp_die 404. Now in the deploy-gate smoke suite so this failure class is un-shippable.

  Note: cannot be validated against prod until v0.19.1 of PRAutoBlogger deploys.
  Spec compiles and lists cleanly under `npx playwright test --list`.

## [1.0.0] - 2026-06-11

Initial release. 21 tests across 5 specs: homepage, reconstitution calculator,
peptide search, admin plugins, REST API.
