import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/tests\/$/, '') } });
const { optionOf, discountedCents, optionDefs, orderedServices, docTotalCents, docProblems, EMPTY_DOC } = await jiti.import('../../lib/agreements-v2/builder-doc.ts');

const svc = (id, price, option, extra = {}) => ({ id, channel: 'print', package_id: 'brand1', publication: 'austin', price_cents: price, name: id, description: '', option, ...extra });

test('optionOf clamps to the package range', () => {
  assert.equal(optionOf({}, 2), 0);
  assert.equal(optionOf({ option: 5 }, 2), 1);
  assert.equal(optionOf({ option: -1 }, 2), 0);
});

test('discountedCents handles percent, amount and bad input', () => {
  assert.equal(discountedCents(10000, { type: 'pct', value: 10 }), 9000);
  assert.equal(discountedCents(10000, { type: 'amount', value: 25 }), 7500);
  assert.equal(discountedCents(10000, { type: 'amount', value: 500 }), 0);
  assert.equal(discountedCents(10000, undefined), 10000);
  assert.equal(discountedCents(10000, { type: 'pct', value: 150 }), 0);
});

test('optionDefs numbers lines package by package', () => {
  const doc = { options: ['A', 'B'], services: [svc('s1', 100, 1), svc('s2', 200, 0), svc('s3', 300, 1)] };
  assert.deepEqual(orderedServices(doc).map((s) => s.id), ['s2', 's1', 's3']);
  assert.deepEqual(optionDefs(doc), [{ name: 'A', line_nos: [1] }, { name: 'B', line_nos: [2, 3] }]);
  assert.equal(docTotalCents(doc, 1), 400);
  assert.equal(docTotalCents(doc, 0), 200);
});

test('docProblems flags empty packages and all-optional packages', () => {
  const base = { ...EMPTY_DOC, advertiser_id: 1 };
  assert.ok(docProblems({ ...base, options: ['A', 'B'], services: [svc('s1', 100, 0)] }).some((p) => p.includes('B has no services')));
  assert.ok(docProblems({ ...base, options: ['A'], services: [svc('s1', 100, 0, { optional: true })] }).some((p) => p.includes('required')));
  assert.deepEqual(docProblems({ ...base, options: ['A', 'B'], services: [svc('s1', 100, 0), svc('s2', 100, 1)] }), []);
});
