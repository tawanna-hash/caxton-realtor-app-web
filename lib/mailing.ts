// lib/mailing.ts
//
// Single-tenant port of PressBook CRM's mailing-list module. The PressBook
// version sits on a multi-tenant `contacts` table with a `type` discriminator
// (client vs mailing) and a `tags[]` segment marker; here we use a dedicated
// `mailing_contacts` table with a `segment` enum and a flat schema. Schema
// is created idempotently in lib/crm-schema.ts.
//
// The "scraper" the user asked us to port is `syncAdvertisersFromAdvertisers`
// below: it walks the advertisers (clients) table and ensures every active
// advertiser + their additional_contacts has an Advertisers-segment row in
// the mailing list. Same add-only semantics as PressBook's
// `syncActiveClientsForOrg`.

import type { NeonQueryFunction } from '@neondatabase/serverless';
import { getSql } from './db';

type Sql = NeonQueryFunction<false, false>;

// ============================================================
// Segments (canonical labels & helpers)
// ============================================================

export type MailingSegment = 'advertiser' | 'non-advertiser' | 'realtor';

export const SEGMENTS: { segment: MailingSegment; slug: string; label: string; caption: string; accent: string }[] = [
  {
    segment: 'advertiser',
    slug:    'advertisers',
    label:   'Advertisers',
    caption: 'Businesses currently or previously running ads.',
    accent:  '#10B981',
  },
  {
    segment: 'non-advertiser',
    slug:    'non-advertisers',
    label:   'Non-Advertisers',
    caption: "Prospects and contacts who haven't run an ad yet.",
    accent:  '#F59E0B',
  },
  {
    segment: 'realtor',
    slug:    'realtors',
    label:   'REALTORS',
    caption: 'Licensed real estate agents — your core audience.',
    accent:  '#3D0740',
  },
];

export function segmentFromSlug(slug: string): MailingSegment | null {
  const m = SEGMENTS.find((s) => s.slug === slug);
  return m ? m.segment : null;
}

export function slugFromSegment(seg: MailingSegment): string {
  return SEGMENTS.find((s) => s.segment === seg)?.slug ?? seg;
}

export function isMailingSegment(v: unknown): v is MailingSegment {
  return v === 'advertiser' || v === 'non-advertiser' || v === 'realtor';
}

// ============================================================
// Row types
// ============================================================

export type MailingContactRow = {
  id: string;
  segment: MailingSegment;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  license_number: string | null;
  address: string | null;
  address_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  website: string | null;
  notes: string | null;
  tags: string[];
  source: string | null;
  advertiser_id: number | null;
  unsubscribed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MailingContactInput = {
  segment?: MailingSegment;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  title?: string | null;
  license_number?: string | null;
  address?: string | null;
  address_2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  website?: string | null;
  notes?: string | null;
  source?: string | null;
  advertiser_id?: number | null;
  tags?: string[] | null;
};

// ============================================================
// Columns + sorting
// ============================================================

export type MailingColumnId =
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'phone'
  | 'company'
  | 'title'
  | 'license_number'
  | 'address'
  | 'city'
  | 'state'
  | 'zip'
  | 'website'
  | 'notes'
  | 'created_at';

export const MAILING_COLUMNS: {
  id: MailingColumnId;
  label: string;
  sortable: boolean;
  defaultVisible: boolean;
}[] = [
  { id: 'first_name',     label: 'First Name', sortable: true,  defaultVisible: true  },
  { id: 'last_name',      label: 'Last Name',  sortable: true,  defaultVisible: true  },
  { id: 'email',          label: 'Email',      sortable: true,  defaultVisible: true  },
  { id: 'phone',          label: 'Phone',      sortable: false, defaultVisible: true  },
  { id: 'company',        label: 'Company',    sortable: true,  defaultVisible: true  },
  { id: 'title',          label: 'Title',      sortable: false, defaultVisible: false },
  { id: 'license_number', label: 'License #',  sortable: false, defaultVisible: false },
  { id: 'address',        label: 'Address',    sortable: false, defaultVisible: false },
  { id: 'city',           label: 'City',       sortable: true,  defaultVisible: true  },
  { id: 'state',          label: 'State',      sortable: true,  defaultVisible: true  },
  { id: 'zip',            label: 'ZIP',        sortable: false, defaultVisible: false },
  { id: 'website',        label: 'Website',    sortable: false, defaultVisible: false },
  { id: 'notes',          label: 'Notes',      sortable: false, defaultVisible: false },
  { id: 'created_at',     label: 'Added',      sortable: true,  defaultVisible: true  },
];

export const DEFAULT_VISIBLE_COLUMNS: MailingColumnId[] =
  MAILING_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id);

