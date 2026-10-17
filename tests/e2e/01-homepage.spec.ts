// tests/e2e/01-homepage.spec.ts
//
// Smoke #1 — public homepage renders, no console errors, hero CTA present.
// Catches the most common deploy-time regression: a broken server component
// crashing the unauthed homepage.

import { test, expect } from '@playwright/test';

test('homepage renders without crashing', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));
  page.on('console', (msg) => {
    // WebKit logs a note when a report-only CSP carries frame-ancestors; that is
    // browser noise about our header, not a runtime error.
    if (msg.type() === 'error' && !/Content Security Policy/i.test(msg.text())) consoleErrors.push(msg.text());
  });

  const res = await page.goto('/');
  expect(res?.ok(), `homepage HTTP status: ${res?.status()}`).toBeTruthy();

  // Hero / sign-in CTA — copy may vary, but one of these should be present.
  const heroLocator = page.locator('text=/Sign in|Get started|Welcome|Austin|San Antonio/i').first();
  await expect(heroLocator).toBeVisible({ timeout: 10_000 });

  // No uncaught JS errors should fire during initial render.
  expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toHaveLength(0);
});
