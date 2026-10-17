// lib/server/portal-records.ts
//
// Logo, locations and staff are the partner's canonical records (the same
// rows that feed the public partner page and the admin CRM). The portal reads
// and writes them in place, translated to the portal's generic item shape.
// Extra logo files stay in portal_resources.

import { getSql } from '@/lib/db';
import type { PortalResource, ResourceFile, ResourceKind } from '@/lib/portal-resources';

export const PRIMARY_LOGO_ID = 'primary-logo';

type Input = {
  title: string;
  url?: string | null;
  notes?: string | null;
  fields?: Record<string, string>;
  files?: ResourceFile[];
};

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v ?? ''));
const nn = (v: string | undefined | null): string | null => (v && v.trim() ? v.trim() : null);

function fileFromUrl(url: string | null, name: string): ResourceFile[] {
  return url ? [{ url, name, size: 0, mime: '' }] : [];
}

export function isRecordKind(kind: string): kind is 'location' | 'staff' | 'logo_file' {
  return kind === 'location' || kind === 'staff' || kind === 'logo_file';
}

export async function listRecords(advertiserId: number, kind: ResourceKind): Promise<PortalResource[]> {
  const sql = getSql();
  if (kind === 'location') {
    const rows = (await sql`
      SELECT id, label, address, address_2, city, state, zip, phone, updated_at
        FROM advertiser_locations WHERE advertiser_id = ${advertiserId}
       ORDER BY is_primary DESC, sort_order ASC, created_at ASC
    `) as unknown as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id), kind, title: String(r.label ?? r.address ?? 'Location'), url: null, notes: null,
      fields: {
        address: String(r.address ?? ''), address_2: String(r.address_2 ?? ''), city: String(r.city ?? ''),
        state: String(r.state ?? ''), zip: String(r.zip ?? ''), phone: String(r.phone ?? ''),
      },
      files: [], updated_at: iso(r.updated_at),
    }));
  }
  if (kind === 'staff') {
    const rows = (await sql`
      SELECT id, name, title, email, phone, photo_url, updated_at
        FROM advertiser_staff WHERE advertiser_id = ${advertiserId}
       ORDER BY sort_order ASC, created_at ASC
    `) as unknown as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id), kind, title: String(r.name), url: null, notes: null,
      fields: { role: String(r.title ?? ''), email: String(r.email ?? ''), phone: String(r.phone ?? '') },
      files: fileFromUrl((r.photo_url as string | null) ?? null, 'Photo'), updated_at: iso(r.updated_at),
    }));
  }
  // logo_file: company logo (advertisers.avatar_url) first, then extra files.
  const [adv, extra] = (await Promise.all([
    sql`SELECT avatar_url FROM advertisers WHERE id = ${advertiserId}`,
    sql`SELECT id, kind, title, url, notes, fields, files, updated_at FROM portal_resources
         WHERE advertiser_id = ${advertiserId} AND kind = 'logo_file' ORDER BY created_at DESC`,
  ])) as unknown as [{ avatar_url: string | null }[], (Omit<PortalResource, 'updated_at'> & { updated_at: unknown })[]];
  const items: PortalResource[] = [];
  const avatar = adv[0]?.avatar_url ?? null;
  items.push({
    id: PRIMARY_LOGO_ID, kind, title: 'Company logo (shown on your public partner page)', url: null, notes: null,
    fields: {}, files: fileFromUrl(avatar, 'Company logo'), updated_at: '',
  });
  for (const r of extra) items.push({ ...r, fields: r.fields ?? {}, files: r.files ?? [], updated_at: iso(r.updated_at) });
  return items;
}

