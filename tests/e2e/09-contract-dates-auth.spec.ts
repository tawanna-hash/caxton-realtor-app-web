// Contract Dates is for signed-in subscribers only: the page sends visitors to sign in,
// and the API refuses requests without a session.
import { test, expect } from '@playwright/test';

test('/contracts sends signed-out visitors to sign in', async ({ page }) => {
  await page.goto('/contracts');
  await expect(page).not.toHaveURL(/\/contracts$/);
});

test('/api/contract-dates requires a session', async ({ request }) => {
  const res = await request.get('/api/contract-dates');
  expect(res.status()).toBe(401);
});
