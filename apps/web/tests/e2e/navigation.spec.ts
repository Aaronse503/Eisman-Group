import { expect, test } from '@playwright/test';
import { signInFast } from './helpers';

const PAGES = [
  '/', '/companies', '/crm', '/tasks', '/calendar', '/finances', '/team',
  '/partnerships', '/investors', '/knowledge', '/reports', '/parfax',
  '/integrations', '/settings/profile',
];

test.beforeEach(async ({ page }) => {
  await signInFast(page);
});

test('every navigation item leads to a real page', async ({ page }) => {
  for (const path of PAGES) {
    const response = await page.goto(path);
    expect(response?.status(), `${path} should load`).toBe(200);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByText('This page could not be found')).toHaveCount(0);
  }
});

test('the command palette opens and navigates', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.getByRole('dialog');
  await expect(palette).toBeVisible();
  await page.getByPlaceholder(/search clients, tasks, investors/i).fill('Investors');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/investors/);
});

test('global search finds a seeded client', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByPlaceholder(/search clients, tasks, investors/i).fill('Kestrel');
  await expect(page.getByText(/kestrel/i).first()).toBeVisible();
});

test('switching company narrows what is shown', async ({ page }) => {
  await page.goto('/crm?company=parfax');
  await expect(page.getByText(/kestrel robotics/i)).toHaveCount(0);
  await page.goto('/crm?company=eisman-digital');
  await expect(page.getByText(/kestrel robotics/i).first()).toBeVisible();
});
