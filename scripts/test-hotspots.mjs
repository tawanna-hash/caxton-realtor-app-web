// Runs actual server routes and extractors against isolated embedded PostgreSQL.
// No database credentials, external API calls, or production records are used.
import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, '.hotspot-test-build');
const stub = resolve(root, 'tests/hotspots/server-stubs.ts');
await mkdir(output, { recursive: true });
try {
  await build({
    entryPoints: [resolve(root, 'tests/hotspots/server-tests.ts')],
    bundle: true, platform: 'node', format: 'esm', packages: 'external',
    outfile: resolve(output, 'tests.mjs'),
    alias: {
      '@': root,
      '@/lib/db': stub,
      '@/lib/server/auth/admin': stub,
      '@/lib/server/admin-tracking': stub,
    },
    plugins: [{ name: 'database-test-adapter', setup(b) {
      b.onResolve({ filter: /^@\/lib\/db$|^\.\.\/db$/ }, () => ({ path: stub }));
      b.onResolve({ filter: /^next\/server$/ }, () => ({ path: resolve(root, 'node_modules/next/server.js'), external: true }));
    } }],
  });
  const result = spawnSync(process.execPath, [resolve(output, 'tests.mjs')], { cwd: root, stdio: 'inherit' });
  process.exitCode = result.status || (result.error ? 1 : 0);
} finally {
  await rm(output, { recursive: true, force: true });
}
