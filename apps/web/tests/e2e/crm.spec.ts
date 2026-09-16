import { expect, test } from '@playwright/test';
import { signInFast, unique } from './helpers';

test.beforeEach(async ({ page }) => {
  await signInFast(page);
});

test('creates a client and finds it again', async ({ page }) => {
  const name = unique('Playwright Client');

  await page.goto('/crm');
  await page.getByRole('link', { name: /new client/i }).click();
  await expect(page).toHaveURL(/\/crm\/clients\/new/);

  await page.getByLabel('Client name').fill(name);
  await page.getByLabel('Company').selectOption({ label: 'Eisman Digital' });
  await page.getByRole('button', { name: 'Add client' }).click();

  // The client's own page, showing what was just entered.
  await expect(page.getByRole('heading', { name })).toBeVisible();

  // And it is in the list, findable by search.
  await page.goto('/crm');
  await page.getByPlaceholder(/search clients/i).fill(name);
  await expect(page.getByRole('link', { name })).toBeVisible();
});

test('rejects a client with no name instead of creating an empty record', async ({ page }) => {
  await page.goto('/crm/clients/new');
  await page.getByLabel('Company').selectOption({ label: 'Eisman Digital' });
  await page.getByRole('button', { name: 'Add client' }).click();

  // The field is marked invalid and nothing is created.
  await expect(page.getByLabel('Client name')).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL(/\/crm\/clients\/new/);
});

test('filters the client list by status', async ({ page }) => {
  await page.goto('/crm');
  const before = await page.getByRole('row').count();
  await page.getByLabel('Filter by status').selectOption('prospect');
  // The filter is applied in place rather than through the URL.
  await expect(page.getByRole('row')).not.toHaveCount(before);
  await expect(page.getByText(/prospect/i).first()).toBeVisible();
});

test('switches between the table and the board', async ({ page }) => {
  await page.goto('/crm');
  await page.getByRole('tab', { name: 'Board' }).click();
  await expect(page.getByText(/qualifying|negotiation|delivering/i).first()).toBeVisible();
});
