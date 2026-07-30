// tests/e2e/07-builder-detail-label.spec.ts
//
// Smoke #7 — an entity listed under BUILDERS on /builders must read the same
// way on its detail page. Regression guard for two symptoms of the detail page
// treating a row's developerName parent pointer as an authority on the entity:
// it labelled builders "Developer" (and invented a sub-builder count), and it
// queried inventory by developerName, dropping the builder's own listings.

import { test, expect } from '@playwright/test';

test('builder from the BUILDERS list reads the same on its detail page', async ({
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

  const cards = buildersSection.locator('a[href^="/builders/"]');
  test.skip((await cards.count()) === 0, 'BUILDERS section is empty');

  // Prefer a builder the list says has move-in ready homes — that is the case
  // the dropped-inventory bug hit. Fall back to the first card otherwise.
  const withInventory = cards.filter({ hasText: /move-in ready/i }).first();
  const hasInventory = (await withInventory.count()) > 0;
  const card = hasInventory ? withInventory : cards.first();
  await card.click();

  const header = page.locator('main header');
  await expect(header.locator('> div').first()).toHaveText(/^builder$/i);

  const counts = header.locator('> p').first();
  // A builder has no sub-builders, so the counts line must never say "N builders".
  await expect(counts).not.toHaveText(/\d+\s+builders?\b/i);

  if (hasInventory) {
    await expect(counts).toHaveText(/\d+\s+move-in ready/i);
    const moveInReady = page.locator('section').filter({
      has: page.getByRole('heading', {
        level: 2,
        name: 'Move-in Ready',
        exact: true,
      }),
    });
    await expect(
      moveInReady.getByText('No move-in ready homes.'),
    ).toHaveCount(0);
  }
});
