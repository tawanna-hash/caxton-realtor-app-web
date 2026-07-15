// tests/e2e/07-marketing-cron.spec.ts
//
// Smoke coverage for the marketing-sends cron dispatcher. The endpoint is
// gated by CRON_SECRET / x-vercel-cron, so without credentials it must refuse
// to run. We assert the refusal envelope rather than driving a real send —
// exercising the recurring spawn path requires a seeded DB and is covered by
// the unit test on the scheduling math (06-recurrence-math).

import { test, expect } from '@playwright/test';

test('GET /api/cron/marketing-sends without auth is rejected', async ({ request }) => {
  const res = await request.get('/api/cron/marketing-sends');
  // 401 when CRON_SECRET is configured but no bearer/vercel header is present;
  // 500 when CRON_SECRET is unset in the environment. Either way it must not
  // return a 200 "ok" dispatch result to an unauthenticated caller.
  expect([401, 500]).toContain(res.status());
  const body = (await res.json()) as { ok?: boolean; message?: string };
  expect(body.ok).toBe(false);
  expect(body.message).toBeTruthy();
});

test('GET /api/cron/marketing-sends with a bogus bearer token is rejected', async ({ request }) => {
  const res = await request.get('/api/cron/marketing-sends', {
    headers: { authorization: 'Bearer definitely-not-the-cron-secret' },
  });
  expect([401, 500]).toContain(res.status());
  const body = (await res.json()) as { ok?: boolean };
  expect(body.ok).toBe(false);
});