const SORTABLE_COLUMNS = new Set<MailingColumnId>(
  MAILING_COLUMNS.filter((c) => c.sortable).map((c) => c.id),
);

export function isSortableColumn(v: unknown): v is MailingColumnId {
  return typeof v === 'string' && SORTABLE_COLUMNS.has(v as MailingColumnId);
}

// ============================================================
// Import field mapping
// ============================================================

export type CanonicalImportField =
  | 'skip'
  | 'full_name'
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'phone'
  | 'company'
  | 'title'
  | 'license_number'
  | 'address'
  | 'city'
  | 'state'
  | 'zip'
  | 'website'
  | 'notes';

export const IMPORT_FIELDS: { id: CanonicalImportField; label: string }[] = [
  { id: 'skip',           label: '— Skip this column —' },
  { id: 'full_name',      label: 'Full Name (auto-split)' },
  { id: 'first_name',     label: 'First Name' },
  { id: 'last_name',      label: 'Last Name' },
  { id: 'email',          label: 'Email' },
  { id: 'phone',          label: 'Phone' },
  { id: 'company',        label: 'Company' },
  { id: 'title',          label: 'Title' },
  { id: 'license_number', label: 'License #' },
  { id: 'address',        label: 'Address' },
  { id: 'city',           label: 'City' },
  { id: 'state',          label: 'State' },
  { id: 'zip',            label: 'ZIP' },
  { id: 'website',        label: 'Website' },
  { id: 'notes',          label: 'Notes' },
];

const GUESS_TABLE: Record<string, CanonicalImportField> = {
  'first name': 'first_name', 'firstname': 'first_name', 'fname': 'first_name', 'given name': 'first_name',
  'last name': 'last_name', 'lastname': 'last_name', 'lname': 'last_name', 'surname': 'last_name', 'family name': 'last_name',
  'full name': 'full_name', 'name': 'full_name',
  'email': 'email', 'email address': 'email', 'e mail': 'email',
  'phone': 'phone', 'phone number': 'phone', 'mobile': 'phone', 'cell': 'phone',
  'company': 'company', 'organization': 'company', 'business': 'company', 'employer': 'company',
  'title': 'title', 'job title': 'title', 'position': 'title', 'role': 'title',
  'license': 'license_number', 'license number': 'license_number', 'license no': 'license_number',
  'license #': 'license_number', 'lic': 'license_number', 'lic #': 'license_number', 'lic no': 'license_number',
  'address': 'address', 'street': 'address', 'street address': 'address',
  'city': 'city',
  'state': 'state', 'province': 'state',
  'zip': 'zip', 'zipcode': 'zip', 'zip code': 'zip', 'postal code': 'zip', 'postcode': 'zip',
  'website': 'website', 'url': 'website', 'site': 'website',
  'notes': 'notes', 'note': 'notes', 'comment': 'notes',
};

export function guessField(header: string): CanonicalImportField {
  const h = header.trim().toLowerCase().replace(/[_\s-]+/g, ' ');
  return GUESS_TABLE[h] ?? 'skip';
}

