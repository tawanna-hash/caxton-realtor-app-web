// tests/e2e/12-new-partner-v2.spec.ts
//
// New-partner agreements (Beta) regression. Non-mutating: never signs.
// AGREE_PRINT_PATH / AGREE_FULL_PATH are /agree/<token>?preview=1 paths for a
// one-page (print) agreement and a full-form (non-print) agreement.

import { test, expect } from '@playwright/test';

const PRINT = process.env.AGREE_PRINT_PATH ?? '';
const FULL = process.env.AGREE_FULL_PATH ?? '';

test('invalid token shows a friendly unavailable screen', async ({ page }) => {
  await page.goto('/agree/not-a-real-token');
  await expect(page.getByRole('heading', { name: /link is not available/i })).toBeVisible();
});

test('tampered token is rejected by the API', async ({ request }) => {
  const token = PRINT.split('/agree/')[1]?.split('?')[0] ?? '';
  test.skip(!token, 'no print link');
  const bad = token.slice(0, -4) + 'aaaa';
  expect((await request.get(`/api/agree-v2/${bad}`)).status()).toBe(401);
  expect((await request.post(`/api/agree-v2/${bad}`, { data: { signerName: 'x', termsAccepted: true, paymentMode: 'invoice' } })).status()).toBe(401);
});

test('review screen is pre-filled, branded, with no market picker or overflow', async ({ page }) => {
  test.skip(!PRINT, 'no print link');
  await page.goto(PRINT);
  await expect(page.getByRole('heading', { name: /your advertising agreement/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /review your details/i })).toBeVisible();
  await expect(page.getByLabel(/company name/i)).not.toHaveValue('');
  await expect(page.getByText('Agreement total')).toBeVisible();
  await expect(page.getByText(/choose the market you cover/i)).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('review validates required fields before moving on', async ({ page }) => {
  test.skip(!PRINT, 'no print link');
  await page.goto(PRINT);
  await page.getByLabel(/company name/i).fill('');
  await page.getByRole('button', { name: /continue to payment/i }).click();
  await expect(page.getByText(/enter your company name/i)).toBeVisible();
  await page.getByLabel(/company name/i).fill('Playwright Co');
  await page.getByLabel(/^email$/i).fill('not-an-email');
  await page.getByRole('button', { name: /continue to payment/i }).click();
  await expect(page.getByText(/valid email address/i)).toBeVisible();
});

test('walks Review, Pay, Sign and blocks signing until name and terms', async ({ page }) => {
  test.skip(!PRINT, 'no print link');
  await page.goto(PRINT);
  await page.getByRole('button', { name: /continue to payment/i }).click();
  await expect(page.getByRole('heading', { name: /how would you like to pay/i })).toBeVisible();
  await expect(page.getByLabel(/monthly invoice/i)).toBeChecked();
  await page.getByRole('button', { name: /continue to sign/i }).click();
  await expect(page.getByRole('heading', { name: /review and sign/i })).toBeVisible();
  await page.getByRole('button', { name: /sign agreement/i }).click();
  await expect(page.getByText(/type your full name/i)).toBeVisible();
  await page.getByPlaceholder(/type your full name/i).fill('Playwright Tester');
  await page.getByRole('button', { name: /sign agreement/i }).click();
  await expect(page.getByText(/accept the agreement terms/i)).toBeVisible();
  await page.getByRole('button', { name: /^back$/i }).click();
  await expect(page.getByRole('heading', { name: /how would you like to pay/i })).toBeVisible();
});

test('choosing card hands off to the full form', async ({ page }) => {
  test.skip(!PRINT, 'no print link');
  await page.goto(PRINT);
  await page.getByRole('button', { name: /continue to payment/i }).click();
  await page.getByLabel(/credit card/i).check();
  await expect(page.getByRole('button', { name: /continue to card form/i })).toBeVisible();
});

test('non-print agreement routes to the full form', async ({ page }) => {
  test.skip(!FULL, 'no full-form link');
  await page.goto(FULL);
  const link = page.getByRole('link', { name: /^continue$/i });
  await expect(link).toBeVisible();
  expect(await link.getAttribute('href')).toContain('/admin/billing/sign/');
  await expect(page.getByRole('button', { name: /sign agreement/i })).toHaveCount(0);
});
