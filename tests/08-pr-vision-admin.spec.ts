/**
 * 08-pr-vision-admin.spec.ts
 *
 * What: Smoke tests for the PR Vision plugin admin surfaces.
 *       Covers the dashboard, Settings (API-key-manager card + write-only
 *       invariant), Costs, and Call Log sub-pages. Guards against PHP fatals,
 *       missing menu registration, and key leakage regressions.
 *
 * Who triggers it: Playwright chromium project (post-auth setup).
 * Dependencies: wp-admin authenticated session (from global.setup.ts).
 *
 * SKIP-IF-ABSENT: When PR Vision is not installed/activated on this
 *   environment, each test detects the absent page and skips with a loud
 *   annotation - consistent with the 05/06 merge-early binding pattern.
 *
 * Admin menu slugs (sourced from includes/core/class-prv-admin-page.php
 *   and includes/core/class-prv-settings-page.php,
 *       includes/core/class-prv-costs-page.php,
 *       includes/core/class-prv-call-log-page.php):
 *   Dashboard  -> admin.php?page=pr-vision           (MENU_SLUG = 'pr-vision')
 *   Settings   -> admin.php?page=pr-vision-settings  (MENU_SLUG = 'pr-vision-settings')
 *   Costs      -> admin.php?page=pr-vision-costs     (MENU_SLUG = 'pr-vision-costs')
 *   Call Log   -> admin.php?page=pr-vision-calls     (MENU_SLUG = 'pr-vision-calls')
 *
 * Selectors sourced from includes/core/class-prv-admin-page.php:
 *   h1 "PR Vision - AI Visibility"  - dashboard page heading
 *
 * Selectors sourced from includes/core/class-prv-key-manager-renderer.php:
 *   #prv-key-card                  - the API-key-manager card container
 *   #prv-key-source-badge          - key source status indicator span
 *   #prv_api_key                   - password input (must render empty - write-only invariant)
 *
 * Write-only invariant (security):
 *   The stored OpenRouter key must NEVER appear in page source.
 *   #prv_api_key renders with value="" on every page load regardless of
 *   whether a key is stored. This spec asserts the empty value and asserts
 *   that known API key prefixes ("sk-or-") are absent from the full body.
 *
 * @see peptiderepo/pr-vision includes/core/class-prv-admin-page.php
 * @see peptiderepo/pr-vision includes/core/class-prv-settings-page.php
 * @see peptiderepo/pr-vision includes/core/class-prv-key-manager-renderer.php
 */

import { test, expect } from '@playwright/test';

const ADMIN = '/wp-admin';

/**
 * Detect the "page not registered" condition WordPress returns when a plugin
 * menu slug is unknown. Returns true when the plugin is absent.
 */
function isPluginAbsent(body: string, url: string): boolean {
  return (
    body.includes('Invalid plugin page') ||
    body.includes('do not have sufficient permissions') ||
    body.includes('The page you are looking for') ||
    ( url.includes('/wp-admin/') && ! url.includes('page=pr-vision') )
  );
}

/** Push a loud skip annotation and call test.skip(). */
function skipMissing(): void {
  test.info().annotations.push({
    type: 'skip',
    description:
      '[pr-vision smoke] PR Vision plugin is not installed or activated ' +
      'on this environment. Skipping per the merge-early binding.',
  });
  test.skip();
}

