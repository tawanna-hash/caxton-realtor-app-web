// tests/e2e/11-renewals-v2-sign.spec.ts
//
// MUTATING: signs a renewal end to end. Only run against a temporary test
// partner. RENEW_SIGN_PATH is the /renew/<token> path (no preview flag).

import { test, expect } from '@playwright/test';

const SIGN = process.env.RENEW_SIGN_PATH ?? '';

test('one-tap renewal signs end to end, then locks', async ({ page, request }, info) => {
  test.skip(!SIGN || info.project.name !== 'chromium', 'chromium only, needs RENEW_SIGN_PATH');
  await page.goto(SIGN);
  await expect(page.getByRole('heading', { name: /renew your advertising/i })).toBeVisible();
  await page.getByLabel(/pay by check/i).check();
  await page.getByPlaceholder(/type your full name/i).fill('Playwright Tester');
  await page.getByLabel(/i agree to the/i).check();
  await page.getByRole('button', { name: /sign & renew/i }).click();
  await expect(page.getByRole('heading', { name: /you are renewed/i })).toBeVisible({ timeout: 20_000 });

  await page.reload();
  await expect(page.getByRole('heading', { name: /you are renewed/i })).toBeVisible();

  const token = SIGN.split('/renew/')[1].split('?')[0];
  const again = await request.post(`/api/renew-v2/${token}`, {
    data: { signerName: 'Again', termsAccepted: true, paymentMode: 'invoice' },
  });
  expect(again.status()).toBe(409);
});
