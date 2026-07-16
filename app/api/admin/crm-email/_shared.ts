// app/api/admin/crm-email/_shared.ts
//
// Shared audience resolver for the CRM standalone composer.
//
// Mirrors the exact query shape used by /admin/crm/page.tsx so what the
// user sees in the CRM list is what gets sent. Uses parsePublications()
// so multi-publication rows (e.g. "austin,houston") match correctly.

import { getSql } from '@/lib/db';
import { parsePublications, type PublicationKey } from '@/lib/publication-theme';

export type CrmAudienceFilter = {
  query?: string;                    // free-text search on name/company/email
  status?: Array<'prospect' | 'advertiser' | 'archived'>;
  type?: Array<'advertiser' | 'client' | 'prospect' | 'mailing'>;
  publication?: PublicationKey[];    // OR match against a.publication CSV
  tag?: string;                      // single tag match against jsonb array
  ids?: number[];                    // explicit row selection overrides filters
};

export type CrmAudienceRow = {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  publication: string | null;
  status: string | null;
  type: string | null;
};

// Resolve the CRM audience filter into a deduped list of advertiser rows
// with valid emails. Server-side filtering: SQL for status/type/query,
// client-side filtering for publication + tag (matches CrmClient logic).
export async function resolveCrmAudience(f: CrmAudienceFilter): Promise<CrmAudienceRow[]> {
  const sql = getSql();

  // Explicit id list — fast path, bypass filters
  if (f.ids && f.ids.length > 0) {
    const rows = (await sql`
      SELECT
        a.id,
        COALESCE(a.contact_email, a.portal_email) AS email,
        a.first_name, a.last_name, a.company,
        a.publication, a.status, a.type
      FROM advertisers a
      WHERE a.id = ANY(${f.ids}::int[])
        AND COALESCE(a.contact_email, a.portal_email) IS NOT NULL
        AND length(trim(COALESCE(a.contact_email, a.portal_email))) > 0
    `) as unknown as CrmAudienceRow[];
    return rows;
  }

  // Build the base query the CRM uses — status/type are direct column matches.
  // Publication is a CSV column, so we pull all matching rows and filter
  // client-side via parsePublications() (matches CrmClient exactly).
  const status = f.status && f.status.length > 0 ? f.status : null;
  const type   = f.type   && f.type.length   > 0 ? f.type   : null;
  const q      = f.query  && f.query.trim().length > 0 ? `%${f.query.trim().toLowerCase()}%` : null;

  const rows = (await sql`
    SELECT
      a.id,
      COALESCE(a.contact_email, a.portal_email) AS email,
      a.first_name, a.last_name, a.company,
      a.publication, a.status, a.type,
      COALESCE(a.tags, '[]'::jsonb) AS tags
    FROM advertisers a
    WHERE
      COALESCE(a.contact_email, a.portal_email) IS NOT NULL
      AND length(trim(COALESCE(a.contact_email, a.portal_email))) > 0
      AND (${status}::text[] IS NULL OR a.status = ANY(${status}::text[]))
      AND (${type}::text[]   IS NULL OR a.type   = ANY(${type}::text[]))
      AND (
        ${q}::text IS NULL
        OR lower(COALESCE(a.name, '')) LIKE ${q}
        OR lower(COALESCE(a.company, '')) LIKE ${q}
        OR lower(COALESCE(a.contact_email, a.portal_email, '')) LIKE ${q}
      )
    ORDER BY a.updated_at DESC
    LIMIT 100000
  `) as unknown as Array<CrmAudienceRow & { tags: unknown }>;

  // Filter publication + tag in application code.
  const pubs = f.publication && f.publication.length > 0 ? new Set<string>(f.publication) : null;
  const tag  = f.tag && f.tag.trim().length > 0 ? f.tag.trim() : null;

  const out: CrmAudienceRow[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (pubs) {
      const advPubs = parsePublications(r.publication);
      const hit = advPubs.some((p) => pubs.has(p));
      if (!hit) continue;
    }
    if (tag) {
      const t = r.tags as unknown;
      const arr = Array.isArray(t) ? (t as unknown[]).map(String) : [];
      if (!arr.includes(tag)) continue;
    }
    const key = r.email.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: r.id,
      email: r.email,
      first_name: r.first_name,
      last_name: r.last_name,
      company: r.company,
      publication: r.publication,
      status: r.status,
      type: r.type,
    });
  }
  return out;
}

// Append the optional "download" call-to-action button to a body. Shared
// by the test + send routes so both render the manual attachment link the
// composer configured. No-op when no URL is set.
export function appendLinkButton(
  body: string,
  url: string | null | undefined,
  label: string | null | undefined,
): string {
  if (!url) return body;
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const text = label && label.trim() ? label : 'Download attachment';
  return (
    body +
    `<p style="margin:24px 0"><a href="${esc(url)}" style="display:inline-block;background:#7c3aed;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">${esc(text)}</a></p>`
  );
}

// Ensure a "CRM Outreach" campaign row exists so we can INSERT into
// marketing_campaign_outreach (which has NOT NULL FK to marketing_campaigns).
// Reused across all CRM sends — one row per publication scope.
export async function ensureCrmOutreachCampaign(publicationLabel: string): Promise<string> {
  const sql = getSql();
  const name = `CRM Outreach — ${publicationLabel}`;
  const existing = (await sql`
    SELECT id FROM marketing_campaigns WHERE name = ${name} LIMIT 1
  `) as unknown as Array<{ id: string }>;
  if (existing.length > 0) return existing[0].id;
  const created = (await sql`
    INSERT INTO marketing_campaigns (name, publication, status, audience_filter)
    VALUES (${name}, ${publicationLabel === 'all' ? null : publicationLabel}, 'active', '{}'::jsonb)
    RETURNING id
  `) as unknown as Array<{ id: string }>;
  return created[0].id;
}
