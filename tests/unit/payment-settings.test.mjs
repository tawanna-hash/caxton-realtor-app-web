import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fees = readFileSync('lib/payment-processing-fees.ts', 'utf8');
const settings = readFileSync('lib/server/payment-settings.ts', 'utf8');
const store = readFileSync('lib/server/agreement-terms-store.ts', 'utf8');

test('default fees are card 3%, ACH 1% capped at $5, BNPL 5.99% + $0.30', () => {
  assert.match(fees, /card: \{ percent: 3 \}/);
  assert.match(fees, /ach: \{ percent: 1, cap_cents: 500 \}/);
  assert.match(fees, /bnpl: \{ percent: 5\.99, fixed_cents: 30 \}/);
});

test('settings are validated before saving', () => {
  assert.match(settings, /num\(f\.card\?\.percent, 0, 20/);
  assert.match(settings, /\^#\[0-9a-fA-F\]\{6\}\$/);
  assert.match(settings, /\^file_/);
});

test('setup-mode sessions omit payment-only parameters', () => {
  const idx = settings.indexOf("if (mode === 'payment')");
  assert.ok(idx > 0);
  const tail = settings.slice(idx);
  for (const k of ['phone_number_collection', 'submit_type', 'allow_promotion_codes', 'automatic_tax', 'saved_payment_method_options']) {
    assert.ok(tail.includes(k), k);
    assert.ok(!settings.slice(0, idx).includes(' out.' + k), k + ' set outside payment mode');
  }
});

test('terms resolve to the version in effect at signing', () => {
  assert.match(store, /effective_at\)\.getTime\(\) <= at/);
  assert.match(store, /ORDER BY effective_at DESC/);
});

test('section 9.5 fee bullets can be regenerated from settings (card and ACH bullets)', () => {
  const t = readFileSync('lib/agreement-terms.ts', 'utf8');
  assert.match(t, /export function applyFeesToTerms/);
  assert.match(t, /\^• credit or debit card/);
  assert.match(t, /\^• ACH bank payment/);
});
