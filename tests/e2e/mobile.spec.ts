import { expect, test } from '@playwright/test';
import { signInFast } from './helpers';

/**
 * The phone layout. Everything here runs at a real phone viewport.
 */

test.beforeEach(async ({ page }) => {
  await signInFast(page);
});

test('the dashboard fits the screen with no sideways scrolling', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
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
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('the main pages all render at phone width', async ({ page }) => {
  for (const path of ['/', '/crm', '/tasks', '/finances', '/knowledge', '/parfax']) {
    await page.goto(path);
    await expect(page.getByRole('main')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} should not scroll sideways`).toBeLessThanOrEqual(1);
  }
});
