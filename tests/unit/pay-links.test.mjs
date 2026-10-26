import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
process.env.SIGN_SECRET = 'test-secret';
const jiti = createJiti(import.meta.url, { alias: { '@': new URL('../..', import.meta.url).pathname } });
const tok = await jiti.import('../../lib/server/statement-pay-token.ts');
const mail = await jiti.import('../../lib/stripe-email.ts');

test('invoice and statement pay links round trip', () => {
  for (const subject of [{ kind: 'invoice', invoiceId: '123e4567-e89b-12d3-a456-426614174000' }, { kind: 'statement', advertiserId: 42, scope: 'all' }]) {
    const t = tok.statementPayUrl(subject).split('/pay/statement/')[1];
    assert.deepEqual(tok.verifyStatementPayToken(t).subject, subject);
  }
});
test('tampered pay link is rejected', () => {
  const t = tok.statementPayUrl({ kind: 'statement', advertiserId: 42, scope: 'all' }).split('/pay/statement/')[1];
  assert.equal(tok.verifyStatementPayToken(t + 'x').ok, false);
  assert.equal(tok.verifyStatementPayToken(t.replace('_42_', '_43_')).ok, false);
});
test('pay links never expire', () => {
  const t = tok.statementPayUrl({ kind: 'statement', advertiserId: 42, scope: 'all' }).split('/pay/statement/')[1];
  const exp = Number(t.split('.')[1]);
  assert.ok(exp * 1000 > Date.now() + 50 * 365 * 86400 * 1000, 'expiry is decades away');
});
test('stripe-safe email keeps one valid address only', () => {
  assert.equal(mail.stripeSafeEmail('a@x.com, b@y.com'), 'a@x.com');
  assert.equal(mail.stripeSafeEmail('Name <n@z.com>'), 'n@z.com');
  assert.equal(mail.stripeSafeEmail('bad'), undefined);
  assert.equal(mail.stripeSafeEmail(null), undefined);
});
