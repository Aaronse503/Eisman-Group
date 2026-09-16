import type { Page } from '@playwright/test';

/**
 * Waits until React has attached to the form.
 *
 * The sign-in form is handled in JavaScript; a click that lands before
 * hydration submits it natively, reloading the sign-in page and losing the
 * query string. React marks each hydrated DOM node with a `__react*` property,
 * which is the only signal available without adding a hook to the application
 * itself.
 */
export async function waitForHydration(page: Page, selector = 'form') {
  await page.waitForFunction(
    (sel) => {
      const element = document.querySelector(sel);
      return Boolean(element && Object.keys(element).some((key) => key.startsWith('__react')));
    },
    selector,
    { timeout: 60_000 },
  );
}

export const OWNER = { email: 'aaron@eismandigital.com', password: 'ChangeMe123!' };
export const DEMO_PASSWORD = 'demo1234!';

/**
 * Signs in through the form, the way a person does.
 *
 * `path` lets a test start somewhere other than /login, so the redirect back
 * to the originally requested page can be exercised. The wait before typing
 * matters: the form is handled in JavaScript, and a click landing before the
 * page has hydrated submits it natively and loses the query string.
 */
export async function signIn(
  page: Page,
  email = OWNER.email,
  password = OWNER.password,
  path = '/login',
) {
  if (new URL(page.url(), 'http://localhost').pathname !== '/login') {
    await page.goto(path);
  }
  await waitForHydration(page);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60_000 });
}

/** Signs in via the API when the test is not about the sign-in screen itself. */
export async function signInFast(page: Page, email = OWNER.email, password = OWNER.password) {
  const response = await page.request.post('/api/auth/sign-in', { data: { email, password } });
  if (!response.ok()) throw new Error(`Sign-in failed: ${response.status()} ${await response.text()}`);
}

/** A value that will not collide with the demo data or a previous run. */
export function unique(prefix: string) {
  return `${prefix} ${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}
