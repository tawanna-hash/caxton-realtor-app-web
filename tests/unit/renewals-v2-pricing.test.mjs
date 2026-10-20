// Run: node --test tests/unit/renewals-v2-pricing.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { alias: { '@': new URL('../..', import.meta.url).pathname } });
const { computeRenewalPrice, computeNextTerm, freqMonths } = await jiti.import('../../lib/renewals-v2/pricing.ts');

test('freqMonths parses the leading number and defaults to 1', () => {
  assert.equal(freqMonths('3x'), 3);
  assert.equal(freqMonths('12x'), 12);
  assert.equal(freqMonths(''), 1);
  assert.equal(freqMonths(null), 1);
});

test('rate is held while the prior agreement is still running', () => {
  const p = computeRenewalPrice(
    { ad_rate_cents: 120500, frequency: '3x', ad_size: 'Full-page', exp_date: '2026-10-31', end_date: null },
    new Date('2026-10-20T12:00:00'),
  );
  assert.equal(p.rateCents, 120500);
  assert.equal(p.repriced, false);
});

test('missing data never changes the rate', () => {
  const p = computeRenewalPrice(
    { ad_rate_cents: 50000, frequency: null, ad_size: null, exp_date: '2020-01-01', end_date: null },
    new Date('2026-10-20T12:00:00'),
  );
  assert.equal(p.rateCents, 50000);
});

test('next term starts the month after a running term ends', () => {
  const t = computeNextTerm('2026-11-09', 3, new Date('2026-10-20T12:00:00'));
  assert.equal(t.start, '2026-12-01');
  assert.equal(t.end, '2027-02-28');
  assert.deepEqual(t.months, { december: '2026', january: '2027', february: '2027' });
});

test('expired term: on or before the 15th starts this month, after starts next', () => {
  assert.equal(computeNextTerm('2026-08-27', 1, new Date('2026-10-14T12:00:00')).start, '2026-10-01');
  assert.equal(computeNextTerm('2026-08-27', 1, new Date('2026-10-20T12:00:00')).start, '2026-11-01');
});

test('term end handles year rollover and 12 month terms', () => {
  const t = computeNextTerm('2026-11-30', 12, new Date('2026-10-20T12:00:00'));
  assert.equal(t.start, '2026-12-01');
  assert.equal(t.end, '2027-11-30');
  assert.equal(Object.keys(t.months).length, 12);
});
