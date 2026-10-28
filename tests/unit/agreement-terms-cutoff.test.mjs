import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../../lib/agreement-terms.ts', import.meta.url), 'utf8');
test('legacy terms kept for agreements signed before cutoff', () => {
  assert.match(src, /LEGACY_ADVERTISING_TERMS/);
  assert.match(src, /TERMS_UPDATE_CUTOFF = '2026-10-27T05:00:00Z'/);
  assert.match(src, /signedAt/);
});
