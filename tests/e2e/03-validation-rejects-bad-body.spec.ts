// tests/e2e/03-validation-rejects-bad-body.spec.ts
//
// Smoke #3 — zod validation actually rejects malformed bodies on the
// routes we just hardened. Verifies the error envelope shape too.

import { test, expect } from '@playwright/test';

test('POST /api/push/subscribe with missing fields returns 400 + validation error', async ({ request }) => {
  const res = await request.post('/api/push/subscribe', {
    data: { /* deliberately empty */ },
    headers: { 'content-type': 'application/json' },
  });
  expect(res.status()).toBe(400);
  const body = (await res.json()) as { error?: string; details?: unknown };
  expect(body.error).toBe('Validation failed');
  expect(body.details).toBeTruthy();
});

test('POST /api/push/unsubscribe with non-URL endpoint returns 400', async ({ request }) => {
  const res = await request.post('/api/push/unsubscribe', {
    data: { endpoint: 'not-a-url' },
    headers: { 'content-type': 'application/json' },
  });
  expect(res.status()).toBe(400);
});

test('GET /api/admin/renewal-reminders without auth returns 401', async ({ request }) => {
  const res = await request.get('/api/admin/renewal-reminders');
  expect(res.status()).toBe(401);
  const body = (await res.json()) as { error?: string };
  expect(body.error).toBeTruthy();
});
