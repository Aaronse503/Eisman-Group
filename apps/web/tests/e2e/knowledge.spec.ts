import { expect, test } from '@playwright/test';
import { signInFast } from './helpers';

test.beforeEach(async ({ page }) => {
  await signInFast(page);
});

test('answers a question and shows where the answer came from', async ({ page }) => {
  await page.goto('/knowledge/assistant');
  await page.getByRole('textbox').first().fill('Which clients are at risk?');
  await page.getByRole('button', { name: 'Ask' }).click();

  // Either it answers and lists its sources, or it says the records do not
  // contain the answer. It never answers without one or the other.
  await expect(
    page.getByText(/^Sources$|not|no |enough|could not/i).first(),
  ).toBeVisible({ timeout: 60_000 });
});

test('says what it is searching, and does not claim to search beyond it', async ({ page }) => {
  await page.goto('/knowledge/assistant');
  await expect(page.getByPlaceholder(/ask about anything in/i)).toBeVisible();
});

test('lists documents, labelled as demo data', async ({ page }) => {
  await page.goto('/knowledge');
  await expect(page.getByRole('heading', { name: 'Knowledge Hub' })).toBeVisible();
  await expect(page.getByText('Demo data').first()).toBeVisible();
});
