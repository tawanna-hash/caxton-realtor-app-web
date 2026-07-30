// tests/e2e/07-builder-detail-label.spec.ts
//
// Smoke #7 — an entity listed under BUILDERS on /builders must also read as a
// builder on its detail page. Regression guard for the detail page labelling
// builders "Developer" (and inventing a sub-builder count) because it read a
// row's developerName parent pointer instead of the shared summary flag.

import { test, expect } from '@playwright/test';

test('builder from the BUILDERS list reads as a builder on its detail page', async ({
  page,
}) => {
  await page.goto('/builders');

  const buildersSection = page.locator('section').filter({
    has: page.getByRole('heading', { level: 2, name: 'Builders', exact: true }),
  });
  test.skip(
    (await buildersSection.count()) === 0,
    'no builders in this publication',
  );

  const firstCard = buildersSection.locator('a[href^="/builders/"]').first();
  test.skip((await firstCard.count()) === 0, 'BUILDERS section is empty');
  await firstCard.click();

  const header = page.locator('main header');
  await expect(header.locator('> div').first()).toHaveText(/^builder$/i);
  // A builder has no sub-builders, so the counts line must never say "N builders".
  await expect(header.locator('> p').first()).not.toHaveText(
    /\d+\s+builders?\b/i,
  );
});
