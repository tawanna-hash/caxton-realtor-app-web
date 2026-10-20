// tests/e2e/10-renewals-v2.spec.ts
//
// Renewals (Beta) partner page regression. Non-mutating: never signs.
// RENEW_PRINT_PATH / RENEW_FULL_PATH are /renew/<token>?preview=1 paths for a
// one-tap (print) renewal and a full-form (non-print) renewal.

import { test, expect } from '@playwright/test';

const PRINT = process.env.RENEW_PRINT_PATH ?? '';
const FULL = process.env.RENEW_FULL_PATH ?? '';

test('invalid token shows a friendly unavailable screen', async ({ page }) => {
  await page.goto('/renew/not-a-real-token');
  await expect(page.getByRole('heading', { name: /link is not available/i })).toBeVisible();
});

test('tampered token is rejected by the API', async ({ request }) => {
  const token = PRINT.split('/renew/')[1]?.split('?')[0] ?? '';
  test.skip(!token, 'no print link');
  const bad = token.slice(0, -4) + 'aaaa';
  expect((await request.get(`/api/renew-v2/${bad}`)).status()).toBe(401);
  expect((await request.post(`/api/renew-v2/${bad}`, { data: { signerName: 'x', termsAccepted: true, paymentMode: 'check' } })).status()).toBe(401);
});

test('one-tap page renders pre-filled, branded, with no market picker or overflow', async ({ page }) => {
  test.skip(!PRINT, 'no print link');
  await page.goto(PRINT);
  await expect(page.getByRole('heading', { name: /renew your advertising/i })).toBeVisible();
  await expect(page.getByText('Advertiser', { exact: true })).toBeVisible();
  await expect(page.getByText('Agreement total')).toBeVisible();
  await expect(page.getByText(/choose the market you cover/i)).toHaveCount(0);
  await expect(page.getByLabel(/pay by check/i)).toBeChecked();
  await expect(page.getByRole('button', { name: /sign & renew/i })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('signing is blocked until name, terms and payment are provided', async ({ page }) => {
  test.skip(!PRINT, 'no print link');
  await page.goto(PRINT);
  await page.getByRole('button', { name: /sign & renew/i }).click();
  await expect(page.getByText(/type your full name/i)).toBeVisible();
  await page.getByPlaceholder(/type your full name/i).fill('Playwright Tester');
  await page.getByRole('button', { name: /sign & renew/i }).click();
  await expect(page.getByText(/accept the agreement terms/i)).toBeVisible();
  await expect(page.getByText(/^agreed|you are renewed/i)).toHaveCount(0);
});

test('terms expand and billing email can be edited', async ({ page }) => {
  test.skip(!PRINT, 'no print link');
  await page.goto(PRINT);
  await page.getByRole('button', { name: /advertising agreement terms/i }).click();
  await expect(page.locator('pre')).toBeVisible();
  await page.getByRole('button', { name: /^change$/i }).click();
  await expect(page.getByPlaceholder(/billing email/i)).toBeVisible();
});

test('non-print renewal routes to the full form', async ({ page }) => {
  test.skip(!FULL, 'no full-form link');
  await page.goto(FULL);
  await expect(page.getByRole('heading', { name: /one more step/i })).toBeVisible();
  const href = await page.getByRole('link', { name: /^continue$/i }).getAttribute('href');
  expect(href).toContain('/admin/billing/sign/');
  await expect(page.getByRole('button', { name: /sign & renew/i })).toHaveCount(0);
});
