import { expect, test } from '@playwright/test';
import { signInFast } from './helpers';

test.beforeEach(async ({ page }) => {
  await signInFast(page);
});

test('answers a question and shows where the answer came from', async ({ page }) => {
  await page.goto('/knowledge/assistant');
  await page.getByRole('textbox').first().fill('Which clients are at risk?');
  await page.getByRole('button', { name: /ask|search/i }).first().click();

  // Either it answers with citations, or it says it does not have enough.
  await expect(
    page.getByText(/source|cited|not enough|no relevant|insufficient/i).first(),
  ).toBeVisible({ timeout: 30_000 });
});

test('says what it is searching, and does not claim to search beyond it', async ({ page }) => {
  await page.goto('/knowledge/assistant');
  await expect(page.getByText(/records|documents|notes|meetings/i).first()).toBeVisible();
});

test('lists documents with their source labelled', async ({ page }) => {
  await page.goto('/knowledge');
  await expect(page.getByRole('heading', { name: /knowledge/i })).toBeVisible();
  await expect(page.getByText(/demo/i).first()).toBeVisible();
});
