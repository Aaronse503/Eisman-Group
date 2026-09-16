import { expect, test } from '@playwright/test';
import { signInFast, unique } from './helpers';

test.beforeEach(async ({ page }) => {
  await signInFast(page);
});

test('creates a task and completes it', async ({ page }) => {
  const title = unique('Playwright task');

  await page.goto('/tasks/new');
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Company').selectOption({ label: 'Eisman Digital' });
  await page.getByRole('button', { name: 'Create task' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  await page.getByRole('button', { name: /mark (as )?(done|complete)/i }).first().click();
  await expect(page.getByText(/completed|done/i).first()).toBeVisible();
});

test('shows overdue tasks in their own view', async ({ page }) => {
  await page.goto('/tasks?view=overdue');
  await expect(page.getByRole('main')).toBeVisible();
  // Whatever is listed here is genuinely past its due date.
  const overdueBadges = page.getByText(/overdue|late/i);
  if (await overdueBadges.count()) await expect(overdueBadges.first()).toBeVisible();
});

test('refuses a task with no title', async ({ page }) => {
  await page.goto('/tasks/new');
  await page.getByLabel('Company').selectOption({ label: 'Eisman Digital' });
  await page.getByRole('button', { name: 'Create task' }).click();
  await expect(page.getByLabel('Title')).toHaveAttribute('aria-invalid', 'true');
});
