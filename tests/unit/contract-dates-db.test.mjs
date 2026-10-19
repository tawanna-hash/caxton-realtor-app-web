// Run: node --test tests/unit/contract-dates-db.test.mjs
// Exercises save, list, alert settings, remove and the daily alert job against an in-memory Postgres.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
globalThis.__neonPool = { query: (text, values) => db.query(text, values), on() {} };
process.env.RESEND_API_KEY = '';

const jiti = createJiti(import.meta.url, { alias: { '@': new URL('../..', import.meta.url).pathname } });
const m = await jiti.import('../../lib/server/contract-dates.ts');
const note = await jiti.import('../../lib/server/agent-deadline-notifications.ts');

const REALTOR = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const input = {
  propertyAddress: '123 Main St, Austin TX 78701', buyerNames: 'Pat Buyer', sellerNames: 'Sam Seller',
  effectiveDate: '2026-11-02', optionPeriodDays: '7', additionalEarnestMoneyDays: '', financingDeadlineDays: '',
  appraisalDeadlineDays: '', titleCommitmentDays: '', surveyDays: '', titleObjectionDays: '', closingDate: '2026-12-15',
};

before(async () => {
  await db.exec(`CREATE TABLE realtors (id UUID PRIMARY KEY, email TEXT, first_name TEXT);
    INSERT INTO realtors VALUES ('${REALTOR}', 'agent@example.com', 'Pat'), ('${OTHER}', 'other@example.com', 'Lee');`);
});

test('first save creates the workspace with email alerts on', async () => {
  const saved = await m.addContract(REALTOR, input);
  assert.ok(saved.id.startsWith('contracts-'));
  const { contracts, alerts } = await m.listContracts(REALTOR);
  assert.equal(contracts.length, 1);
  assert.equal(alerts.emailEnabled, true);
  assert.equal(alerts.pushEnabled, false);
  assert.ok(contracts[0].deadlines.some((d) => d.id === 'option-period-ends' && d.date === '2026-11-09'));
});

test('contracts are private to each agent', async () => {
  assert.equal((await m.listContracts(OTHER)).contracts.length, 0);
  const mine = (await m.listContracts(REALTOR)).contracts[0];
  assert.equal(await m.removeContract(OTHER, mine.id), false);
  assert.equal((await m.listContracts(REALTOR)).contracts.length, 1);
});

test('alert settings save and keep the contract', async () => {
  const alerts = await m.setContractAlerts(REALTOR, { pushEnabled: true, reminderOffsets: [3, 0] });
  assert.deepEqual(alerts, { emailEnabled: true, pushEnabled: true, reminderOffsets: [3, 0] });
  assert.equal((await m.listContracts(REALTOR)).contracts.length, 1);
});

test('the daily job finds the option-period deadline for a saved contract', async () => {
  // 2026-11-09 is the option deadline; reminder offsets are 3 and 0, so 2026-11-06 is a "3 days" day.
  const run = await note.runAgentDeadlineNotifications(new Date('2026-11-06T14:00:00Z'), { realtorId: REALTOR });
  assert.equal(run.eligibleWorkspaces, 1);
  assert.ok(run.dueDeadlines >= 1, JSON.stringify(run));
});

test('removing a contract removes it from the workspace', async () => {
  const mine = (await m.listContracts(REALTOR)).contracts[0];
  assert.equal(await m.removeContract(REALTOR, mine.id), true);
  assert.equal((await m.listContracts(REALTOR)).contracts.length, 0);
});

test('a non-contracts deal id cannot be removed through this module', async () => {
  assert.equal(await m.removeContract(REALTOR, 'some-full-closing-time-deal'), false);
});
