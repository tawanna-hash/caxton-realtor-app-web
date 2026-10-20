import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/tests\/$/, '') } });
const { processingFeeCents } = await jiti.import('../../lib/payment-processing-fees.ts');

test('card fee is a flat 3%', () => {
  assert.equal(processingFeeCents(100000, 'card'), 3000);
  assert.equal(processingFeeCents(5000, 'card'), 150);
});
test('ach and bnpl are unchanged', () => {
  assert.equal(processingFeeCents(100000, 'ach'), 500);
  assert.equal(processingFeeCents(100000, 'bnpl'), 5990 + 30);
});
