import { expect, test } from '@playwright/test';
import { DEMO_PASSWORD, signInFast } from './helpers';

/**
 * What each role can see, checked the way it actually matters: through the
 * navigation and the pages themselves.
 */

test('a viewer sees no finance navigation and cannot open the finance pages', async ({ page }) => {
  await signInFast(page, 'val.viewer@demo.eisman.test', DEMO_PASSWORD);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Finances' })).toHaveCount(0);

  await page.goto('/finances');
  await expect(page.getByText(/don.t have access to this/i)).toBeVisible();
});

test('a viewer cannot create a client', async ({ page }) => {
  await signInFast(page, 'val.viewer@demo.eisman.test', DEMO_PASSWORD);
  await page.goto('/crm');
  await expect(page.getByRole('link', { name: /new client/i })).toHaveCount(0);
});

test('the ParFax lead sees ParFax but not the Eisman Digital client list', async ({ page }) => {
  await signInFast(page, 'jordan.parfax@demo.eisman.test', DEMO_PASSWORD);
  await page.goto('/crm');
  // The page renders, but there is nothing from another company in it.
  await expect(page.getByText(/kestrel robotics|lumen home systems/i)).toHaveCount(0);
});

test('only the Holdings Owner can reach the demo data controls', async ({ page }) => {
  await signInFast(page, 'dana.ops@demo.eisman.test', DEMO_PASSWORD);
  await page.goto('/settings/demo-data');
  await expect(page.getByText(/don.t have access to this/i)).toBeVisible();

  await signInFast(page);
  await page.goto('/settings/demo-data');
  await expect(page.getByRole('button', { name: /reset demo data/i })).toBeVisible();
});

test('the owner sees every company in the switcher', async ({ page }) => {
  await signInFast(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch workspace' }).click();
  await expect(page.getByRole('menuitem', { name: /eisman digital/i })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /parfax/i })).toBeVisible();
});
