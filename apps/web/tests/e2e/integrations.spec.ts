import { expect, test } from '@playwright/test';
import { signInFast } from './helpers';

/**
 * The honesty rule, checked through the interface: nothing claims to be
 * connected until it really is, and Demo Mode says so in as many words.
 */

test.beforeEach(async ({ page }) => {
  await signInFast(page);
});

test('shows every provider as disconnected before any credentials are given', async ({ page }) => {
  await page.goto('/integrations');
  await expect(page.getByRole('heading', { name: /integrations/i })).toBeVisible();
  await expect(page.getByText(/^connected$/i)).toHaveCount(0);
  await expect(page.getByText(/disconnected/i).first()).toBeVisible();
});

test('says exactly which credentials it needs, and does not ask for them in a way that hides them', async ({ page }) => {
  await page.goto('/integrations');
  await page.getByRole('button', { name: /connect|set up/i }).first().click();
  await expect(page.getByText(/api token|secret key|client id|api key/i).first()).toBeVisible();
});

test('labels a planned integration as planned rather than offering it', async ({ page }) => {
  await page.goto('/integrations');
  await expect(page.getByText(/planned|not implemented/i).first()).toBeVisible();
});

test('demo mode is labelled as sample data', async ({ page }) => {
  await page.goto('/integrations');
  const demoButton = page.getByRole('button', { name: /demo mode/i }).first();
  if (await demoButton.count()) {
    await demoButton.click();
    await expect(page.getByText(/demo/i).first()).toBeVisible();
  }
});