export function splitFullName(full: string): { first_name: string; last_name: string } {
  const trimmed = full.trim().replace(/\s+/g, ' ');
  if (!trimmed) return { first_name: '', last_name: '' };
  const idx = trimmed.indexOf(' ');
  if (idx === -1) return { first_name: trimmed, last_name: '' };
  return { first_name: trimmed.slice(0, idx), last_name: trimmed.slice(idx + 1) };
}

// ============================================================
// Query helpers
// ============================================================

function normString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t || null;
}

/**
 * List mailing contacts for one segment, with optional search + sort +
 * pagination. Search hits across name, email, company, city, state, phone.
 */
export async function listMailingContacts(opts: {
  segment: MailingSegment;
  search?: string;
  sort?: MailingColumnId;
  dir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}): Promise<{ rows: MailingContactRow[]; total: number }> {
  const sql = getSql();
  const segment = opts.segment;
  const search  = (opts.search ?? '').trim();
  const sort    = opts.sort && SORTABLE_COLUMNS.has(opts.sort) ? opts.sort : 'created_at';
  const dir     = opts.dir === 'asc' ? 'asc' : 'desc';
  const limit   = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const offset  = Math.max(opts.offset ?? 0, 0);

  // Neon driver doesn't allow dynamic ORDER BY column names, so we
  // expand the small allow-listed set into a switch.
  const search_like = search ? `%${search.toLowerCase()}%` : null;

  const rows = search_like
    ? (await sql`
        SELECT * FROM mailing_contacts
         WHERE segment = ${segment}
           AND (
             LOWER(COALESCE(first_name, '')) LIKE ${search_like}
             OR LOWER(COALESCE(last_name, '')) LIKE ${search_like}
             OR LOWER(COALESCE(email, ''))     LIKE ${search_like}
             OR LOWER(COALESCE(company, ''))   LIKE ${search_like}
             OR LOWER(COALESCE(city, ''))      LIKE ${search_like}
             OR LOWER(COALESCE(state, ''))     LIKE ${search_like}
             OR REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g') LIKE ${search_like}
           )
         ORDER BY
           CASE WHEN ${sort} = 'first_name'  AND ${dir} = 'asc'  THEN LOWER(COALESCE(first_name, ''))  END ASC  NULLS LAST,
           CASE WHEN ${sort} = 'first_name'  AND ${dir} = 'desc' THEN LOWER(COALESCE(first_name, ''))  END DESC NULLS LAST,
           CASE WHEN ${sort} = 'last_name'   AND ${dir} = 'asc'  THEN LOWER(COALESCE(last_name, ''))   END ASC  NULLS LAST,
           CASE WHEN ${sort} = 'last_name'   AND ${dir} = 'desc' THEN LOWER(COALESCE(last_name, ''))   END DESC NULLS LAST,
           CASE WHEN ${sort} = 'email'       AND ${dir} = 'asc'  THEN LOWER(COALESCE(email, ''))       END ASC  NULLS LAST,
           CASE WHEN ${sort} = 'email'       AND ${dir} = 'desc' THEN LOWER(COALESCE(email, ''))       END DESC NULLS LAST,
           CASE WHEN ${sort} = 'company'     AND ${dir} = 'asc'  THEN LOWER(COALESCE(company, ''))     END ASC  NULLS LAST,
           CASE WHEN ${sort} = 'company'     AND ${dir} = 'desc' THEN LOWER(COALESCE(company, ''))     END DESC NULLS LAST,
           CASE WHEN ${sort} = 'city'        AND ${dir} = 'asc'  THEN LOWER(COALESCE(city, ''))        END ASC  NULLS LAST,
           CASE WHEN ${sort} = 'city'        AND ${dir} = 'desc' THEN LOWER(COALESCE(city, ''))        END DESC NULLS LAST,
           CASE WHEN ${sort} = 'state'       AND ${dir} = 'asc'  THEN LOWER(COALESCE(state, ''))       END ASC  NULLS LAST,
           CASE WHEN ${sort} = 'state'       AND ${dir} = 'desc' THEN LOWER(COALESCE(state, ''))       END DESC NULLS LAST,
           CASE WHEN ${sort} = 'created_at'  AND ${dir} = 'asc'  THEN created_at                        END ASC,
           CASE WHEN ${sort} = 'created_at'  AND ${dir} = 'desc' THEN created_at                        END DESC,
           created_at DESC
         LIMIT ${limit} OFFSET ${offset}
      `) as unknown as MailingContactRow[]
    : (await sql`
        SELECT * FROM mailing_contacts
         WHERE segment = ${segment}
         ORDER BY
           CASE WHEN ${sort} = 'first_name'  AND ${dir} = 'asc'  THEN LOWER(COALESCE(first_name, ''))  END ASC  NULLS LAST,
           CASE WHEN ${sort} = 'first_name'  AND ${dir} = 'desc' THEN LOWER(COALESCE(first_name, ''))  END DESC NULLS LAST,
           CASE WHEN ${sort} = 'last_name'   AND ${dir} = 'asc'  THEN LOWER(COALESCE(last_name, ''))   END ASC  NULLS LAST,
           CASE WHEN ${sort} = 'last_name'   AND ${dir} = 'desc' THEN LOWER(COALESCE(last_name, ''))   END DESC NULLS LAST,
           CASE WHEN ${sort} = 'email'       AND ${dir} = 'asc'  THEN LOWER(COALESCE(email, ''))       END ASC  NULLS LAST,
           CASE WHEN ${sort} = 'email'       AND ${dir} = 'desc' THEN LOWER(COALESCE(email, ''))       END DESC NULLS LAST,
           CASE WHEN ${sort} = 'company'     AND ${dir} = 'asc'  THEN LOWER(COALESCE(company, ''))     END ASC  NULLS LAST,
           CASE WHEN ${sort} = 'company'     AND ${dir} = 'desc' THEN LOWER(COALESCE(company, ''))     END DESC NULLS LAST,
           CASE WHEN ${sort} = 'city'        AND ${dir} = 'asc'  THEN LOWER(COALESCE(city, ''))        END ASC  NULLS LAST,
           CASE WHEN ${sort} = 'city'        AND ${dir} = 'desc' THEN LOWER(COALESCE(city, ''))        END DESC NULLS LAST,
           CASE WHEN ${sort} = 'state'       AND ${dir} = 'asc'  THEN LOWER(COALESCE(state, ''))       END ASC  NULLS LAST,
           CASE WHEN ${sort} = 'state'       AND ${dir} = 'desc' THEN LOWER(COALESCE(state, ''))       END DESC NULLS LAST,
           CASE WHEN ${sort} = 'created_at'  AND ${dir} = 'asc'  THEN created_at                        END ASC,
           CASE WHEN ${sort} = 'created_at'  AND ${dir} = 'desc' THEN created_at                        END DESC,
           created_at DESC
         LIMIT ${limit} OFFSET ${offset}
      `) as unknown as MailingContactRow[];

  const totalRow = search_like
    ? (await sql`
        SELECT COUNT(*)::int AS c FROM mailing_contacts
         WHERE segment = ${segment}
           AND (
             LOWER(COALESCE(first_name, '')) LIKE ${search_like}
             OR LOWER(COALESCE(last_name, '')) LIKE ${search_like}
             OR LOWER(COALESCE(email, ''))     LIKE ${search_like}
             OR LOWER(COALESCE(company, ''))   LIKE ${search_like}
             OR LOWER(COALESCE(city, ''))      LIKE ${search_like}
             OR LOWER(COALESCE(state, ''))     LIKE ${search_like}
             OR REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g') LIKE ${search_like}
           )
      `) as unknown as Array<{ c: number }>
    : (await sql`SELECT COUNT(*)::int AS c FROM mailing_contacts WHERE segment = ${segment}`) as unknown as Array<{ c: number }>;

  return { rows, total: totalRow[0]?.c ?? 0 };
}

