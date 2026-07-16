// scripts/upload-signature.ts
//
// One-time upload of the animated email signature GIF to Vercel Blob.
// Usage: npx tsx scripts/upload-signature.ts <path-to-signature.gif>
// Requires BLOB_READ_WRITE_TOKEN in env (vercel env pull .env.local first).

import { put } from '@vercel/blob';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const argPath = process.argv[2];
  if (!argPath) {
    console.error('usage: npx tsx scripts/upload-signature.ts <path-to-signature.gif>');
    process.exit(1);
  }
  const abs = path.resolve(argPath);
  if (!fs.existsSync(abs)) {
    console.error(`file not found: ${abs}`); process.exit(1);
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('BLOB_READ_WRITE_TOKEN is not set. Run `vercel env pull .env.local` first.');
    process.exit(1);
  }
  const buf = fs.readFileSync(abs);
  const blob = await put('email/signature.gif', buf, {
    access: 'public',
    contentType: 'image/gif',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  console.log('\n✅ uploaded');
  console.log('URL:', blob.url);
  console.log('\nSet in Vercel env vars (all environments):');
  console.log(`  NEXT_PUBLIC_SIGNATURE_GIF_URL=${blob.url}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
