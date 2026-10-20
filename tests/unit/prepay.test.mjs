import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url);
const { prepayRequired, checkRequestState, CHECK_REQUEST_EVENT, CHECK_APPROVED_EVENT } = await jiti.import('../../lib/agreements-v2/prepay.ts');

test('digital or e-Blast anywhere in the agreement means prepay', () => {
  assert.equal(prepayRequired('print', ['print', 'print']), false);
  assert.equal(prepayRequired('print', ['print', 'email']), true);
  assert.equal(prepayRequired('print', ['app']), true);
  assert.equal(prepayRequired('email', []), true);
  assert.equal(prepayRequired('digital', ['print']), true);
});

test('check request state follows the activity log', () => {
  assert.equal(checkRequestState(null), null);
  assert.equal(checkRequestState([{ event: 'other' }]), null);
  assert.equal(checkRequestState([{ event: CHECK_REQUEST_EVENT }]), 'requested');
  assert.equal(checkRequestState([{ event: CHECK_REQUEST_EVENT }, { event: CHECK_APPROVED_EVENT }]), 'approved');
});
