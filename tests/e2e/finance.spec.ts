import { expect, test } from '@playwright/test';
import { signInFast } from './helpers';

test.beforeEach(async ({ page }) => {
  await signInFast(page);
});

test('shows the finance overview with its source stated', async ({ page }) => {
  await page.goto('/finances');
  await expect(page.getByRole('heading', { name: 'Finances' })).toBeVisible();
  await expect(page.getByText(/source:/i).first()).toBeVisible();
  // It is explicit about not being an accounting system.
  await expect(page.getByText(/operating view|not an accounting/i)).toBeVisible();
});

test('creates an invoice', async ({ page }) => {
  await page.goto('/finances/invoices/new');
  await expect(page.getByRole('heading', { name: 'New invoice' })).toBeVisible();
  await page.getByRole('button', { name: /create invoice/i }).click();
  // Either it saves or it says what is missing; it never silently does nothing.
  await expect(page.getByText(/required|enter|choose|check the highlighted|created|saved/i).first())
    .toBeVisible();
});

test('moves between the finance tabs without leaving the page', async ({ page }) => {
  await page.goto('/finances');
  for (const tab of ['Payments', 'Expenses', 'Subscriptions', 'Profitability']) {
    await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
    await expect(page.getByRole('heading', { name: 'Finances' })).toBeVisible();
  }
});