export async function countBySegment(): Promise<Record<MailingSegment | 'total', number>> {
  const sql = getSql();
  const rows = (await sql`
    SELECT segment, COUNT(*)::int AS c
      FROM mailing_contacts
     GROUP BY segment
  `) as unknown as Array<{ segment: MailingSegment; c: number }>;
  const out = { total: 0, advertiser: 0, 'non-advertiser': 0, realtor: 0 } as Record<MailingSegment | 'total', number>;
  for (const r of rows) {
    if (isMailingSegment(r.segment)) {
      out[r.segment] = r.c;
      out.total += r.c;
    }
  }
  return out;
}

// ============================================================
// Create / update / delete
// ============================================================

export async function createMailingContact(input: MailingContactInput): Promise<MailingContactRow> {
  const sql = getSql();
  const segment = isMailingSegment(input.segment) ? input.segment : 'non-advertiser';
  const first_name = normString(input.first_name) ?? normString(input.email) ?? '(no name)';
  const tags = Array.isArray(input.tags) ? JSON.stringify(input.tags) : '[]';

  const rows = (await sql`
    INSERT INTO mailing_contacts
      (segment, first_name, last_name, email, phone, company, title, license_number,
       address, address_2, city, state, zip, website, notes, source, advertiser_id, tags)
    VALUES
      (${segment},
       ${first_name},
       ${normString(input.last_name)},
       ${normString(input.email)},
       ${normString(input.phone)},
       ${normString(input.company)},
       ${normString(input.title)},
       ${normString(input.license_number)},
       ${normString(input.address)},
       ${normString(input.address_2)},
       ${normString(input.city)},
       ${normString(input.state)},
       ${normString(input.zip)},
       ${normString(input.website)},
       ${normString(input.notes)},
       ${normString(input.source)},
       ${typeof input.advertiser_id === 'number' && Number.isFinite(input.advertiser_id) ? input.advertiser_id : null},
       ${tags}::jsonb)
    RETURNING *
  `) as unknown as MailingContactRow[];
  return rows[0];
}

