// app/api/admin/marketing-campaigns/[id]/test/route.ts
//
// POST — Render the email body with sample tokens and send a single test
// message to a chosen address. Does NOT touch the recipient ledger or
// create an outreach row.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { parseJson } from '@/lib/server/schemas/_common';
import { getSql, ensureSchema } from '@/lib/db';
import { testSendSchema } from '@/lib/server/schemas/marketing-outreach';
import { buildEmail } from '@/lib/marketing-email';
import { sendEmail } from '@/lib/email';
import { fetchBlobAttachments } from '@/lib/server/blob-fetch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = withAdminTracking(async (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) throw new ApiError(400, 'invalid id');

  const input = await parseJson(req as unknown as Request, testSendSchema);
  await ensureSchema();
  const sql = getSql();
  const campRows = (await sql`
    SELECT publication FROM marketing_campaigns WHERE id = ${id}
  `) as unknown as Array<{ publication: string | null }>;
  if (campRows.length === 0) throw new ApiError(404, 'campaign not found');
  // marketing_campaigns.publication is stored as 'austin' | 'san_antonio' | 'both'
  // (see lib/server/schemas keys). Map to the brand the renderer expects.
  const pub = campRows[0].publication;
  const brand: 'realtyline' | 'newsline' | 'caxton' =
    pub === 'san_antonio' ? 'newsline'
    : pub === 'both' ? 'caxton'
    : 'realtyline';

  // Build a one-off recipient using the test address + sample placeholders.
  // We use a fixed pseudo-id so the open/click tracking pixel renders, but
  // we never persist anything.
  const built = buildEmail({
    subject: `[TEST] ${input.subject}`,
    body: input.body,
    previewText: input.preview_text,
    recipient: {
      id: 'test-preview-recipient',
      email: input.to,
      first_name: 'Sam',
      last_name:  'Sample',
      company:    'Acme Realty',
      unsub_token: 'test-token-not-real',
    },
    repName: admin.email ?? null,
    brand,
    attachmentLinks: input.attachments?.map((a) => ({ filename: a.filename, url: a.url })),
  });

  const from = input.from_name
    ? `${input.from_name} <${(process.env.EMAIL_FROM ?? 'hello@myrealtyline.com').replace(/^.*<|>$/g, '')}>`
    : undefined;

  const { attachments: resendAttachments } = await fetchBlobAttachments(input.attachments);
  const res = await sendEmail({
    to: input.to,
    from,
    replyTo: input.reply_to,
    subject: built.subject,
    html: built.html,
    attachments: resendAttachments.length > 0 ? resendAttachments : undefined,
  });
  if (!res.ok) throw new ApiError(502, `Resend send failed: ${res.error}`);

  return NextResponse.json({ ok: true, messageId: res.messageId });
});