test.describe('WP Admin - PR Vision dashboard', () => {
  test('dashboard page loads (HTTP 200, no PHP fatal)', async ({ page }) => {
    const res = await page.goto(`${ADMIN}/admin.php?page=pr-vision`);
    expect(res?.status()).toBe(200);

    await expect(page.locator('#wpbody')).toBeVisible();

    const body = (await page.textContent('body')) ?? '';
    expect(body).not.toContain('Fatal error');

    if (isPluginAbsent(body, page.url())) { skipMissing(); return; }

    // Heading from class-prv-admin-page.php render_page():
    // echo '<h1>' . esc_html__( 'PR Vision - AI Visibility', 'pr-vision' ) . '</h1>';
    await expect(
      page.locator('h1').filter({ hasText: 'PR Vision' })
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('WP Admin - PR Vision Settings page (API-key-manager)', () => {
  test('settings page loads (HTTP 200, no PHP fatal)', async ({ page }) => {
    const res = await page.goto(`${ADMIN}/admin.php?page=pr-vision-settings`);
    expect(res?.status()).toBe(200);

    await expect(page.locator('#wpbody')).toBeVisible();

    const body = (await page.textContent('body')) ?? '';
    expect(body).not.toContain('Fatal error');

    if (isPluginAbsent(body, page.url())) { skipMissing(); return; }
  });

  test('API-key-manager card is present and status indicator visible', async ({ page }) => {
    await page.goto(`${ADMIN}/admin.php?page=pr-vision-settings`);

    await expect(page.locator('#wpbody')).toBeVisible();
    const body = (await page.textContent('body')) ?? '';
    expect(body).not.toContain('Fatal error');

    if (isPluginAbsent(body, page.url())) { skipMissing(); return; }

    // ── SKIP-IF-ABSENT guard: Settings page may not have key-card if Settings
    //    subpage (v0.2.0) is not yet deployed on this environment.
    const keyCard = page.locator('#prv-key-card');
    const cardPresent = await keyCard.count() > 0;

    if ( ! cardPresent ) {
      test.info().annotations.push({
        type: 'skip',
        description:
          '[pr-vision smoke] #prv-key-card absent: PR Vision Settings page ' +
          '(v0.2.0 admin) is not deployed on this environment. Skipping key-manager assertions.',
      });
      test.skip();
      return;
    }

    // API-key-manager card container from class-prv-key-manager-renderer.php:
    // <div class="prv-card" id="prv-key-card">
    await expect(keyCard).toBeVisible({ timeout: 10_000 });

    // Key source status indicator: <span ... id="prv-key-source-badge">
    // Shows one of: "Set via wp-config", "Set via admin", "Not set"
    await expect(page.locator('#prv-key-source-badge')).toBeVisible({ timeout: 10_000 });
  });

  test('password input is present and renders EMPTY (write-only invariant)', async ({ page }) => {
    await page.goto(`${ADMIN}/admin.php?page=pr-vision-settings`);

    await expect(page.locator('#wpbody')).toBeVisible();
    const body = (await page.textContent('body')) ?? '';
    expect(body).not.toContain('Fatal error');

    if (isPluginAbsent(body, page.url())) { skipMissing(); return; }

    const keyCard = page.locator('#prv-key-card');
    const cardPresent = await keyCard.count() > 0;
    if ( ! cardPresent ) {
      test.info().annotations.push({
        type: 'skip',
        description:
          '[pr-vision smoke] #prv-key-card absent: skipping write-only invariant check.',
      });
      test.skip();
      return;
    }

    // Password input from class-prv-key-manager-renderer.php render_key_form():
    // <input type="password" id="prv_api_key" name="prv_api_key" ... value="" ...>
    // The renderer explicitly passes value="" -- the stored key is NEVER output.
    const keyInput = page.locator('#prv_api_key');

    // When the key source is SOURCE_CONSTANT the input is disabled but still rendered.
    // In all cases it must be present in the DOM.
    await expect(keyInput).toBeAttached({ timeout: 10_000 });

    // Write-only invariant: value attribute must be empty string, not the stored key.
    const inputValue = await keyInput.getAttribute('value');
    expect(inputValue ?? '').toBe('');

    // Security check: known OpenRouter key prefixes must not appear anywhere in
    // the page HTML -- guards against accidental server-side leakage.
    const html = await page.content();
    expect(html).not.toContain('sk-or-');
  });
});

test.describe('WP Admin - PR Vision Costs page', () => {
  test('costs page loads without fatal error', async ({ page }) => {
    const res = await page.goto(`${ADMIN}/admin.php?page=pr-vision-costs`);
    expect(res?.status()).toBe(200);

    await expect(page.locator('#wpbody')).toBeVisible();
    const body = (await page.textContent('body')) ?? '';
    expect(body).not.toContain('Fatal error');
    expect(body).not.toContain('Invalid plugin page');

    if (isPluginAbsent(body, page.url())) { skipMissing(); return; }
  });
});

test.describe('WP Admin - PR Vision Call Log page', () => {
  test('call log page loads without fatal error', async ({ page }) => {
    const res = await page.goto(`${ADMIN}/admin.php?page=pr-vision-calls`);
    expect(res?.status()).toBe(200);

    await expect(page.locator('#wpbody')).toBeVisible();
    const body = (await page.textContent('body')) ?? '';
    expect(body).not.toContain('Fatal error');
    expect(body).not.toContain('Invalid plugin page');

    if (isPluginAbsent(body, page.url())) { skipMissing(); return; }
  });
});