const PATCHABLE_FIELDS: (keyof MailingContactInput)[] = [
  'segment', 'first_name', 'last_name', 'email', 'phone', 'company', 'title', 'license_number',
  'address', 'address_2', 'city', 'state', 'zip', 'website', 'notes', 'source', 'advertiser_id', 'tags',
];

export async function updateMailingContact(id: string, input: MailingContactInput): Promise<MailingContactRow | null> {
  const sql = getSql();
  // Apply each provided field individually with a typed UPDATE.
  for (const field of PATCHABLE_FIELDS) {
    if (!(field in input)) continue;
    const raw = input[field];
    if (field === 'segment') {
      if (!isMailingSegment(raw)) continue;
      await sql`UPDATE mailing_contacts SET segment = ${raw} WHERE id = ${id}`;
      continue;
    }
    if (field === 'tags') {
      if (Array.isArray(raw)) {
        await sql`UPDATE mailing_contacts SET tags = ${JSON.stringify(raw)}::jsonb WHERE id = ${id}`;
      }
      continue;
    }
    if (field === 'advertiser_id') {
      const v = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
      await sql`UPDATE mailing_contacts SET advertiser_id = ${v} WHERE id = ${id}`;
      continue;
    }
    if (field === 'first_name') {
      const v = normString(raw);
      if (v) await sql`UPDATE mailing_contacts SET first_name = ${v} WHERE id = ${id}`;
      continue;
    }
    const v = raw === null ? null : normString(raw);
    switch (field) {
      case 'last_name':      await sql`UPDATE mailing_contacts SET last_name      = ${v} WHERE id = ${id}`; break;
      case 'email':          await sql`UPDATE mailing_contacts SET email          = ${v} WHERE id = ${id}`; break;
      case 'phone':          await sql`UPDATE mailing_contacts SET phone          = ${v} WHERE id = ${id}`; break;
      case 'company':        await sql`UPDATE mailing_contacts SET company        = ${v} WHERE id = ${id}`; break;
      case 'title':          await sql`UPDATE mailing_contacts SET title          = ${v} WHERE id = ${id}`; break;
      case 'license_number': await sql`UPDATE mailing_contacts SET license_number = ${v} WHERE id = ${id}`; break;
      case 'address':        await sql`UPDATE mailing_contacts SET address        = ${v} WHERE id = ${id}`; break;
      case 'address_2':      await sql`UPDATE mailing_contacts SET address_2      = ${v} WHERE id = ${id}`; break;
      case 'city':           await sql`UPDATE mailing_contacts SET city           = ${v} WHERE id = ${id}`; break;
      case 'state':          await sql`UPDATE mailing_contacts SET state          = ${v} WHERE id = ${id}`; break;
      case 'zip':            await sql`UPDATE mailing_contacts SET zip            = ${v} WHERE id = ${id}`; break;
      case 'website':        await sql`UPDATE mailing_contacts SET website        = ${v} WHERE id = ${id}`; break;
      case 'notes':          await sql`UPDATE mailing_contacts SET notes          = ${v} WHERE id = ${id}`; break;
      case 'source':         await sql`UPDATE mailing_contacts SET source         = ${v} WHERE id = ${id}`; break;
    }
  }
  const rows = (await sql`SELECT * FROM mailing_contacts WHERE id = ${id}`) as unknown as MailingContactRow[];
  return rows[0] ?? null;
}

