import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/tests\/$/, '') } });
const t = await jiti.import('../../lib/agreements-v2/payment-method-template.ts');

test('blank client fields are reported as unresolved', () => {
  const missing = t.unresolvedPlaceholders('austin', { payment_setup_url: 'https://x/y' });
  assert.ok(missing.includes('payment_terms'));
  assert.ok(missing.includes('billing_schedule'));
  assert.ok(missing.includes('client_first_name'));
});

test('fully filled email has no placeholders (no agreement)', () => {
  const f = { client_first_name: 'Jane', payment_terms: '$100 per month', billing_schedule: 'Monthly', payment_setup_url: 'https://realtynewsnow.app/pay/setup/abc' };
  assert.deepEqual(t.unresolvedPlaceholders('austin', f), []);
  const out = t.renderPaymentMethodHtml('austin', f);
  assert.ok(!/\{\{/.test(out.html));
  assert.ok(/card or bank account/.test(out.html));
  assert.ok(!/I authorize/.test(out.html));
});

test('market brand follows the client market', () => {
  assert.equal(t.brandForMarket('san_antonio').brand, 'Newsline San Antonio');
  assert.equal(t.brandForMarket(null).brand, 'RealtyLine Austin');
});

test('ACH variant: bank-account wording and ach-only link', () => {
  const url = t.achSetupUrl('https://x.app/pay/setup/a.b.c');
  assert.equal(url, 'https://x.app/pay/setup/a.b.c?method=ach');
  assert.equal(t.achSetupUrl(url), url);
  const r = t.renderPaymentMethodTemplate('austin', { client_first_name: 'Jo', payment_setup_url: url }, 'ach');
  assert.match(r.body, /bank account for ACH debit/);
  assert.match(r.body, /Securely Add Bank Account \(ACH\)/);
  assert.doesNotMatch(r.body, /card or bank account/);
});
