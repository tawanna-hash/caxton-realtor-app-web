import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/tests\/$/, '') } });
const { defaultPriceCents, docDates, docProblems, quotePayload, docTotalCents, EMPTY_DOC } = await jiti.import('../../lib/agreements-v2/builder-doc.ts');

const catalog = {
  print: [{ id: 'brand1', name: 'Brand [1]', sizes: [{ size: 'Half-Page', price: 1390 }] }],
  email: [{ id: 'e-blastpackageno.1', name: 'e-Blast Package No. 1', sends: 2, price: { austin: 1099, san_antonio: 492, both: 1432 } }],
  app: [{ slug: 'featured_builder_strip', name: 'Featured Builder Strip', weekly: { 1: 350, 2: 525, 3: 700, 4: 875 } }],
};

test('catalog prices', () => {
  assert.equal(defaultPriceCents({ channel: 'print', package_id: 'brand1', size: 'Half-Page', months: 3, publication: 'austin' }, catalog), 1390 * 100 * 3);
  assert.equal(defaultPriceCents({ channel: 'email', package_id: 'e-blastpackageno.1', sends: 2, publication: 'san_antonio' }, catalog), 492 * 100 * 2);
  assert.equal(defaultPriceCents({ channel: 'app', package_id: 'featured_builder_strip', app_weeks: 4, app_markets: 2, publication: 'austin' }, catalog), 525 * 100 * 4);
});

const svc = (o) => ({ id: 'x', publication: 'austin', price_cents: 10000, name: 'S', description: '', ...o });

test('dates: print whole months, app whole weeks, email one day; effective date respected', () => {
  const d = docDates({ effective: 'date', effective_date: '2026-12-01', services: [svc({ channel: 'print', months: 3 }), svc({ channel: 'app', app_weeks: 4 }), svc({ channel: 'email' })] }, '2026-10-20');
  assert.deepEqual(d, { start: '2026-12-01', end: '2027-02-28' });
  assert.deepEqual(docDates({ effective: 'acceptance', effective_date: '', services: [svc({ channel: 'email' })] }, '2026-10-20'), { start: '2026-10-20', end: '2026-10-20' });
});

test('problems and payload', () => {
  assert.equal(docProblems(EMPTY_DOC).length >= 2, true);
  const doc = { ...EMPTY_DOC, name: 'Deal', new_client: { name: 'Acme', email: 'a@b.co', contact: 'Ann' }, services: [svc({ channel: 'email', package_id: 'e-blastpackageno.1', sends: 1, price_cents: 100 })] };
  assert.deepEqual(docProblems(doc), []);
  assert.equal(docTotalCents(doc), 100);
  const p = quotePayload(doc, 'austin');
  assert.equal(p.line_items[0].override_total_cents, 100);
  assert.equal(p.advertiser.name, 'Acme');
  assert.equal(p.line_items[0].start_date, undefined);
});
