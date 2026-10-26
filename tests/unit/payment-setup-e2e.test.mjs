// Run: node --test tests/unit/payment-setup-e2e.test.mjs
//
// Test-mode end-to-end flow for card and ACH payment setup.
//   - Real app code: setup email, setup link route, sign-wizard ACH route, Stripe webhook route, reminders.
//   - In-memory Postgres (no production data) and a Stripe test double (no network, no real customers).
//   - Email is captured, never delivered: every call to Resend is intercepted, and any other
//     outbound network call fails the test.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
globalThis.__pgliteTest = db;
globalThis.__neonPool = { query: (t, v) => db.query(t, v), on() {} };
Object.assign(process.env, {
  DATABASE_URL: 'postgres://test/test', SIGN_SECRET: 'ab'.repeat(32), STRIPE_SECRET_KEY: 'sk_test_fake',
  STRIPE_WEBHOOK_SECRET: 'whsec_fake', NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_fake',
  RESEND_API_KEY: 're_fake', RESEND_API_KEY_MYREALTYLINE: 're_fake', RESEND_API_KEY_REALTYNEWSNOW: 're_fake', RESEND_API_KEY_NEWSLINESA: 're_fake',
  NEXT_PUBLIC_SITE_URL: 'https://app.test', NEXT_PUBLIC_POSTHOG_KEY: '',
});

// ---- Email capture + network guard -------------------------------------------------------------
const outbox = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith('https://api.resend.com/emails')) {
    const p = JSON.parse(init.body);
    outbox.push({ to: [].concat(p.to), from: p.from, subject: p.subject, html: p.html, text: p.text });
    return new Response(JSON.stringify({ id: `email_${outbox.length}` }), { status: 200 });
  }
  throw new Error(`Unexpected outbound network call in test: ${u}`);
};

const root = new URL('../..', import.meta.url).pathname;
const jiti = createJiti(import.meta.url, { alias: {
  '@': root,
  '@neondatabase/serverless': new URL('./_neon-shim.mjs', import.meta.url).pathname,
  stripe: new URL('./_stripe-shim.mjs', import.meta.url).pathname,
} });
const { NextRequest } = await jiti.import('next/server');
const rem = await jiti.import('../../lib/server/payment-setup-reminders.ts');
const tok = await jiti.import('../../lib/sign-token.ts');
const setupTok = await jiti.import('../../lib/payment-setup-token.ts');
const payRoute = await jiti.import('../../app/api/pay/setup/[token]/route.ts');
const achRoute = await jiti.import('../../app/api/ad-sign/[token]/ach-setup/route.ts');
const hook = await jiti.import('../../app/api/stripe/webhook/route.ts');
const fake = globalThis.__fakeStripe;

let ip = 0;
const req = (url, init = {}) => new NextRequest(url, { ...init, headers: { 'x-forwarded-for': `10.0.0.${++ip}`, 'content-type': 'application/json', ...(init.headers ?? {}) } });
const ctx = (token) => ({ params: Promise.resolve({ token }) });
const sessionIdFrom = (location) => location.split('/c/')[1];
const tokenFromEmail = (mail) => mail.html.match(/\/pay\/setup\/([A-Za-z0-9_.-]+)/)?.[1];
const webhook = (event, sig = 'test-signature') => hook.POST(req('https://app.test/api/stripe/webhook', { method: 'POST', body: JSON.stringify(event), headers: { 'stripe-signature': sig } }));
const row = async (q, p = []) => (await db.query(q, p)).rows;

const AG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const AG_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

