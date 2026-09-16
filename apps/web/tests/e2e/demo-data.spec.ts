import { expect, test } from '@playwright/test';
import { signInFast } from './helpers';

test('the demo reset needs a typed confirmation and a reason', async ({ page }) => {
  await signInFast(page);
  await page.goto('/settings/demo-data');

  await page.getByRole('button', { name: /reset demo data/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Nothing can be done until both the reason and the exact phrase are given.
  const confirm = dialog.getByRole('button', { name: /reset demo data/i });
  await expect(confirm).toBeDisabled();

  await dialog.getByLabel(/reason/i).fill('Testing the reset guard');
  await expect(confirm).toBeDisabled();

  await dialog.getByLabel(/type/i).fill('RESET DEMO DATA');
  await expect(confirm).toBeEnabled();
});

test('demo records are badged wherever they appear', async ({ page }) => {
  await signInFast(page);
  await page.goto('/knowledge');
  await expect(page.getByText('Demo data').first()).toBeVisible();
});
