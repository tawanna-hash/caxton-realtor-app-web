// Run: node --test tests/unit/payment-setup-db.test.mjs
// Runs the real payment-setup SQL (reminders, alerts, agreements list, ACH sign gate) on an in-memory Postgres.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createJiti } from 'jiti';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
globalThis.__pgliteTest = db;
globalThis.__neonPool = { query: (text, values) => db.query(text, values), on() {} };
process.env.DATABASE_URL = 'postgres://test/test';
process.env.RESEND_API_KEY = '';
process.env.PAYMENT_SETUP_SECRET = process.env.PAYMENT_SETUP_SECRET || 'test-secret';
process.env.SIGN_TOKEN_SECRET = 'test-secret';
process.env.NEXTAUTH_SECRET = 'test-secret';

const jiti = createJiti(import.meta.url, { alias: { '@': new URL('../..', import.meta.url).pathname, '@neondatabase/serverless': new URL('./_neon-shim.mjs', import.meta.url).pathname } });
const rem = await jiti.import('../../lib/server/payment-setup-reminders.ts');
const AG = '33333333-3333-4333-8333-333333333333';

before(async () => {
  // Minimal tables with the same column types as production (agreements.id is uuid, reminders keep it as text).
  await db.exec(`
    CREATE TABLE advertisers (id serial PRIMARY KEY, name text, email text, billing_email text, market text,
      stripe_customer_id text, stripe_payment_method_id text, payment_method_label text, payment_method_last4 text, payment_method_expiration text);
    CREATE TABLE agreements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), advertiser_id integer REFERENCES advertisers(id),
      company_name text, ad_size text, total_monthly_rate_cents int, signed_at timestamptz, stripe_customer_id text,
      stripe_payment_method_id text, payment_mode text, audit_log jsonb DEFAULT '[]', status text DEFAULT 'active',
      publication text, channel text, type text, paid_at timestamptz, created_at timestamptz DEFAULT NOW(), updated_at timestamptz DEFAULT NOW());
    CREATE TABLE agreement_line_items (id serial PRIMARY KEY, agreement_id uuid REFERENCES agreements(id), channel text);
    CREATE TABLE invoices (id serial PRIMARY KEY, agreement_id uuid REFERENCES agreements(id), status text, total_cents int);`);
  await rem.ensurePaymentSetupRequestsSchema();
});

// Pull the exact list SQL out of the route so the test cannot drift from production code.
function listSql() {
  const src = readFileSync(new URL('../../app/api/admin/agreements/route.ts', import.meta.url), 'utf8');
  const m = src.match(/sql`\s*(SELECT\s+ag\.\*[\s\S]*?ORDER BY ag\.updated_at DESC)\s*`/);
  assert.ok(m, 'list query found');
  return m[1];
}

test('agreements table exists with uuid id (join type check)', async () => {
    const r = await db.query(`SELECT data_type FROM information_schema.columns WHERE table_name='agreements' AND column_name='id'`);
  assert.equal(r.rows[0].data_type, 'uuid');
  await db.query(`INSERT INTO agreements (id, company_name, status) VALUES ($1, 'Test Co', 'active')`, [AG]);
});

test('list query runs, no alert before a request', async () => {
  const r = await db.query(listSql());
  const row = r.rows.find((x) => x.id === AG);
  assert.ok(row);
  assert.equal(row.payment_setup_requested_at, null);
});

test('request sent -> list shows alert fields', async () => {
  await rem.recordSetupRequest(AG, 'ap@example.com', 'austin');
  const row = (await db.query(listSql())).rows.find((x) => x.id === AG);
  assert.equal(row.payment_setup_sent_to, 'ap@example.com');
  assert.ok(row.payment_setup_requested_at);
  assert.equal(row.payment_setup_reminders, 0);
  assert.notEqual(row.payment_setup_verification_pending, true);
});

test('re-sending to a different email replaces the address and restarts reminders', async () => {
  await db.query(`UPDATE payment_setup_requests SET reminders_sent = 2 WHERE agreement_id = $1`, [AG]);
  await rem.recordSetupRequest(AG, 'other@example.com', 'austin');
  const row = (await db.query(listSql())).rows.find((x) => x.id === AG);
  assert.equal(row.payment_setup_sent_to, 'other@example.com');
  assert.equal(row.payment_setup_reminders, 0);
});

test('ACH sign gate accepts an agreement with a setup request', async () => {
  const src = readFileSync(new URL('../../app/api/ad-sign/[token]/route.ts', import.meta.url), 'utf8');
  const m = src.match(/sql`\s*(SELECT 1 FROM agreements a[\s\S]*?LIMIT 1)`/);
  assert.ok(m, 'gate query found');
  const q = m[1].replace('${id}', '$1');
  assert.equal((await db.query(q, [AG])).rows.length, 1);
  const other = '44444444-4444-4444-8444-444444444444';
  await db.query(`INSERT INTO agreements (id, company_name) VALUES ($1, 'No setup')`, [other]);
  assert.equal((await db.query(q, [other])).rows.length, 0, 'ACH blocked with no method and no request');
});

test('bank verification pending keeps a distinct alert, then clears when saved', async () => {
  await rem.resolveSetupRequest(AG, 'bank verification pending');
  let row = (await db.query(listSql())).rows.find((x) => x.id === AG);
  assert.equal(row.payment_setup_requested_at, null);
  assert.equal(row.payment_setup_verification_pending, true);
  await rem.resolveSetupRequest(AG, 'payment method saved');
  row = (await db.query(listSql())).rows.find((x) => x.id === AG);
  assert.notEqual(row.payment_setup_verification_pending, true);
});

test('reminder sweep (dry run) finds only due, signed requests', async () => {
  await rem.recordSetupRequest(AG, 'ap@example.com', 'austin');
  await db.query(`UPDATE payment_setup_requests SET requested_at = NOW() - INTERVAL '4 days' WHERE agreement_id = $1`, [AG]);
  const unsigned = await rem.runPaymentSetupReminderSweep({ dry: true });
  assert.equal(unsigned.would_send.length, 0, 'unsigned agreements are skipped');
  await db.query(`UPDATE agreements SET signed_at = NOW() WHERE id = $1`, [AG]);
  const signed = await rem.runPaymentSetupReminderSweep({ dry: true });
  assert.deepEqual(signed.would_send, [`${AG}:ap@example.com`]);
});
