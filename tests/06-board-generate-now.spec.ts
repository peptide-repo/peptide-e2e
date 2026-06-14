/**
 * 06-board-generate-now.spec.ts
 *
 * What: Smoke for the PRAutoBlogger board "Generate Now" control (v0.21.0, M4).
 *       Asserts that the board page renders the generate-now button and that
 *       clicking it sends the kick-off AJAX request without a PHP fatal.
 *       Read-only assertions only — this test NEVER waits for article generation
 *       to complete (that would make LLM API calls in CI).
 *
 * SKIP-IF-ABSENT (M4 binding): the generate-now surface ships with v0.21.0
 *   (prautoblogger PR #166). This spec guards against the board container
 *   (#prab-board) being absent or the generate-now button (#prab-generate-now)
 *   missing. When those selectors are absent (v0.21.0 not yet deployed), the
 *   entire test suite skips with a loud annotation so this PR can merge before
 *   the plugin PR — matching the M2 merge-order binding.
 *
 * Selectors sourced from prautoblogger v0.21.0:
 *   templates/admin/board-page.php: #prab-board, #prab-generate-now
 *   assets/js/board-generate.js:    data-nonce, wp.ajax / admin-ajax.php
 *
 * Who triggers it: Playwright chromium project (post-auth setup).
 * Dependencies: wp-admin authenticated session (from global.setup.ts).
 *
 * @see prautoblogger PR #166 (v0.21.0) — the surface under test.
 */

import { test, expect } from '@playwright/test';

const ADMIN = '/wp-admin';
const BOARD_URL = `${ADMIN}/admin.php?page=prautoblogger-board`;

test.describe('WP Admin — PRAutoBlogger board Generate Now (M4)', () => {
  test('board page loads and generate-now button is present (skip-if-absent)', async ({ page }) => {
    // Navigate to the board page.
    const res = await page.goto(BOARD_URL);

    // Must be HTTP 200 (guards menu-registration regression).
    expect(res?.status()).toBe(200);

    // wp-admin chrome must be present.
    await expect(page.locator('#wpbody')).toBeVisible();

    // Body must not contain PHP fatal or wp_die error strings.
    const body = await page.textContent('body');
    expect(body).not.toContain('Fatal error');
    expect(body).not.toContain('Invalid plugin page');

    // ── SKIP-IF-ABSENT guard ────────────────────────────────────────────────
    // The generate-now surface ships with v0.21.0. If the board container or
    // the button is absent, the M4 plugin is not yet deployed — skip loudly.
    const boardContainer = page.locator('#prab-board');
    const boardPresent = await boardContainer.count() > 0;

    if ( ! boardPresent ) {
      test.info().annotations.push({
        type: 'skip',
        description:
          '[generate-now smoke] #prab-board absent: v0.21.0 (M4) not yet deployed. ' +
          'Skipping generate-now assertions — they will gate once the plugin PR ships.',
      });
      test.skip();
      return;
    }

    // Board container must be visible.
    await expect(boardContainer).toBeVisible({ timeout: 10_000 });

    // ── Generate-now button (skip-if-absent) ────────────────────────────────
    const generateBtn = page.locator('#prab-generate-now');
    const btnPresent = await generateBtn.count() > 0;

    if ( ! btnPresent ) {
      test.info().annotations.push({
        type: 'skip',
        description:
          '[generate-now smoke] #prab-generate-now absent: M4 button not yet in deployed build. ' +
          'Skipping button assertions.',
      });
      test.skip();
      return;
    }

    // Button must be visible and carry a nonce for the AJAX call.
    await expect(generateBtn).toBeVisible({ timeout: 5_000 });
    const nonce = await generateBtn.getAttribute('data-nonce');
    expect(nonce).toBeTruthy();

    console.log(
      '[generate-now smoke] Generate Now button found with nonce — M4 surface is deployed.'
    );
  });

  test('generate-now AJAX responds with JSON (no fatal) — skip-if-absent', async ({ page, request }) => {
    // Navigate first to establish auth cookies for the request context.
    await page.goto(BOARD_URL);

    const body = await page.textContent('body');
    if ( ! body?.includes('prab-board') ) {
      test.info().annotations.push({
        type: 'skip',
        description: '[generate-now smoke] Board container absent — v0.21.0 not deployed. Skipping.',
      });
      test.skip();
      return;
    }

    const generateBtn = page.locator('#prab-generate-now');
    if ( await generateBtn.count() === 0 ) {
      test.info().annotations.push({
        type: 'skip',
        description: '[generate-now smoke] #prab-generate-now absent — skipping AJAX test.',
      });
      test.skip();
      return;
    }

    // Read the nonce from the button (set by wp_localize_script).
    const nonce = await generateBtn.getAttribute('data-nonce') ?? '';

    // Fire the kick-off AJAX action (same as board-generate.js would).
    // We use the request context to intercept without actually triggering
    // the full pipeline — the action is idempotent (kick_off() guards against
    // duplicate scheduling with wp_next_scheduled()).
    //
    // NOTE: We assert the response is valid JSON with a 'success' or 'data'
    // key only. We do NOT check that generation actually runs (LLM calls).
    const adminAjax = `${ADMIN}/admin-ajax.php`;
    const formData = new URLSearchParams({
      action: 'prautoblogger_generate_now',
      nonce,
    });

    const ajaxRes = await request.post(adminAjax, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: formData.toString(),
    });

    // Must be HTTP 200 (not 403/500).
    expect(ajaxRes.status()).toBe(200);

    // Response must be valid JSON (no PHP fatal/notice dumped as HTML).
    const text = await ajaxRes.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(
        `[generate-now smoke] AJAX response is not valid JSON — possible PHP fatal.\nRaw: ${text.slice(0, 500)}`
      );
    }

    // WordPress wp_send_json_success / _error always wraps in { success: bool }.
    expect(parsed).toHaveProperty('success');
    console.log('[generate-now smoke] AJAX response:', JSON.stringify(parsed).slice(0, 200));
  });
});
