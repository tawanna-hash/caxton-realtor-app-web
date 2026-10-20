import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/tests\/$/, '') } });
const { planDraftSchedule } = await jiti.import('../../lib/agreements-v2/recurring-draft.ts');

const base = { company_name: 'Acme', ad_size: '1/4 page', billing_email: 'b@x.com', advertiser_email: 'a@x.com', billing_name: null, rep_name: 'A' };

test('print agreement: monthly rate for the number of months', () => {
  const r = planDraftSchedule({ ...base, ad_rate_cents: 50000, amount_cents: null, frequency: '3 months', start_date: '2026-12-01', end_date: '2027-02-28' });
  assert.ok(r.ok);
  assert.equal(r.plan.amount_cents, 50000);
  assert.equal(r.plan.occurrences, 3);
  assert.equal(r.plan.start_date, '2026-12-01');
  assert.equal(r.plan.bill_to_email, 'b@x.com');
});

test('falls back to total divided by term months', () => {
  const r = planDraftSchedule({ ...base, ad_rate_cents: null, amount_cents: 120000, frequency: null, start_date: '2026-12-01', end_date: '2027-02-28' });
  assert.ok(r.ok);
  assert.equal(r.plan.occurrences, 3);
  assert.equal(r.plan.amount_cents, 40000);
});

test('refuses when nothing to bill or no start date', () => {
  assert.equal(planDraftSchedule({ ...base, ad_rate_cents: null, amount_cents: null, frequency: null, start_date: '2026-12-01', end_date: null }).ok, false);
  assert.equal(planDraftSchedule({ ...base, ad_rate_cents: 100, amount_cents: null, frequency: '1', start_date: null, end_date: null }).ok, false);
});
