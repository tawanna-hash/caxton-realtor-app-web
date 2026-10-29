// Contract Dates (Closing Time) has a guest view: signed-out visitors can see the
// page, but adding contracts asks them to create an account, and the API refuses
// requests without a session.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('caxton_market_onboarded', '1');
      localStorage.setItem('caxton_pub', 'realtyline');
    } catch {}
  });
});

test('/contracts shows the guest view to signed-out visitors', async ({ page }) => {
  const res = await page.goto('/contracts');
  expect(res?.status()).toBeLessThan(400);
  await expect(page.getByText(/keep your deals moving/i).first()).toBeVisible();
});

test('/api/contract-dates requires a session', async ({ request }) => {
  const res = await request.get('/api/contract-dates');
  expect(res.status()).toBe(401);
});