export async function createRecord(advertiserId: number, kind: ResourceKind, b: Input): Promise<PortalResource | null> {
  const sql = getSql();
  const f = b.fields ?? {};
  if (kind === 'location') {
    const rows = (await sql`
      INSERT INTO advertiser_locations (advertiser_id, label, address, address_2, city, state, zip, phone, sort_order)
      VALUES (${advertiserId}, ${b.title}, ${nn(f.address)}, ${nn(f.address_2)}, ${nn(f.city)}, ${nn(f.state)}, ${nn(f.zip)}, ${nn(f.phone)},
              COALESCE((SELECT MAX(sort_order) + 1 FROM advertiser_locations WHERE advertiser_id = ${advertiserId}), 0))
      RETURNING id
    `) as unknown as { id: string }[];
    return (await listRecords(advertiserId, kind)).find((r) => r.id === rows[0].id) ?? null;
  }
  if (kind === 'staff') {
    const rows = (await sql`
      INSERT INTO advertiser_staff (advertiser_id, name, title, email, phone, photo_url, sort_order)
      VALUES (${advertiserId}, ${b.title}, ${nn(f.role)}, ${nn(f.email)}, ${nn(f.phone)}, ${b.files?.[0]?.url ?? null},
              COALESCE((SELECT MAX(sort_order) + 1 FROM advertiser_staff WHERE advertiser_id = ${advertiserId}), 0))
      RETURNING id
    `) as unknown as { id: string }[];
    return (await listRecords(advertiserId, kind)).find((r) => r.id === rows[0].id) ?? null;
  }
  const rows = (await sql`
    INSERT INTO portal_resources (advertiser_id, kind, title, url, notes, fields, files)
    VALUES (${advertiserId}, 'logo_file', ${b.title}, ${b.url ?? null}, ${b.notes ?? null},
            ${JSON.stringify(b.fields ?? {})}::jsonb, ${JSON.stringify(b.files ?? [])}::jsonb)
    RETURNING id
  `) as unknown as { id: string }[];
  return (await listRecords(advertiserId, kind)).find((r) => r.id === rows[0].id) ?? null;
}

export async function updateRecord(advertiserId: number, kind: ResourceKind, id: string, b: Input): Promise<PortalResource | null> {
  const sql = getSql();
  const f = b.fields ?? {};
  let n = 0;
  if (kind === 'logo_file' && id === PRIMARY_LOGO_ID) {
    await sql`UPDATE advertisers SET avatar_url = ${b.files?.[0]?.url ?? null} WHERE id = ${advertiserId}`;
    n = 1;
  } else if (kind === 'location') {
    n = (await sql`
      UPDATE advertiser_locations SET label = ${b.title}, address = ${nn(f.address)}, address_2 = ${nn(f.address_2)},
             city = ${nn(f.city)}, state = ${nn(f.state)}, zip = ${nn(f.zip)}, phone = ${nn(f.phone)}
       WHERE id = ${id} AND advertiser_id = ${advertiserId} RETURNING id
    `).length;
  } else if (kind === 'staff') {
    n = (await sql`
      UPDATE advertiser_staff SET name = ${b.title}, title = ${nn(f.role)}, email = ${nn(f.email)}, phone = ${nn(f.phone)},
             photo_url = ${b.files?.[0]?.url ?? null}
       WHERE id = ${id} AND advertiser_id = ${advertiserId} RETURNING id
    `).length;
  } else {
    n = (await sql`
      UPDATE portal_resources SET title = ${b.title}, url = ${b.url ?? null}, notes = ${b.notes ?? null},
             fields = ${JSON.stringify(b.fields ?? {})}::jsonb, files = ${JSON.stringify(b.files ?? [])}::jsonb, updated_at = NOW()
       WHERE id = ${id} AND advertiser_id = ${advertiserId} AND kind = 'logo_file' RETURNING id
    `).length;
  }
  if (n === 0) return null;
  return (await listRecords(advertiserId, kind)).find((r) => r.id === id) ?? null;
}

export async function deleteRecord(advertiserId: number, kind: ResourceKind, id: string): Promise<boolean> {
  const sql = getSql();
  if (kind === 'logo_file' && id === PRIMARY_LOGO_ID) {
    await sql`UPDATE advertisers SET avatar_url = NULL WHERE id = ${advertiserId}`;
    return true;
  }
  if (kind === 'location') return (await sql`DELETE FROM advertiser_locations WHERE id = ${id} AND advertiser_id = ${advertiserId} RETURNING id`).length > 0;
  if (kind === 'staff') return (await sql`DELETE FROM advertiser_staff WHERE id = ${id} AND advertiser_id = ${advertiserId} RETURNING id`).length > 0;
  return (await sql`DELETE FROM portal_resources WHERE id = ${id} AND advertiser_id = ${advertiserId} AND kind = 'logo_file' RETURNING id`).length > 0;
}
