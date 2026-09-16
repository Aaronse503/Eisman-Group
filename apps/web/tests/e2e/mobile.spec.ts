import { expect, test, type Page } from '@playwright/test';
import { signInFast } from './helpers';

/**
 * Horizontal overflow, measured once the page has actually settled. Measuring
 * straight after navigation reads the document before the stylesheet has
 * applied, when everything is still full width.
 */
async function horizontalOverflow(page: Page) {
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('main')).toBeVisible();
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/**
 * The phone layout. Everything here runs at a real phone viewport.
 */

test.beforeEach(async ({ page }) => {
  await signInFast(page);
});

test('the dashboard fits the screen with no sideways scrolling', async ({ page }) => {
  await page.goto('/');
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
});

test('the navigation opens from the menu button', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /open navigation/i }).click();
  await expect(page.getByRole('link', { name: 'CRM' })).toBeVisible();
  await page.getByRole('link', { name: 'CRM' }).click();
  await expect(page).toHaveURL(/\/crm/);
});

test('a data table can be read by scrolling it, not the page', async ({ page }) => {
  await page.goto('/crm');
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
});

test('the main pages all render at phone width', async ({ page }) => {
  for (const path of ['/', '/crm', '/tasks', '/finances', '/knowledge', '/parfax']) {
    await page.goto(path);
    expect(await horizontalOverflow(page), `${path} should not scroll sideways`).toBeLessThanOrEqual(1);
  }
});