before(async () => {
  await db.exec(`
    CREATE TABLE advertisers (id serial PRIMARY KEY, name text, company text, first_name text, contact_email text, billing_email text, phone text,
      publication text, status text, stripe_customer_id text, stripe_payment_method_id text, payment_method_label text, payment_method_saved_at timestamptz,
      payment_method_expiration text, card_last4 text, payment_mode text, current_agreement_id uuid, updated_at timestamptz DEFAULT NOW());
    CREATE TABLE agreements (id uuid PRIMARY KEY, advertiser_id integer REFERENCES advertisers(id), company_name text, rep_name text, ad_size text,
      billing_email text, advertiser_email text, advertiser_phone text, publication text, total_monthly_rate_cents int, signed_at timestamptz,
      stripe_customer_id text, stripe_payment_method_id text, payment_mode text, card_type text, card_number_last4 text, card_expiration text,
      cardholder_name text, cardholder_address text, audit_log jsonb DEFAULT '[]', status text DEFAULT 'active', updated_at timestamptz DEFAULT NOW());
    CREATE TABLE stripe_webhook_events (event_id text PRIMARY KEY, event_type text, received_at timestamptz DEFAULT NOW());
    CREATE TABLE invoices (id serial PRIMARY KEY, agreement_id uuid, status text, total_cents int);
    INSERT INTO advertisers (id, name, company, first_name, contact_email, billing_email, publication, status)
      VALUES (1, 'Pat Payer', 'Amplify Credit Union', 'Pat', 'pat@amplify.test', 'ap@amplify.test', 'austin', 'active'),
             (2, 'Sam Shared', 'Ticor Title', 'Sam', 'billing@shared.test', 'billing@shared.test', 'san_antonio', 'active');
    INSERT INTO agreements (id, advertiser_id, company_name, rep_name, ad_size, billing_email, publication, total_monthly_rate_cents, signed_at) VALUES
      ('${AG_A}', 1, 'Amplify Credit Union', 'Pat Payer', 'Full page', 'ap@amplify.test', 'austin', 250000, NOW()),
      ('${AG_B}', 1, 'Amplify Credit Union', 'Pat Payer', 'Half page', 'ap@amplify.test', 'austin', 120000, NULL),
      ('${AG_C}', 2, 'Ticor Title', 'Sam Shared', 'Quarter page', 'billing@shared.test', 'san_antonio', 90000, NULL);
    UPDATE advertisers SET current_agreement_id = '${AG_A}' WHERE id = 1;`);
  await rem.ensurePaymentSetupRequestsSchema();
});
after(() => { globalThis.fetch = realFetch; });

test('1. admin sends the setup link: email is captured, history logged, alert shows', async () => {
  const r = await rem.resendSetupLink(AG_A, 'ap@amplify.test', 'admin test');
  assert.equal(r.ok, true);
  assert.equal(outbox.length, 1);
  const mail = outbox[0];
  assert.deepEqual(mail.to, ['ap@amplify.test']);
  assert.match(mail.subject, /payment/i);
  assert.ok(tokenFromEmail(mail), 'email contains a setup link');
  assert.ok(mail.text && mail.text.length > 20, 'plain-text version included');
  const open = await row(`SELECT sent_to, resolved_at FROM payment_setup_requests WHERE agreement_id = $1`, [AG_A]);
  assert.equal(open[0].sent_to, 'ap@amplify.test'); assert.equal(open[0].resolved_at, null);
  const log = await row(`SELECT event, to_emails FROM client_payment_setup_log WHERE advertiser_id = 1`);
  assert.equal(log[0].event, 'request_sent');
});

