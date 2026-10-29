// tests/e2e/04-sign-in-page.spec.ts
//
// Smoke #4 — realtor sign-in. /sign-in (and legacy /auth/sign-in) redirect to
// the /dashboard auth modal, which renders email + password inputs and submits
// without crashing. Stops short of real auth (needs a seeded test user).

import { test, expect } from '@playwright/test';

const SIGN_IN_PATHS = ['/sign-in', '/auth/sign-in', '/dashboard?auth=login'];

for (const path of SIGN_IN_PATHS) {
  test(`${path} lands on the sign-in modal with email + password inputs`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/dashboard\?auth=login/);
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
    await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible();
  });
}

test('/sign-up lands on the sign-up modal', async ({ page }) => {
  await page.goto('/sign-up');
  await expect(page).toHaveURL(/\/dashboard\?auth=signup/);
});

test('sign-in with garbage credentials does not crash and stays on the sign-in modal', async ({ page }) => {
  await page.goto('/sign-in');
  // Retry: WebKit can hydrate after the fills and clear them, leaving Sign in disabled.
  await expect(async () => {
    await page.getByPlaceholder('you@example.com').fill('definitely-not-a-real@example.com');
    await page.getByPlaceholder('Enter your password').fill('wrong-password-123');
    await expect(page.getByRole('button', { name: /^sign in$/i })).toBeEnabled({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await page.getByRole('button', { name: /^sign in$/i }).click();

  // Invalid credentials must not sign the user in: the form stays visible.
  await page.waitForTimeout(2000);
  await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
  expect(page.url()).toContain('/dashboard');
});
