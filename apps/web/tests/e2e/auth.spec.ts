import { expect, test } from '@playwright/test';
import { DEMO_PASSWORD, OWNER, signIn } from './helpers';

test.describe('signing in', () => {
  test('sends an unauthenticated visitor to the sign-in screen', async ({ page }) => {
    await page.goto('/crm');
    await expect(page).toHaveURL(/\/login/);
  });

  test('refuses a wrong password without saying whether the account exists', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(OWNER.email);
    await page.getByLabel('Password').fill('definitely-not-the-password');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/email or password is incorrect/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('signs in and lands on the holdings dashboard', async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole('heading', { name: 'Eisman Holdings' })).toBeVisible();
  });

  test('returns to the page that was originally asked for', async ({ page }) => {
    await page.goto('/investors');
    await expect(page).toHaveURL(/\/login\?next=/);
    await signIn(page);
    await expect(page).toHaveURL(/\/investors/);
  });

  test('signs out and cannot go back', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: /account menu|aaron/i }).first().click();
    await page.getByRole('menuitem', { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/crm');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('a temporary password', () => {
  test('must be replaced before anything else can be used', async ({ page }) => {
    await signIn(page, 'sam.design@demo.eisman.test', DEMO_PASSWORD);
    await expect(page.getByText(/choose a password to continue/i)).toBeVisible();

    // No route gets past it, and none of the application is rendered.
    for (const path of ['/crm', '/finances', '/tasks']) {
      await page.goto(path);
      await expect(page.getByText(/choose a password to continue/i)).toBeVisible();
      await expect(page.getByRole('link', { name: 'CRM' })).toHaveCount(0);
    }
  });
});
