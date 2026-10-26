import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
process.env.SIGN_SECRET = 'test-secret';
const jiti = createJiti(import.meta.url, { alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/tests\/$/, '') } });
const t = await jiti.import('../../lib/payment-setup-token.ts');

test('client token round trips', () => {
  const { token } = t.signPaymentSetupToken({ kind: 'client', id: 324 });
  const v = t.verifyPaymentSetupToken(token);
  assert.equal(v.ok, true);
  assert.deepEqual(v.subject, { kind: 'client', id: 324 });
});
test('tampered token is rejected', () => {
  const { token } = t.signPaymentSetupToken({ kind: 'client', id: 324 });
  const bad = token.replace('c324', 'c325');
  assert.equal(t.verifyPaymentSetupToken(bad).ok, false);
});
test('past-dated token still verifies: pay/setup links never expire (owner rule)', () => {
  const { token } = t.signPaymentSetupToken({ kind: 'client', id: 1 }, -1);
  assert.equal(t.verifyPaymentSetupToken(token).ok, true);
});
