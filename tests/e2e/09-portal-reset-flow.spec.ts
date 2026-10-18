// tests/e2e/09-portal-reset-flow.spec.ts
//
// Real emailed-link reset in the browser. RESET_TOKENS is JSON of
// { "<project name>": "<token from the email>" }; the new password is set to
// PORTAL_PASSWORD so the regression suite stays repeatable.

import { test, expect } from '@playwright/test';

const PASSWORD = process.env.PORTAL_PASSWORD ?? '';
const EMAIL = process.env.PORTAL_EMAIL ?? '';
const TOKENS: Record<string, string> = JSON.parse(process.env.RESET_TOKENS ?? '{}');

test('emailed reset link sets a new password, works once, and signs in', async ({ page }, info) => {
  const token = TOKENS[info.project.name];
  test.skip(!token || !PASSWORD, 'no reset token for this project');

  await page.goto(`/portal/reset?token=${encodeURIComponent(token)}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: /choose a new password/i })).toBeVisible();
  await expect(page.locator('div.fixed img[alt]').first()).toBeVisible();
  await page.getByLabel('New password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm new password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /set new password/i }).click();
  await expect(page.getByText(/your password has been updated/i)).toBeVisible();

  // Same link again must fail.
  await page.goto(`/portal/reset?token=${encodeURIComponent(token)}`);
  await page.waitForLoadState('networkidle');
  await page.getByLabel('New password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm new password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /set new password/i }).click();
  await expect(page.getByText(/invalid or has expired/i)).toBeVisible();

  // And the new password signs in.
  await page.goto('/portal/login');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email', { exact: true }).fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/portal/login'), { timeout: 15_000 });
});
