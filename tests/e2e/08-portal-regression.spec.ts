// tests/e2e/08-portal-regression.spec.ts
//
// Partner portal regression. Needs a test partner: PORTAL_EMAIL + PORTAL_PASSWORD.
// Skipped when they are not set. Writes nothing except the session cookie.

import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.PORTAL_EMAIL ?? '';
const PASSWORD = process.env.PORTAL_PASSWORD ?? '';
const PAGES = [
  '/portal',
  '/portal/account',
  '/portal/orders',
  '/portal/files',
  '/portal/forms',
  '/portal/content',
  '/portal/content/issues',
  '/portal/content/articles',
  '/portal/content/events',
];
const ERROR_TEXT = /application error|something went wrong|internal server error|this page could not be found/i;

async function signIn(page: Page) {
  await page.goto('/portal/login');
  await page.getByLabel('Email', { exact: true }).fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/portal/login'), { timeout: 15_000 });
}

test('login page renders with forgot-password link', async ({ page }) => {
  await page.goto('/portal/login');
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /forgot your password/i })).toBeVisible();
});

test('forgot password shows a generic confirmation for an unknown email', async ({ page }) => {
  await page.goto('/portal/login');
  await page.getByRole('button', { name: /forgot your password/i }).click();
  await page.getByLabel('Email', { exact: true }).fill('nobody-regression@example.com');
  await page.getByRole('button', { name: /send reset link/i }).click();
  await expect(page.getByText(/reset link is on its way/i)).toBeVisible();
  await page.getByRole('button', { name: /back to sign in/i }).click();
  await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible();
});

test('wrong password is rejected', async ({ page }) => {
  test.skip(!EMAIL, 'PORTAL_EMAIL not set');
  await page.goto('/portal/login');
  await page.getByLabel('Email', { exact: true }).fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill('definitely-wrong-password');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page.getByText(/incorrect email or password/i)).toBeVisible();
  expect(page.url()).toContain('/portal/login');
});

test('reset page rejects a bad token and a missing token', async ({ page }) => {
  await page.goto('/portal/reset?token=not-a-real-token-value');
  await page.getByLabel('New password', { exact: true }).fill('SomethingLong123');
  await page.getByLabel('Confirm new password', { exact: true }).fill('SomethingLong123');
  await page.getByRole('button', { name: /set new password/i }).click();
  await expect(page.getByText(/invalid or has expired/i)).toBeVisible();
  await page.goto('/portal/reset');
  await expect(page.getByText(/missing its token/i)).toBeVisible();
});

test('signed-in partner can open every portal page without errors', async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, 'portal test credentials not set');
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await signIn(page);
  for (const path of PAGES) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBeLessThan(400);
    expect(new URL(page.url()).pathname, `${path} bounced to login`).not.toMatch(/^\/portal\/login/);
    await expect(page.locator('body'), path).not.toContainText(ERROR_TEXT);
  }
  expect(pageErrors).toEqual([]);
});
