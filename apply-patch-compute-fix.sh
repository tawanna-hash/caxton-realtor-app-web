#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -f package.json ] || [ ! -f vercel.json ]; then echo "ERROR: run from repo root."; exit 1; fi
echo ">>> Backing up files"
cp lib/db.ts lib/db.ts.bak
cp vercel.json vercel.json.bak
for f in agreement-lifecycle marketing-sends scrape-abor-realtors send-scheduled-notifications sync-advertisers verify-subscribers-newsletter; do
  cp "app/api/cron/$f/route.ts" "app/api/cron/$f/route.ts.bak"
done
echo ">>> Patching lib/db.ts memoization"
node <<'JS'
const fs = require('fs');
const path = 'lib/db.ts';
let src = fs.readFileSync(path, 'utf8');
src = src.replace(
  /let schemaEnsured = false;/,
  `let schemaEnsured = false;
let schemaEnsurePromise: Promise<void> | null = null;
let schemaEnsureError: unknown = null;`
);
src = src.replace(
  /export async function ensureSchema\(\): Promise<void> \{\s*\n\s*if \(schemaEnsured\) return;\s*\n/,
  `export async function ensureSchema(): Promise<void> {
  if (schemaEnsured) return;
  if (schemaEnsureError) return;
  if (schemaEnsurePromise) return schemaEnsurePromise;
  schemaEnsurePromise = _runEnsureSchema()
    .then(() => { schemaEnsured = true; })
    .catch((err) => {
      schemaEnsureError = err;
      console.warn('[ensureSchema] one-time bootstrap failed, cached:', err instanceof Error ? err.message : err);
    })
    .finally(() => { schemaEnsurePromise = null; });
  return schemaEnsurePromise;
}

async function _runEnsureSchema(): Promise<void> {
`
);
src = src.replace(/\n\s*schemaEnsured = true;\s*\n\}\s*$/, '\n}\n');
fs.writeFileSync(path, src);
console.log('  ✓ lib/db.ts patched');
JS
echo ">>> Removing ensureSchema() from crons"
for f in agreement-lifecycle marketing-sends scrape-abor-realtors send-scheduled-notifications sync-advertisers verify-subscribers-newsletter; do
  FILE="app/api/cron/$f/route.ts"
  sed -i.tmp 's|^\(\s*\)await ensureSchema();|\1// removed: ensureSchema() — crons should not run DDL|' "$FILE"
  sed -i.tmp 's|import { ensureSchema, getSql } from |import { getSql } from |g' "$FILE"
  sed -i.tmp 's|import { getSql, ensureSchema } from |import { getSql } from |g' "$FILE"
  sed -i.tmp "s|import { ensureSchema } from '@/lib/db';|// removed: ensureSchema import|g" "$FILE"
  rm -f "$FILE.tmp"
  echo "  ✓ $FILE"
done
echo ">>> Slowing runaway crons in vercel.json"
node <<'JS'
const fs = require('fs');
const j = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
for (const c of j.crons) {
  if (c.path === '/api/cron/marketing-sends')             c.schedule = '*/15 * * * *';
  if (c.path === '/api/cron/send-scheduled-notifications') c.schedule = '*/10 * * * *';
  if (c.path === '/api/cron/expire-promotions')           c.schedule = '0 */3 * * *';
}
fs.writeFileSync('vercel.json', JSON.stringify(j, null, 2) + '\n');
console.log('  ✓ vercel.json updated');
JS
echo ""
echo ">>> Sanity checks"
grep -n 'schemaEnsurePromise\|schemaEnsureError' lib/db.ts | head -5
echo "---"
grep -E '"schedule"' vercel.json | grep -E 'marketing|scheduled-notifications|expire-promotions'
echo ""
echo ">>> Done. Review with:  git diff lib/db.ts vercel.json app/api/cron/"
echo ">>> Rollback with:  find . -name '*.bak' -exec bash -c 'mv \"\$1\" \"\${1%.bak}\"' _ {} \\;"