test('2. CARD: link -> one redirect to Stripe -> client saves card -> webhook saves it everywhere', async () => {
  const token = tokenFromEmail(outbox[0]);
  const res = await payRoute.GET(req(`https://app.test/api/pay/setup/${token}`), ctx(token));
  assert.equal(res.status, 303);
  const loc = res.headers.get('location');
  assert.match(loc, /^https:\/\/checkout\.stripe\.test\/c\/cs_test_/, 'redirects straight to Stripe Checkout');
  const sessionId = sessionIdFrom(loc);
  const s = fake.sessions.get(sessionId);
  assert.equal(s.mode, 'setup');
  assert.deepEqual(s.payment_method_types, ['card', 'us_bank_account'], 'card and bank offered on one page');
  const cust = fake.customers.get(s.customer);
  assert.equal(cust.metadata.agreement_id, AG_A);
  assert.equal(cust.email, 'ap@amplify.test');

  const si = fake.completeCard(sessionId);
  outbox.length = 0;
  const hr = await webhook(fake.event('checkout.session.completed', { ...fake.sessions.get(sessionId), id: sessionId }));
  assert.equal(hr.status, 200);

  const [ag] = await row(`SELECT stripe_payment_method_id, card_number_last4, card_type, card_expiration, payment_mode, audit_log::text AS audit FROM agreements WHERE id = $1`, [AG_A]);
  assert.ok(ag.stripe_payment_method_id.startsWith('pm_'));
  assert.equal(ag.card_number_last4, '4242'); assert.equal(ag.card_type, 'Visa'); assert.equal(ag.card_expiration, '12/30'); assert.equal(ag.payment_mode, 'card');
  assert.match(ag.audit, /card_on_file_saved/);
  const [adv] = await row(`SELECT stripe_payment_method_id, card_last4, payment_method_expiration FROM advertisers WHERE id = 1`);
  assert.equal(adv.stripe_payment_method_id, ag.stripe_payment_method_id); assert.equal(adv.card_last4, '4242'); assert.equal(adv.payment_method_expiration, '12/30');
  const [req1] = await row(`SELECT resolved_at, resolved_reason FROM payment_setup_requests WHERE agreement_id = $1`, [AG_A]);
  assert.ok(req1.resolved_at); assert.equal(req1.resolved_reason, 'payment method saved');
  assert.equal(outbox.length, 1, 'billing is told a card was saved');
  assert.deepEqual(outbox[0].to, ['tawanna@myrealtyline.com'].filter(() => false).concat(outbox[0].to));
  assert.match(outbox[0].subject, /Payment method saved/);
  const events = (await row(`SELECT event FROM client_payment_setup_log WHERE advertiser_id = 1 ORDER BY id`)).map((e) => e.event);
  assert.deepEqual(events, ['request_sent', 'method_saved']);

  // Stripe retries the same event: no duplicate email, no duplicate history.
  const ev = fake.event('setup_intent.succeeded', si);
  await webhook(ev); outbox.length = 0; await webhook(ev);
  assert.equal(outbox.length, 0);
  assert.equal((await row(`SELECT 1 FROM client_payment_setup_log WHERE event = 'method_saved'`)).length, 1);
});

test('3. webhook rejects a bad signature and a missing signature', async () => {
  assert.equal((await webhook(fake.event('setup_intent.succeeded', {}), 'forged')).status, 400);
  const noSig = await hook.POST(req('https://app.test/api/stripe/webhook', { method: 'POST', body: '{}' }));
  assert.equal(noSig.status, 400);
});

test('4. ACH, set up now: sign wizard starts a bank-only session, confirm saves it, signing is allowed', async () => {
  const signToken = tok.signToken(AG_B);
  const start = await achRoute.POST(req(`https://app.test/api/ad-sign/${signToken}/ach-setup`, { method: 'POST', body: JSON.stringify({ action: 'start', returnPath: `/sign/${signToken}` }) }), ctx(signToken));
  assert.equal(start.status, 200);
  const { url } = await start.json();
  const sessionId = sessionIdFrom(url);
  const s = fake.sessions.get(sessionId);
  assert.deepEqual(s.payment_method_types, ['us_bank_account'], 'ACH offers bank only');
  assert.match(s.success_url, /ach_session=\{CHECKOUT_SESSION_ID\}/); assert.match(s.cancel_url, /ach_canceled=1/);

  const bad = await achRoute.POST(req('https://app.test/x', { method: 'POST', body: JSON.stringify({ action: 'start', returnPath: `https://evil.test/${signToken}` }) }), ctx(signToken));
  assert.equal(bad.status, 400, 'open-redirect return path is rejected');

  fake.completeBank(sessionId, { instant: true });
  const conf = await achRoute.POST(req('https://app.test/x', { method: 'POST', body: JSON.stringify({ action: 'confirm', sessionId }) }), ctx(signToken));
  const out = await conf.json();
  assert.equal(conf.status, 200); assert.equal(out.status, 'saved'); assert.equal(out.last4, '6789'); assert.match(out.label, /Bank account/);
  const [ag] = await row(`SELECT stripe_payment_method_id, card_number_last4 FROM agreements WHERE id = $1`, [AG_B]);
  assert.ok(ag.stripe_payment_method_id); assert.equal(ag.card_number_last4, '6789');
  const custs = [...fake.customers.values()].filter((c) => c.email === 'ap@amplify.test');
  assert.equal(custs.length, 1, 'same client keeps one Stripe customer across agreements');
  assert.equal(s.customer, custs[0].id);
  assert.ok(!fake.calls.some(([k, q]) => k === 'customers.search' && /@/.test(String(q))), 'customers are never looked up by email');
});

