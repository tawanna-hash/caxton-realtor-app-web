// tests/e2e/05-public-pages.spec.ts
//
// Smoke #5 — a handful of public pages load with HTTP 200 and don't 500.
// Catches the most common deploy regression: a server component crash.

import { test, expect } from '@playwright/test';

const publicPages = [
  '/',
  '/sign-in',
  '/sign-up',
  '/advertise',
  '/privacy',
  '/giveaways',
];

for (const path of publicPages) {
  test(`public page ${path} returns 200`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status(), `${path} status`).toBeLessThan(400);
  });
}
