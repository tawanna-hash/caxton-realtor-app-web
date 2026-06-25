// app/unsubscribe/[token]/page.tsx
//
// One-click unsubscribe handler. Both GET (render confirmation) and the
// embedded form POST flag the recipient as unsubscribed. We also flip the
// matching newsletter_subscribers row when the recipient is a subscriber.

import { getSql, ensureSchema } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function unsubscribeByToken(token: string): Promise<{ ok: boolean; email?: string }> {
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      UPDATE marketing_campaign_outreach_recipients
      SET status = 'unsubscribed', unsubscribed_at = COALESCE(unsubscribed_at, now())
      WHERE unsub_token = ${token}
      RETURNING email, recipient_type, recipient_id
    `) as unknown as Array<{ email: string; recipient_type: string; recipient_id: number | null }>;
    if (rows.length === 0) return { ok: false };
    const r = rows[0];
    // Flip newsletter_subscribers if this came from there.
    if (r.recipient_type === 'subscriber' && r.recipient_id != null) {
      await sql`
        UPDATE newsletter_subscribers
        SET status = 'unsubscribed', updated_at = now()
        WHERE id = ${r.recipient_id}
      `;
    }
    // Also bulk-unsubscribe any other ledger rows for the same email so the
    // user doesn't keep getting other campaigns after clicking once.
    await sql`
      UPDATE marketing_campaign_outreach_recipients
      SET status = 'unsubscribed', unsubscribed_at = COALESCE(unsubscribed_at, now())
      WHERE lower(email) = lower(${r.email}) AND status IN ('pending','sent')
    `;
    return { ok: true, email: r.email };
  } catch {
    return { ok: false };
  }
}

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await unsubscribeByToken(token);
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
        {result.ok ? (
          <>
            <h1 className="font-serif text-2xl text-gray-900 mb-2">You&apos;ve been unsubscribed.</h1>
            <p className="text-gray-600 text-sm">
              {result.email
                ? <>We won&apos;t send any more marketing emails to <strong>{result.email}</strong>.</>
                : <>We won&apos;t send any more marketing emails to this address.</>}
            </p>
            <p className="text-gray-500 text-xs mt-6">
              Changed your mind? Reply to any past email and we&apos;ll re-subscribe you.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-serif text-2xl text-gray-900 mb-2">Link expired</h1>
            <p className="text-gray-600 text-sm">
              This unsubscribe link is no longer valid. To stop receiving emails,
              reply to any past message with &ldquo;unsubscribe&rdquo;.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
