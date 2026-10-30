// Guard: every /api/admin route handler must call an admin auth helper.
// The proxy does not cover API routes, so a handler that forgets the check
// would be reachable without a session. Public auth flows are allowlisted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../app/api/admin');
const AUTH =
  /getCurrentAdmin|requireAdmin|requireAdminSession|requireRole|getAdminSession|verifyAdminSessionToken|verifyCron|CRON_SECRET/;

// Intentionally public: sign-in flows and a signed-token PDF share link.
const ALLOWLIST = new Set([
  'auth/forgot-password/route.ts',
  'auth/login/route.ts',
  'auth/logout/route.ts',
  'auth/reset-password/route.ts',
  'events/gmail/shared/[token]/pdf/route.ts',
]);

function routes(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...routes(p));
    else if (/^route\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

test('every /api/admin route enforces admin auth', () => {
  const missing = routes(ROOT)
    .map((p) => path.relative(ROOT, p).split(path.sep).join('/'))
    .filter((rel) => !ALLOWLIST.has(rel))
    .filter((rel) => !AUTH.test(fs.readFileSync(path.join(ROOT, rel), 'utf8')));
  assert.deepEqual(missing, [], `Admin routes without an auth check: ${missing.join(', ')}`);
});
