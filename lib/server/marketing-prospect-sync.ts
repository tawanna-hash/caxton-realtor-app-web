// lib/server/marketing-prospect-sync.ts
//
// Wire marketing outreach dispatches into the CRM. After each real
// send succeeds, upsert the recipient into the `advertisers` table
// (which doubles as the CRM contacts table).
//
// Rules (matches the Session 22 status vocabulary):
//   • New row → status='prospect', type='prospect', source tag added.
//     Existing rows are NEVER demoted — status/type are left alone.
//   • Always bump last_contacted_at + outreach_count.
//   • Test sends do NOT call this — dispatch is called from real
//     /send routes only.
//   • Advertiser-source recipients (already have an advertisers.id)
//     still get last_contacted_at bumped, but nothing else changes.

import { ensureSchema, getSql } from '@/lib/db';
import { isPartnerDeletionTombstoned } from '@/lib/advertiser-deletion-tombstones';

export type ProspectSyncInput = {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  source: string;
};

export async function syncProspectFromOutreach(
  input: ProspectSyncInput,
): Promise<{ inserted: boolean }> {
  await ensureSchema();
  const sql = getSql();
  const email = input.email.trim().toLowerCase();
  if (!email) return { inserted: false };

  if (await isPartnerDeletionTombstoned({ email, name: input.company })) {
    return { inserted: false };
  }

  const existing = (await sql`
    SELECT id FROM advertisers WHERE lower(contact_email) = ${email} LIMIT 1
  `) as unknown as Array<{ id: number }>;

  if (existing.length > 0) {
    await sql`
      UPDATE advertisers
      SET last_contacted_at = now(),
          outreach_count    = COALESCE(outreach_count, 0) + 1
      WHERE id = ${existing[0].id}
    `;
    return { inserted: false };
  }

  const displayName =
    [input.first_name, input.last_name].filter(Boolean).join(' ').trim() ||
    input.company?.trim() ||
    email;
  const slugBase =
    (displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'prospect');
  const slug = `${slugBase}-${Math.random().toString(36).slice(2, 8)}`;
  const shareToken =
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

  const note = `Auto-added from marketing outreach (source: ${input.source}).`;

  await sql`
    INSERT INTO advertisers (
      name, slug, share_token,
      contact_email,
      first_name, last_name, company,
      type, status,
      last_contacted_at, outreach_count,
      tags, notes,
      requires_email_gate
    ) VALUES (
      ${displayName}, ${slug}, ${shareToken},
      ${email},
      ${input.first_name ?? null}, ${input.last_name ?? null}, ${input.company ?? null},
      'prospect', 'prospect',
      now(), 1,
      '["marketing-outreach"]'::jsonb, ${note},
      false
    )
  `;

  return { inserted: true };
}