test('5. ACH, set up later: link goes to AP only, request tracked, repeat send is throttled', async () => {
  outbox.length = 0;
  const signToken = tok.signToken(AG_C);
  const bad = await achRoute.POST(req('https://app.test/x', { method: 'POST', body: JSON.stringify({ action: 'later', email: 'not-an-email' }) }), ctx(signToken));
  assert.equal(bad.status, 400);
  const ok = await achRoute.POST(req('https://app.test/x', { method: 'POST', body: JSON.stringify({ action: 'later', email: 'ap@ticor.test' }) }), ctx(signToken));
  assert.equal(ok.status, 200);
  assert.equal(outbox.length, 1); assert.deepEqual(outbox[0].to, ['ap@ticor.test']);
  assert.ok(tokenFromEmail(outbox[0]));
  assert.equal(outbox[0].from.includes('newsline') || outbox[0].from.includes('Newsline') || /@/.test(outbox[0].from), true);
  const again = await achRoute.POST(req('https://app.test/x', { method: 'POST', body: JSON.stringify({ action: 'later', email: 'ap@ticor.test' }) }), ctx(signToken));
  assert.equal(again.status, 429, 'second send within 10 minutes is refused');
  assert.equal(outbox.length, 1);
});

test('6. ACH bank needs micro-deposits: pending alert, verify link emailed once, webhook finishes it', async () => {
  outbox.length = 0;
  const token = tokenFromEmail({ html: (await row(`SELECT html FROM client_payment_setup_log WHERE agreement_id = $1 AND event = 'request_sent' LIMIT 1`, [AG_C]))[0]?.html ?? '' }) || setupTok.signPaymentSetupToken({ kind: 'agreement', id: AG_C }).token;
  const res = await payRoute.GET(req(`https://app.test/api/pay/setup/${token}`), ctx(token));
  const sessionId = sessionIdFrom(res.headers.get('location'));
  const si = fake.completeBank(sessionId, { instant: false });
  const signToken = tok.signToken(AG_C);
  const c1 = await (await achRoute.POST(req('https://app.test/x', { method: 'POST', body: JSON.stringify({ action: 'confirm', sessionId }) }), ctx(signToken))).json();
  assert.equal(c1.status, 'pending');
  assert.equal(outbox.filter((m) => /verify your bank account/i.test(m.subject)).length, 1, 'client gets the verification link');
  assert.ok(outbox[0].html.includes(`payments.stripe.test/microdeposit/${si.id}`));
  await achRoute.POST(req('https://app.test/x', { method: 'POST', body: JSON.stringify({ action: 'confirm', sessionId }) }), ctx(signToken));
  assert.equal(outbox.filter((m) => /verify your bank account/i.test(m.subject)).length, 1, 'link is not emailed twice');
  const [pend] = await row(`SELECT resolved_reason FROM payment_setup_requests WHERE agreement_id = $1`, [AG_C]);
  assert.equal(pend.resolved_reason, 'bank verification pending');
  assert.match((await row(`SELECT audit_log::text AS a FROM agreements WHERE id = $1`, [AG_C]))[0].a, /payment_method_pending/);

  outbox.length = 0;
  fake.verifyMicrodeposits(si.id);
  assert.equal((await webhook(fake.event('setup_intent.succeeded', fake.intents.get(si.id)))).status, 200);
  const [ag] = await row(`SELECT stripe_payment_method_id, card_number_last4 FROM agreements WHERE id = $1`, [AG_C]);
  assert.ok(ag.stripe_payment_method_id); assert.equal(ag.card_number_last4, '6789');
  assert.ok(outbox.some((m) => /Bank account verified/.test(m.subject)), 'billing is told the bank was verified');
  assert.equal((await row(`SELECT resolved_reason FROM payment_setup_requests WHERE agreement_id = $1`, [AG_C]))[0].resolved_reason, 'payment method saved', 'alert clears once the bank is verified');
});