export async function deleteMailingContact(id: string): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`DELETE FROM mailing_contacts WHERE id = ${id} RETURNING id`) as unknown as Array<{ id: string }>;
  return rows.length > 0;
}

export async function deleteMailingContacts(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const sql = getSql();
  // Use ANY() with text[] cast back to uuid[] inside Postgres.
  const rows = (await sql`
    DELETE FROM mailing_contacts
     WHERE id = ANY(${ids}::uuid[])
     RETURNING id
  `) as unknown as Array<{ id: string }>;
  return rows.length;
}

// ============================================================
// Dedupe (keeps oldest row per duplicate group)
// ============================================================

export async function dedupeSegment(segment: MailingSegment): Promise<{ removed: number }> {
  const sql = getSql();
  // Match PressBook: same email (case-insensitive) OR same first+last+digits-of-phone.
  // Postgres-side: keep MIN(created_at) per group.
  const result = (await sql`
    WITH groups AS (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY
                 CASE
                   WHEN COALESCE(email, '') <> '' THEN 'e:' || LOWER(email)
                   ELSE 'n:' ||
                        LOWER(COALESCE(first_name, '')) || '|' ||
                        LOWER(COALESCE(last_name, ''))  || '|' ||
                        REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g')
                 END
               ORDER BY created_at ASC, id ASC
             ) AS rn
        FROM mailing_contacts
       WHERE segment = ${segment}
    )
    DELETE FROM mailing_contacts
     WHERE id IN (SELECT id FROM groups WHERE rn > 1)
     RETURNING id
  `) as unknown as Array<{ id: string }>;
  return { removed: result.length };
}

// ============================================================
// Sync from advertisers (the "scraper")
//
// PressBook's sync-helpers.ts walks the contacts(type='client',status='active')
// rows and ensures each one (plus its additional_contacts JSON column)
// has a contacts(type='mailing', tags @> '["advertiser"]') counterpart.
//
// In Caxton the source is the `advertisers` table (which holds both
// "advertiser" and "client" entries — the user already established that
// they're the same thing). We treat status='active' as the eligibility
// filter and additional_contacts JSONB the same way.
// ============================================================

type AdvertiserSyncRow = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  contact_email: string | null;
  portal_email: string | null;
  phone: string | null;
  office_phone: string | null;
  company: string | null;
  title: string | null;
  license_number: string | null;
  address: string | null;
  address_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  website: string | null;
  additional_contacts: unknown;
};

type AdditionalContact = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  address?: string | null;
  address_2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

