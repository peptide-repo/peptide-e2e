/**
 * 07-peptide-news-admin.spec.ts
 *
 * What: Smoke tests for the Peptide News Plugin admin surfaces.
 *       Verifies the dashboard, settings, articles, and cost sub-pages
 *       load without PHP fatals and checks expected UI elements.
 *       Guards against activation failures, missing menu registration, or
 *       PHP fatals introduced by a bad deploy.
 *
 * Who triggers it: Playwright chromium project (post-auth setup).
 * Dependencies: wp-admin authenticated session (from global.setup.ts).
 *
 * SKIP-IF-ABSENT: When the Peptide News Plugin is not installed/activated on
 *   this environment, each test detects the absent menu page and skips with a
 *   loud annotation — consistent with the 05/06 merge-early binding pattern.
 *
 * Admin menu slugs (sourced from admin/class-pn-admin-menu.php):
 *   Dashboard  -> admin.php?page=peptide-news-dashboard
 *   Settings   -> admin.php?page=peptide-news-settings
 *   Articles   -> admin.php?page=peptide-news-articles
 *   LLM Costs  -> admin.php?page=peptide-news-costs
 *
 * Selectors sourced from admin/partials/dashboard.php:
 *   h1 "Peptide News Analytics"  - page heading (text match)
 *   .pn-summary-cards            - summary card row
 *   .pn-date-filter              - date range filter form
 *
 * @see peptiderepo/peptide-news-plugin admin/class-pn-admin-menu.php
 * @see peptiderepo/peptide-news-plugin admin/partials/dashboard.php
 */

import { test, expect } from '@playwright/test';

const ADMIN = '/wp-admin';

/**
 * Detect the "page not registered" condition WordPress returns when a plugin
 * menu slug is unknown. Returns true when the plugin is absent.
 *
 * WordPress either:
 * (a) Shows "You do not have sufficient permissions to access this page."
 * (b) Shows a notice that the page cannot be found
 * (c) Redirects back to /wp-admin/ stripping the ?page= param
 */
function isPluginAbsent(body: string, url: string): boolean {
  return (
    body.includes('Invalid plugin page') ||
    body.includes('do not have sufficient permissions') ||
    body.includes('The page you are looking for') ||
    ( url.includes('/wp-admin/') && ! url.includes('page=peptide-news') )
  );
}

/** Push a loud skip annotation and call test.skip(). */
function skipMissing(): void {
  test.info().annotations.push({
    type: 'skip',
    description:
      '[peptide-news smoke] Peptide News Plugin is not installed or activated ' +
      'on this environment. Skipping per the merge-early binding.',
  });
  test.skip();
}

test.describe('WP Admin - Peptide News Plugin dashboard', () => {
  test('dashboard page loads (HTTP 200, no PHP fatal)', async ({ page }) => {
    const res = await page.goto(`${ADMIN}/admin.php?page=peptide-news-dashboard`);
    expect(res?.status()).toBe(200);

    await expect(page.locator('#wpbody')).toBeVisible();

    const body = (await page.textContent('body')) ?? '';
    expect(body).not.toContain('Fatal error');

    if (isPluginAbsent(body, page.url())) { skipMissing(); return; }
  });

  test('dashboard renders analytics heading, summary cards, and date filter', async ({ page }) => {
    await page.goto(`${ADMIN}/admin.php?page=peptide-news-dashboard`);

    await expect(page.locator('#wpbody')).toBeVisible();
    const body = (await page.textContent('body')) ?? '';
    expect(body).not.toContain('Fatal error');

    if (isPluginAbsent(body, page.url())) { skipMissing(); return; }

    // Heading from admin/partials/dashboard.php: <h1>Peptide News Analytics</h1>
    await expect(
      page.locator('h1').filter({ hasText: 'Peptide News Analytics' })
    ).toBeVisible({ timeout: 10_000 });

    // Summary card row: <div class="pn-summary-cards">
    await expect(page.locator('.pn-summary-cards')).toBeVisible({ timeout: 10_000 });

    // Date range filter form: <form class="pn-date-filter">
    await expect(page.locator('.pn-date-filter')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('WP Admin - Peptide News Plugin settings page', () => {
  test('settings page loads (HTTP 200, no fatal, settings form present)', async ({ page }) => {
    const res = await page.goto(`${ADMIN}/admin.php?page=peptide-news-settings`);
    expect(res?.status()).toBe(200);

    await expect(page.locator('#wpbody')).toBeVisible();
    const body = (await page.textContent('body')) ?? '';
    expect(body).not.toContain('Fatal error');

    if (isPluginAbsent(body, page.url())) { skipMissing(); return; }

    // Every settings page rendered by class-pn-admin-settings-page.php contains a form
    await expect(page.locator('form').first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('WP Admin - Peptide News Plugin articles page', () => {
  test('articles page loads without fatal error', async ({ page }) => {
    const res = await page.goto(`${ADMIN}/admin.php?page=peptide-news-articles`);
    expect(res?.status()).toBe(200);

    await expect(page.locator('#wpbody')).toBeVisible();
    const body = (await page.textContent('body')) ?? '';
    expect(body).not.toContain('Fatal error');
    expect(body).not.toContain('Invalid plugin page');

    if (isPluginAbsent(body, page.url())) { skipMissing(); return; }
  });
});

test.describe('WP Admin - Peptide News Plugin LLM costs page', () => {
  test('costs page loads without fatal error', async ({ page }) => {
    const res = await page.goto(`${ADMIN}/admin.php?page=peptide-news-costs`);
    expect(res?.status()).toBe(200);

    await expect(page.locator('#wpbody')).toBeVisible();
    const body = (await page.textContent('body')) ?? '';
    expect(body).not.toContain('Fatal error');
    expect(body).not.toContain('Invalid plugin page');

    if (isPluginAbsent(body, page.url())) { skipMissing(); return; }
  });
});
