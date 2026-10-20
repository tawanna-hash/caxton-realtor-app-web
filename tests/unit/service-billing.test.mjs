import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url);
const m = await jiti.import('../../lib/agreements-v2/service-billing.ts');
const ctx = { start: '2026-10-20', billing_day: 18 };
const b = (o) => ({ ...m.DEFAULT_BILLING, ...o });

test('monthly start of cycle uses next billing day and splits the total', () => {
  const p = m.planServiceBilling({ label: 'Print', total_cents: 30000, billing: b({ term_months: 3 }) }, ctx);
  assert.deepEqual(p.dates, ['2026-11-18', '2026-12-18', '2027-01-18']);
  assert.equal(p.amount_cents, 10000);
});
test('end of cycle shifts one month; custom day; one time', () => {
  assert.equal(m.planServiceBilling({ label: 'x', total_cents: 100, billing: b({ timing: 'end', term_months: 2 }) }, ctx).first_run_date, '2026-12-18');
  assert.equal(m.planServiceBilling({ label: 'x', total_cents: 100, billing: b({ day: 25 }) }, ctx).first_run_date, '2026-10-25');
  const one = m.planServiceBilling({ label: 'x', total_cents: 5000, billing: b({ cadence: 'one_time', term_months: 6 }) }, ctx);
  assert.equal(one.occurrences, 1); assert.equal(one.amount_cents, 5000);
});
test('specific date and manual', () => {
  const d = m.planServiceBilling({ label: 'x', total_cents: 200, billing: b({ start: 'date', start_date: '2026-12-01', term_months: 2 }) }, ctx);
  assert.deepEqual(d.dates, ['2026-12-01', '2027-01-01']);
  const man = m.planServiceBilling({ label: 'x', total_cents: 200, billing: b({ start: 'manual' }) }, ctx);
  assert.equal(man.manual, true); assert.deepEqual(man.dates, []);
});
test('invoices group by date and summary', () => {
  const plans = [
    m.planServiceBilling({ label: 'A', total_cents: 20000, billing: b({ term_months: 2 }) }, ctx),
    m.planServiceBilling({ label: 'B', total_cents: 5000, billing: b({ cadence: 'one_time' }) }, ctx),
    m.planServiceBilling({ label: 'C', total_cents: 900, billing: b({ start: 'manual' }) }, ctx),
  ];
  const rows = m.invoiceRows(plans, 20);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].total, 15000);
  assert.equal(rows[0].due, '2026-12-08');
  const s = m.summarize(plans, rows);
  assert.equal(s.total_cents, 25000); assert.equal(s.recurring_annual_cents, 120000); assert.deepEqual(s.manual_labels, ['C']);
});
test('plansForLines needs saved billing; payment defaults', () => {
  assert.equal(m.plansForLines([{ line_no: 1, package_label: 'x', amount_cents: 1 }], [{ line_no: 1 }], ctx), null);
  assert.deepEqual(m.cleanPayment({ card: false }), { card: false, check: true, due_days: null, show_schedule: true, schedule_view: 'timeline' });
  assert.equal(m.termMonths({ channel: 'app', app_weeks: 5 }), 2);
});

test('occurrence groups mirror Anchor: same day billed together', () => {
  const plans = [
    m.planServiceBilling({ label: 'A', total_cents: 40000, billing: b({ term_months: 1 }) }, ctx),
    m.planServiceBilling({ label: 'B', total_cents: 20000, billing: b({ term_months: 4 }) }, ctx),
    m.planServiceBilling({ label: 'C', total_cents: 20000, billing: b({ term_months: 4 }) }, ctx),
  ];
  const g = m.occurrenceGroups(plans);
  assert.equal(g.length, 2);
  assert.equal(g[0].title, 'Billed once on November 18, 2026');
  assert.equal(g[1].title, 'Billed monthly on the 18th');
  assert.equal(g[1].total_cents, 10000);
});
