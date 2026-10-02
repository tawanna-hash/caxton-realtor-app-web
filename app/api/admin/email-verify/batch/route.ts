// POST { emails: string[] (max 60) } -> verifies each with the single-address
// check (MillionVerifier) and stores results in email_verifications.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { verifyAndStore } from '@/lib/server/email-verifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const schema = z.object({ emails: z.array(z.string().trim().min(3).max(320)).min(1).max(60) });

export const POST = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  await ensureSchema();
  const { emails } = schema.parse(await req.json());
  const queue = Array.from(new Set(emails.map((e) => e.toLowerCase())));
  const counts: Record<string, number> = {};
  async function worker() {
    for (;;) {
      const email = queue.shift();
      if (!email) return;
      try {
        const row = await verifyAndStore(email, { force: true });
        const k = row?.status ?? 'unknown';
        counts[k] = (counts[k] ?? 0) + 1;
      } catch {
        counts.error = (counts.error ?? 0) + 1;
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return NextResponse.json({ ok: true, counts });
});