type MailingSourceRow = {
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  license_number: string | null;
  address: string | null;
  address_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  website: string | null;
};

function digits(v: string | null | undefined): string {
  return (v ?? '').replace(/[^\d]/g, '');
}

function deriveFirstLast(adv: AdvertiserSyncRow): { first_name: string; last_name: string | null } {
  // Prefer first_name/last_name when present; fall back to splitting name.
  const f = (adv.first_name ?? '').trim();
  const l = (adv.last_name  ?? '').trim();
  if (f || l) return { first_name: f || (l ? '' : ''), last_name: l || null };
  const nm = (adv.name ?? '').trim();
  if (!nm) return { first_name: '', last_name: null };
  const { first_name, last_name } = splitFullName(nm);
  return { first_name, last_name: last_name || null };
}

function advertiserToSource(adv: AdvertiserSyncRow): MailingSourceRow | null {
  const { first_name, last_name } = deriveFirstLast(adv);
  const email = (adv.contact_email ?? adv.portal_email ?? '').trim() || null;
  if (!first_name && !email) return null;
  return {
    first_name: first_name || (email ?? ''),
    last_name,
    email,
    phone:          adv.phone        ?? adv.office_phone ?? null,
    company:        adv.company      ?? null,
    title:          adv.title        ?? null,
    license_number: adv.license_number ?? null,
    address:        adv.address      ?? null,
    address_2:      adv.address_2    ?? null,
    city:           adv.city         ?? null,
    state:          adv.state        ?? null,
    zip:            adv.zip          ?? null,
    website:        adv.website      ?? null,
  };
}

function additionalToSource(ac: AdditionalContact, parent: { company: string | null }): MailingSourceRow | null {
  const first = (ac.first_name ?? '').trim();
  const email = (ac.email ?? '').trim();
  if (!first && !email) return null;
  return {
    first_name:     first || email,
    last_name:      ac.last_name || null,
    email:          email || null,
    phone:          ac.phone || null,
    company:        parent.company,
    title:          ac.title || null,
    license_number: null,
    address:        ac.address   || null,
    address_2:      ac.address_2 || null,
    city:           ac.city      || null,
    state:          ac.state     || null,
    zip:            ac.zip       || null,
    website:        null,
  };
}

