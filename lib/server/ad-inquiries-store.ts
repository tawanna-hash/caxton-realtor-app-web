// lib/server/ad-inquiries-store.ts
//
// CRUD for ad_inquiries. Called by /api/inquire (insert) and the admin
// inbox at /admin/ads/inquiries (list/update). Every insert also upserts
// a row in `advertisers` with tags=['ad_inquiry'] so the contact lives
// in the unified CRM pipeline.

import { randomUUID } from 'crypto';
import { getSql } from '@/lib/db';
import type { AdChannel } from '@/lib/ad-channels';

export type AdInquiryStatus =
  | 'new'
  | 'replied'
  | 'quoted'
  | 'won'
  | 'lost'
  | 'spam';

export interface AdInquiryRow {
  id: string;
  channel: AdChannel;
  slot_slug: string | null;
  slot_label: string | null;
  publication: string | null;
  package_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  message: string;
  source_url: string | null;
  status: AdInquiryStatus;
  assignee: string | null;
  takeover: boolean;
  notes: string | null;
  advertiser_id: number | null;
  created_at: string;
  updated_at: string;
  replied_at: string | null;
  converted_at: string | null;
  lost_at: string | null;
}

export interface AdInquiryInsert {
  channel: AdChannel;
  slot_slug?: string | null;
  slot_label?: string | null;
  publication?: string | null;
  package_id?: string | null;
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  message: string;
  source_url?: string | null;
  ip?: string | null;
  user_agent?: string | null;
}

/**
 * Upsert an `advertisers` row keyed by lower(email). Tags it as an
 * ad_inquiry source so the unified CRM list can surface it alongside
 * other contacts. Returns the advertisers.id (numeric) or null on
 * failure — non-fatal, the inquiry record can still be created.
 */