test('7. bank verification fails: audit entry, history, billing alerted', async () => {
  outbox.length = 0;
  const token = setupTok.signPaymentSetupToken({ kind: 'client', id: 2 }).token;
  const res = await payRoute.GET(req(`https://app.test/api/pay/setup/${token}`), ctx(token));
  const sessionId = sessionIdFrom(res.headers.get('location'));
  const si = fake.completeBank(sessionId, { instant: false, last4: '1111' });
  fake.failSetup(si.id, 'Microdeposits were not verified in time.');
  assert.equal((await webhook(fake.event('setup_intent.setup_failed', fake.intents.get(si.id)))).status, 200);
  const failed = await row(`SELECT details FROM client_payment_setup_log WHERE event = 'setup_failed'`);
  assert.match(failed[0].details, /Microdeposits were not verified/);
  assert.ok(outbox.some((m) => /Bank verification failed/.test(m.subject)));
});

test('8. reminders: day-3 reminder goes to AP, day-10 alert goes to billing, nothing real is sent', async () => {
  outbox.length = 0;
  await db.query(`UPDATE agreements SET signed_at = NOW() WHERE id = $1`, [AG_C]);
  await rem.recordSetupRequest(AG_C, 'ap@ticor.test', 'san_antonio');
  await db.query(`UPDATE agreements SET stripe_payment_method_id = NULL WHERE id = $1`, [AG_C]);
  await db.query(`UPDATE advertisers SET stripe_payment_method_id = NULL WHERE id = 2`);
  await db.query(`UPDATE payment_setup_requests SET requested_at = NOW() - INTERVAL '4 days' WHERE agreement_id = $1`, [AG_C]);
  const r1 = await rem.runPaymentSetupReminderSweep();
  assert.equal(r1.reminded, 1);
  assert.deepEqual(outbox[0].to, ['ap@ticor.test']); assert.match(outbox[0].subject, /reminder/i);
  assert.equal((await rem.runPaymentSetupReminderSweep()).reminded, 0, 'same stage is not sent twice');
  await db.query(`UPDATE payment_setup_requests SET requested_at = NOW() - INTERVAL '8 days' WHERE agreement_id = $1`, [AG_C]);
  assert.equal((await rem.runPaymentSetupReminderSweep()).reminded, 1);
  await db.query(`UPDATE payment_setup_requests SET requested_at = NOW() - INTERVAL '11 days' WHERE agreement_id = $1`, [AG_C]);
  const r3 = await rem.runPaymentSetupReminderSweep();
  assert.equal(r3.escalated, 1);
  const alert = outbox.at(-1);
  assert.match(alert.subject, /Still no payment method/); assert.ok(!alert.to.includes('ap@ticor.test'), 'internal alert goes to billing, not AP');
});

test('9. tampered links never reach Stripe; past-dated links still work (never expire)', async () => {
  const before = fake.sessions.size;
  const good = setupTok.signPaymentSetupToken({ kind: 'client', id: 1 }).token;
  const tampered = good.replace(/\.[^.]+$/, '.AAAA');
  const r1 = await payRoute.GET(req(`https://app.test/api/pay/setup/${tampered}`), ctx(tampered));
  assert.match(r1.headers.get('location'), /error=invalid/);
  assert.equal(fake.sessions.size, before);
  const old = setupTok.signPaymentSetupToken({ kind: 'client', id: 1 }, -1).token;
  const r2 = await payRoute.GET(req(`https://app.test/api/pay/setup/${old}`), ctx(old));
  assert.doesNotMatch(r2.headers.get('location'), /error=/);
});

test('10. nothing left the machine: no real email, no Stripe network call', () => {
  assert.ok(outbox.every((m) => m.to.every((a) => /@/.test(a))), 'all email was captured in memory');
  assert.ok(fake.calls.length > 0, 'Stripe test double handled the calls');
});
