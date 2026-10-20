// tests/e2e/13-new-partner-v2-sign.spec.ts
//
// MUTATING: signs a new-partner agreement end to end. Only run against a
// temporary test partner. AGREE_SIGN_PATH is the /agree/<token> path.

import { test, expect } from '@playwright/test';

const SIGN = process.env.AGREE_SIGN_PATH ?? '';

test('new-partner agreement signs end to end, then locks', async ({ page, request }, info) => {
  test.skip(!SIGN || info.project.name !== 'chromium', 'chromium only, needs AGREE_SIGN_PATH');
  await page.goto(SIGN);
  await page.getByLabel(/phone/i).fill('5125550100');
  await page.getByRole('button', { name: /continue to payment/i }).click();
  await page.getByLabel(/pay by check/i).check();
  await page.getByRole('button', { name: /continue to sign/i }).click();
  await page.getByPlaceholder(/type your full name/i).fill('Playwright Tester');
  await page.getByLabel(/i agree to the/i).check();
  await page.getByRole('button', { name: /sign agreement/i }).click();
  await expect(page.getByRole('heading', { name: /you are all set/i })).toBeVisible({ timeout: 20_000 });

  await page.reload();
  await expect(page.getByRole('heading', { name: /you are all set/i })).toBeVisible();

  const token = SIGN.split('/agree/')[1].split('?')[0];
  const again = await request.post(`/api/agree-v2/${token}`, {
    data: { signerName: 'Again', termsAccepted: true, paymentMode: 'check' },
  });
  expect(again.status()).toBe(409);
});
