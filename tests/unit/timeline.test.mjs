import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/tests\/$/, '') } });
const { checkTimeline, cardTimeline } = await jiti.import('../../lib/agreements-v2/timeline.ts');
const { chargeBaseCents, needsFullForm } = await jiti.import('../../lib/new-partner-v2/service.ts');

const ag = { company_name: 'Acme', ad_size: '1/4 page', billing_email: 'b@x.com', advertiser_email: 'a@x.com', billing_name: null, rep_name: 'A', ad_rate_cents: 50000, amount_cents: null, frequency: '3 months', start_date: '2026-12-01', end_date: '2027-02-28' };

test('check timeline: invoices on the 18th, due 20 days later', () => {
  const t = checkTimeline(ag, { billing_day: 18, due_days: 20 });
  assert.ok(t.ok);
  assert.equal(t.entries[1].date, '2026-12-18');
  assert.equal(t.entries[2].date, '2027-01-07');
  assert.equal(t.entries.filter((e) => /issued/.test(e.label)).length, 3);
});

test('card timeline: charged today then saved card per issue', () => {
  const t = cardTimeline(ag, 50000, 51500);
  assert.ok(t.ok);
  assert.equal(t.entries[0].amount_cents, 51500);
  assert.equal(t.entries.length, 3);
});

test('bundle agreements charge their pay-now lines and no longer need the full form', () => {
  const bundle = { ...ag, type: 'package', ad_rate_cents: null, amount_cents: 300000, line_count: 3, lines_total: 300000, pay_now_total: 120000 };
  assert.equal(chargeBaseCents(bundle), 120000);
  assert.equal(needsFullForm(bundle), false);
  assert.equal(needsFullForm({ ...bundle, amount_cents: null, pay_now_total: 0, lines_total: 0, line_count: 0 }), true);
});
