// Run: node --test tests/unit/contract-dates.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { alias: { '@': new URL('../..', import.meta.url).pathname } });
const m = await jiti.import('../../lib/server/contract-dates.ts');
const { agentDealSchema } = await jiti.import('../../lib/agent-command-center-workspace.ts');

const input = {
  propertyAddress: '123 Main St, Austin TX 78701', buyerNames: 'Pat Buyer', sellerNames: 'Sam Seller',
  effectiveDate: '2026-11-02', optionPeriodDays: '7', additionalEarnestMoneyDays: '', financingDeadlineDays: '21',
  appraisalDeadlineDays: '', titleCommitmentDays: '', surveyDays: '', titleObjectionDays: '', closingDate: '2026-12-15',
};

test('deal is valid, tagged as a contracts deal, and keeps the dates', () => {
  const deal = m.buildLiteDeal(input);
  assert.ok(deal.id.startsWith('contracts-'));
  assert.ok(m.isLiteDeal(deal));
  assert.equal(agentDealSchema.safeParse(deal).success, true);
  assert.equal(deal.effectiveDate, '2026-11-02');
  assert.equal(deal.status, 'active');
});

test('deadlines are computed from the effective date and sorted', () => {
  const list = m.deadlinesFor(input);
  const by = Object.fromEntries(list.map((d) => [d.id, d.date]));
  assert.equal(by['option-period-ends'], '2026-11-09');
  assert.equal(by['financing-deadline'], '2026-11-23');
  assert.equal(by['closing-date'], '2026-12-15');
  // Earnest money is 3 days after 11/2 (Mon) = Thu 11/5
  assert.equal(by['earnest-money-delivery'], '2026-11-05');
  assert.deepEqual(list.map((d) => d.date), [...list.map((d) => d.date)].sort());
});

test('no effective date gives no contract-period deadlines', () => {
  assert.deepEqual(m.deadlinesFor({ ...input, effectiveDate: '', closingDate: '' }), []);
});

test('only contracts deals are treated as lite deals', () => {
  assert.equal(m.isLiteDeal({ id: 'abc' }), false);
});
