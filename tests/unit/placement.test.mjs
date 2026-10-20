import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/tests\/$/, '') } });
const { placementNeeds, buildPlacementPatches, computeAppEnd } = await jiti.import('../../lib/agreements-v2/placement.ts');

const lines = [
  { line_no: 1, package_label: 'Print 1/4', channel: 'print', frequency: '3 months', quantity: 1, start_date: null },
  { line_no: 2, package_label: 'e-Blast', channel: 'email', frequency: null, quantity: 1, start_date: null },
  { line_no: 3, package_label: 'App banner', channel: 'app', frequency: '4wk', quantity: 4, start_date: null },
];
test('only email and app lines need placement details', () => {
  const n = placementNeeds({ channel: 'print', frequency: null, start_date: null }, lines);
  assert.deepEqual(n.lines.map((l) => l.line_no), [2, 3]);
  assert.equal(n.single, null);
});
test('builds line_item_dates; app end follows run length; past dates rejected', () => {
  const n = placementNeeds({ channel: 'print', frequency: null, start_date: null }, lines);
  const ok = buildPlacementPatches(n, { lines: [{ line_no: 2, preferred_send_dates: ['2026-11-05', '2026-11-12'] }, { line_no: 3, start_date: '2026-11-02' }] }, '2026-10-20');
  assert.ok(ok.ok);
  assert.deepEqual(ok.patches.line_item_dates[0], { line_no: 2, start_date: '2026-11-05', end_date: '2026-11-05', preferred_send_dates: ['2026-11-05', '2026-11-12'] });
  assert.equal(ok.patches.line_item_dates[1].end_date, '2026-11-29');
  assert.equal(buildPlacementPatches(n, { lines: [{ line_no: 2, preferred_send_dates: ['2026-10-01'] }, { line_no: 3, start_date: '2026-11-02' }] }, '2026-10-20').ok, false);
  assert.equal(buildPlacementPatches(n, { lines: [{ line_no: 3, start_date: '2026-11-02' }] }, '2026-10-20').ok, false);
});
test('monthly app runs end on the last day of the final month', () => {
  assert.equal(computeAppEnd('2026-11-10', { frequency: '3mo', quantity: 3 }), '2027-01-31');
});