/** Find an existing Advertisers-segment row matching this source. */
async function findAdvertiserMailingId(sql: Sql, src: MailingSourceRow): Promise<string | null> {
  const email = (src.email ?? '').trim().toLowerCase();
  if (email) {
    const rows = (await sql`
      SELECT id FROM mailing_contacts
       WHERE segment = 'advertiser'
         AND LOWER(COALESCE(email, '')) = ${email}
       LIMIT 1
    `) as unknown as Array<{ id: string }>;
    if (rows[0]) return rows[0].id;
    return null;
  }
  const phoneDigits = digits(src.phone);
  if (!phoneDigits) return null;
  const first = (src.first_name ?? '').toLowerCase();
  const last  = (src.last_name  ?? '').toLowerCase();
  const rows = (await sql`
    SELECT id FROM mailing_contacts
     WHERE segment = 'advertiser'
       AND LOWER(COALESCE(first_name, '')) = ${first}
       AND LOWER(COALESCE(last_name, ''))  = ${last}
       AND REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g') = ${phoneDigits}
     LIMIT 1
  `) as unknown as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

async function insertAdvertiserMailing(
  sql: Sql,
  src: MailingSourceRow,
  advertiser_id: number | null,
  source_tag: string,
): Promise<void> {
  await sql`
    INSERT INTO mailing_contacts
      (segment, first_name, last_name, email, phone, company, title, license_number,
       address, address_2, city, state, zip, website, source, advertiser_id, tags)
    VALUES
      ('advertiser',
       ${src.first_name || (src.email ?? '(no name)')},
       ${src.last_name},
       ${src.email},
       ${src.phone},
       ${src.company},
       ${src.title},
       ${src.license_number},
       ${src.address},
       ${src.address_2},
       ${src.city},
       ${src.state},
       ${src.zip},
       ${src.website},
       ${source_tag},
       ${advertiser_id},
       '["advertiser"]'::jsonb)
  `;
}

/**
 * Walk active advertisers and insert any missing Advertisers-segment
 * mailing rows. Add-only: never updates an existing row (so manual
 * mailing-list edits are preserved). Returns counts for logging.
 */
export async function syncAdvertisersFromAdvertisers(): Promise<{
  added: number;
  skipped: number;
  errors: number;
}> {
  const sql = getSql();
  const advertisers = (await sql`
    SELECT id, first_name, last_name, name, contact_email, portal_email,
           phone, office_phone, company, title, license_number,
           address, address_2, city, state, zip, website,
           additional_contacts
      FROM advertisers
     WHERE COALESCE(status, 'active') = 'active'
  `) as unknown as AdvertiserSyncRow[];

  let added = 0;
  let skipped = 0;
  let errors = 0;

  for (const adv of advertisers) {
    const primary = advertiserToSource(adv);
    if (primary) {
      try {
        const existingId = await findAdvertiserMailingId(sql, primary);
        if (existingId) {
          skipped += 1;
        } else {
          await insertAdvertiserMailing(sql, primary, adv.id, 'sync:advertisers');
          added += 1;
        }
      } catch (err) {
        errors += 1;
        console.error('[mailing sync] primary failed for advertiser', adv.id, err);
      }
    }

    const acs: AdditionalContact[] = Array.isArray(adv.additional_contacts)
      ? (adv.additional_contacts as AdditionalContact[])
      : [];
    for (const ac of acs) {
      const src = additionalToSource(ac, { company: adv.company });
      if (!src) continue;
      try {
        const existingId = await findAdvertiserMailingId(sql, src);
        if (existingId) {
          skipped += 1;
        } else {
          await insertAdvertiserMailing(sql, src, adv.id, 'sync:advertisers:additional');
          added += 1;
        }
      } catch (err) {
        errors += 1;
        console.error('[mailing sync] additional failed for advertiser', adv.id, err);
      }
    }
  }

  return { added, skipped, errors };
}

/**
 * Upsert one advertiser's primary mailing row. Used as an inline hook
 * from the advertiser create/update endpoint so edits on a single
 * advertiser flow into the mailing list immediately (vs. waiting for
 * the cron run).
 */
export async function upsertAdvertiserMailingByAdvertiserId(advertiserId: number): Promise<{ added: boolean; updated: boolean }> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, first_name, last_name, name, contact_email, portal_email,
           phone, office_phone, company, title, license_number,
           address, address_2, city, state, zip, website,
           additional_contacts
      FROM advertisers
     WHERE id = ${advertiserId}
     LIMIT 1
  `) as unknown as AdvertiserSyncRow[];
  if (rows.length === 0) return { added: false, updated: false };
  const adv = rows[0];
  const primary = advertiserToSource(adv);
  if (!primary) return { added: false, updated: false };

  const existingId = await findAdvertiserMailingId(sql, primary);
  if (existingId) {
    await sql`
      UPDATE mailing_contacts
         SET first_name     = ${primary.first_name || (primary.email ?? '(no name)')},
             last_name      = ${primary.last_name},
             email          = ${primary.email},
             phone          = ${primary.phone},
             company        = ${primary.company},
             title          = ${primary.title},
             license_number = ${primary.license_number},
             address        = ${primary.address},
             address_2      = ${primary.address_2},
             city           = ${primary.city},
             state          = ${primary.state},
             zip            = ${primary.zip},
             website        = ${primary.website},
             advertiser_id  = ${adv.id}
       WHERE id = ${existingId}
    `;
    return { added: false, updated: true };
  }
  await insertAdvertiserMailing(sql, primary, adv.id, 'hook:advertiser-upsert');
  return { added: true, updated: false };
}