async function upsertAdvertiserContact(input: {
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
}): Promise<number | null> {
  try {
    const sql = getSql();
    const email = input.email.trim().toLowerCase();
    const existing = (await sql`
      SELECT id, tags
        FROM advertisers
       WHERE lower(contact_email) = ${email}
       LIMIT 1
    `) as unknown as { id: number; tags: unknown }[];

    if (existing.length > 0) {
      const row = existing[0];
      // Merge tag if missing — preserve any existing tags.
      const tags = Array.isArray(row.tags) ? (row.tags as string[]) : [];
      if (!tags.includes('ad_inquiry')) {
        const newTags = [...tags, 'ad_inquiry'];
        await sql`
          UPDATE advertisers
             SET tags  = ${JSON.stringify(newTags)}::jsonb,
                 phone = COALESCE(NULLIF(phone, ''), ${input.phone ?? ''})
           WHERE id = ${row.id}
        `;
      }
      return row.id;
    }

    // New contact. Slug = lower-kebab of name + 6 random chars.
    const baseSlug =
      (input.company || input.name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'contact';
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`;

    const ins = (await sql`
      INSERT INTO advertisers
        (name, slug, contact_email, phone, company, share_token, type, status, tags)
      VALUES
        (${input.company || input.name},
         ${slug},
         ${input.email},
         ${input.phone ?? ''},
         ${input.company ?? ''},
         ${randomUUID()},
         'lead',
         'active',
         ${JSON.stringify(['ad_inquiry'])}::jsonb)
      RETURNING id
    `) as unknown as { id: number }[];
    return ins[0]?.id ?? null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[ad-inquiries-store] advertiser upsert failed:', msg);
    return null;
  }
}

/**
 * Persist an inquiry. Best-effort: if the DB write fails, returns null
 * so the calling route can still send the notification email (better
 * than dropping the lead entirely). Also upserts a CRM contact.
 */
export async function insertAdInquiry(
  input: AdInquiryInsert,
): Promise<AdInquiryRow | null> {
  try {
    const sql = getSql();

    const advertiserId = await upsertAdvertiserContact({
      name: input.name,
      email: input.email,
      phone: input.phone,
      company: input.company,
    });

    const rows = (await sql`
      INSERT INTO ad_inquiries
        (channel, slot_slug, slot_label, publication, package_id,
         name, email, phone, company, message,
         source_url, ip, user_agent, advertiser_id)
      VALUES
        (${input.channel},
         ${input.slot_slug ?? null},
         ${input.slot_label ?? null},
         ${input.publication ?? null},
         ${input.package_id ?? null},
         ${input.name},
         ${input.email},
         ${input.phone ?? null},
         ${input.company ?? null},
         ${input.message},
         ${input.source_url ?? null},
         ${input.ip ?? null},
         ${input.user_agent ?? null},
         ${advertiserId})
      RETURNING *
    `) as unknown as AdInquiryRow[];

    return rows[0] ?? null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[ad-inquiries-store] insert failed:', msg);
    return null;
  }
}

export interface ListAdInquiriesParams {
  channel?: AdChannel;
  status?: AdInquiryStatus;
  q?: string;
  limit?: number;
  offset?: number;
}

export async function listAdInquiries(
  params: ListAdInquiriesParams = {},
): Promise<{ rows: AdInquiryRow[]; total: number }> {
  const sql = getSql();
  const limit = Math.min(params.limit ?? 50, 200);
  const offset = Math.max(params.offset ?? 0, 0);
  const channel = params.channel ?? null;
  const status = params.status ?? null;
  const q = params.q ? `%${params.q.toLowerCase()}%` : null;

  const rows = (await sql`
    SELECT *
      FROM ad_inquiries
     WHERE (${channel}::text IS NULL OR channel = ${channel})
       AND (${status}::text  IS NULL OR status  = ${status})
       AND (${q}::text       IS NULL OR
            lower(name)    LIKE ${q} OR
            lower(email)   LIKE ${q} OR
            lower(company) LIKE ${q} OR
            lower(message) LIKE ${q})
     ORDER BY created_at DESC
     LIMIT ${limit}
     OFFSET ${offset}
  `) as unknown as AdInquiryRow[];

  const totalRows = (await sql`
    SELECT count(*)::int AS n
      FROM ad_inquiries
     WHERE (${channel}::text IS NULL OR channel = ${channel})
       AND (${status}::text  IS NULL OR status  = ${status})
       AND (${q}::text       IS NULL OR
            lower(name)    LIKE ${q} OR
            lower(email)   LIKE ${q} OR
            lower(company) LIKE ${q} OR
            lower(message) LIKE ${q})
  `) as unknown as { n: number }[];

  return { rows, total: totalRows[0]?.n ?? 0 };
}

export interface AdInquiryUpdate {
  status?: AdInquiryStatus;
  assignee?: string | null;
  takeover?: boolean;
  notes?: string | null;
}

export async function updateAdInquiry(
  id: string,
  patch: AdInquiryUpdate,
): Promise<AdInquiryRow | null> {
  const sql = getSql();

  // Stamp transition timestamps so the inbox can show "Replied 2h ago" etc.
  const repliedStamp = patch.status === 'replied' ? new Date().toISOString() : null;
  const convertedStamp = patch.status === 'won' ? new Date().toISOString() : null;
  const lostStamp = patch.status === 'lost' ? new Date().toISOString() : null;

  const rows = (await sql`
    UPDATE ad_inquiries
       SET status       = COALESCE(${patch.status ?? null}, status),
           assignee     = CASE WHEN ${patch.assignee !== undefined}::boolean THEN ${patch.assignee ?? null} ELSE assignee END,
           takeover     = COALESCE(${patch.takeover ?? null}::boolean, takeover),
           notes        = CASE WHEN ${patch.notes !== undefined}::boolean THEN ${patch.notes ?? null} ELSE notes END,
           replied_at   = COALESCE(${repliedStamp}::timestamptz,   replied_at),
           converted_at = COALESCE(${convertedStamp}::timestamptz, converted_at),
           lost_at      = COALESCE(${lostStamp}::timestamptz,      lost_at)
     WHERE id = ${id}
     RETURNING *
  `) as unknown as AdInquiryRow[];
  return rows[0] ?? null;
}

export async function getAdInquiry(id: string): Promise<AdInquiryRow | null> {
  const sql = getSql();
  const rows = (await sql`SELECT * FROM ad_inquiries WHERE id = ${id}`) as unknown as AdInquiryRow[];
  return rows[0] ?? null;
}

/**
 * Count of inquiries by status — used by the admin nav unread badge.
 */
export async function countAdInquiries(
  filter: { channel?: AdChannel; status?: AdInquiryStatus } = {},
): Promise<number> {
  const sql = getSql();
  const channel = filter.channel ?? null;
  const status = filter.status ?? null;
  const rows = (await sql`
    SELECT count(*)::int AS n
      FROM ad_inquiries
     WHERE (${channel}::text IS NULL OR channel = ${channel})
       AND (${status}::text  IS NULL OR status  = ${status})
  `) as unknown as { n: number }[];
  return rows[0]?.n ?? 0;
}
