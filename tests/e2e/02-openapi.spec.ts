// tests/e2e/02-openapi.spec.ts
//
// Smoke #2 — the OpenAPI spec is served and well-formed. Catches any
// regression in lib/server/openapi.ts (broken import, schema runtime error).

import { test, expect } from '@playwright/test';

test('GET /api/openapi.json returns a valid OpenAPI 3.x document', async ({ request }) => {
  const res = await request.get('/api/openapi.json');
  expect(res.status()).toBe(200);

  const spec = (await res.json()) as Record<string, unknown>;

  expect(typeof spec.openapi).toBe('string');
  expect((spec.openapi as string).startsWith('3.')).toBeTruthy();

  expect(spec.info).toBeTruthy();
  expect((spec.info as { title: string }).title).toBeTruthy();

  // Should declare at least the push + renewal-reminders paths.
  const paths = spec.paths as Record<string, unknown>;
  expect(paths['/api/push/subscribe']).toBeTruthy();
  expect(paths['/api/admin/renewal-reminders']).toBeTruthy();
});
