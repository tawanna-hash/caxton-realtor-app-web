// tests/e2e/07-nav-drawer.spec.ts
//
// Smoke #7 — the mobile hamburger drawer opens and dismisses.
//
// Exercises components/NavDrawer.tsx via AppShell, which is the same drawer
// the admin shell renders below `lg` — the admin variant itself sits behind
// middleware auth, so this covers the shared toggle/scrim behaviour without
// mocking a session.

import { test, expect } from '@playwright/test';

// Force a phone viewport so the `lg:hidden` hamburger renders even under the
// Desktop Chrome project.
test.use({ viewport: { width: 390, height: 844 } });

test('mobile drawer opens from the hamburger and closes via the scrim', async ({
  page,
  context,
  baseURL,
}) => {
  // Pre-pick a market so the first-launch MarketOnboardingPicker doesn't
  // cover the shell chrome.
  await context.addCookies([
    { name: 'caxton_pub', value: 'realtyline', url: baseURL ?? 'http://localhost:3000' },
  ]);

  // /privacy is one of the public pages that isn't behind the auth gate (see
  // 05-public-pages.spec.ts) and it renders inside the AppShell.
  await page.goto('/privacy');

  const hamburger = page.getByTestId('nav-hamburger');
  await expect(hamburger).toBeVisible();

  await hamburger.click();
  const panel = page.getByTestId('nav-drawer-panel');
  await expect(panel).toBeVisible();
  await expect(hamburger).toHaveAttribute('aria-expanded', 'true');

  // Tap the exposed strip of scrim to the right of the 320px panel — the
  // scrim spans the viewport, so its centre point sits under the panel.
  await page.getByTestId('nav-drawer-scrim').click({ position: { x: 370, y: 400 } });
  await expect(panel).toBeHidden();
  await expect(hamburger).toHaveAttribute('aria-expanded', 'false');
});
