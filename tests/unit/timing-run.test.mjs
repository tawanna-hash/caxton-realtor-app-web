import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const ts = createRequire(import.meta.url)('typescript');
const src = fs.readFileSync(new URL('../../lib/pressbook-constants.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { buildTimingRun } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const on = (r) => Object.entries(r.months).filter(([, v]) => v).map(([k]) => `${k}:${r.years[k]}`);

test('3x from November 2026 rolls into 2027', () => {
  assert.deepEqual(on(buildTimingRun('november', 2026, 3)).sort(), ['december:2026', 'january:2027', 'november:2026']);
});
test('6x from March 2026', () => {
  const r = buildTimingRun('march', 2026, 6);
  assert.equal(on(r).length, 6);
  assert.equal(r.years.august, '2026');
  assert.equal(r.months.september, false);
});
test('12x from August 2026 covers every month, wrapping to 2027', () => {
  const r = buildTimingRun('august', 2026, 12);
  assert.equal(on(r).length, 12);
  assert.equal(r.years.august, '2026');
  assert.equal(r.years.july, '2027');
  assert.equal(r.years.january, '2027');
});

test('timingRunStart finds the first month of a consecutive run', async () => {
  const { timingRunStart } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
  const r = buildTimingRun('november', 2026, 3);
  assert.deepEqual(timingRunStart(r.months, r.years), { key: 'november', year: 2026 });
  const gap = { ...r.months, june: true };
  assert.equal(timingRunStart(gap, { ...r.years, june: '2026' }), null);
});
