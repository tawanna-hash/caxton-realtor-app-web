// POST /api/admin/mailing/holding/county-realign
//   Body: { dryRun?: boolean (default true), zipCounty: Record<zip5, county> }
//
// Realigns ABOR (unlockmls) and SABOR (ramco-sabor) holding contacts to the
// counties each board covers, using the contact's ZIP code:
//   - inside the board's counties            -> stays in holding
//   - inside another market's counties       -> moved to that market's mailing
//                                               segment (stage='mailing')
//   - in no market's counties                -> stays, tagged "Outside Market"
//   - no ZIP / unknown ZIP / outside Texas   -> untouched
// Every change is recorded in mailing_county_realign_backup so it can be undone.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema, getSql } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ABOR = new Set(['Bastrop','Bell','Blanco','Burnet','Caldwell','Comal','Fayette','Gillespie','Gonzales','Guadalupe','Hays','Lampasas','Lee','Llano','Milam','San Saba','Travis','Williamson']);
const SABOR = new Set(['Bexar','Comal','Guadalupe','Kendall','Bandera','Medina','Wilson','Atascosa']);
const HOUSTON = new Set(['Angelina','Austin','Brazoria','Brazos','Burleson','Calhoun','Chambers','Cherokee','Colorado','Fort Bend','Freestone','Galveston','Grimes','Hardin','Harris','Houston','Jackson','Jasper','Jefferson','Leon','Liberty','Limestone','Madison','Matagorda','Montgomery','Nacogdoches','Newton','Orange','Polk','Robertson','Sabine','San Augustine','San Jacinto','Trinity','Tyler','Walker','Waller','Washington','Wharton','Victoria']);
const DFW = new Set(['Collin','Dallas','Denton','Ellis','Erath','Grayson','Hood','Hopkins','Hunt','Johnson','Kaufman','McLennan','Navarro','Palo Pinto','Parker','Rockwall','Stephens','Tarrant','Van Zandt','Wise']);
const FT_WORTH = new Set(['Tarrant', 'Parker', 'Johnson']);

const OUTSIDE_TAG = 'Outside Market';

const schema = z.object({
  dryRun: z.boolean().default(true),
  zipCounty: z.record(z.string(), z.string()),
});

type Action = { id: string; kind: 'move' | 'tag'; segment?: string; fromTag?: string };

function targetSegment(county: string, home: 'abor' | 'sabor'): string | null {
  if (HOUSTON.has(county)) return 'houston-mailing';
  if (DFW.has(county)) return FT_WORTH.has(county) ? 'fortworth-trec' : 'dallas-trec';
  if (home === 'sabor' && ABOR.has(county)) return 'realtyline-atx-print';
  if (home === 'abor' && SABOR.has(county)) return 'newsline-sa-print';
  return null;
}

export const POST = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  await ensureSchema();
  const { dryRun, zipCounty } = schema.parse(await req.json());
  const sql = getSql();

  await sql`
    CREATE TABLE IF NOT EXISTS mailing_county_realign_backup (
      id          SERIAL PRIMARY KEY,
      contact_id  UUID NOT NULL,
      action      TEXT NOT NULL,
      prev_stage  TEXT,
      prev_segment TEXT,
      prev_tags   JSONB,
      new_segment TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;

  const rows = (await sql`
    SELECT id::text AS id, external_source, left(coalesce(zip,''), 5) AS zip,
           upper(coalesce(state,'')) AS state, lower(email) AS email, tags
      FROM mailing_contacts
     WHERE stage = 'holding' AND external_source IN ('unlockmls','ramco-sabor')
  `) as unknown as Array<{ id: string; external_source: string; zip: string; state: string; email: string; tags: unknown }>;

  // Emails already present in the mailing stage - moving a duplicate adds nothing.
  const mailingEmails = new Set(
    ((await sql`SELECT DISTINCT lower(email) AS e FROM mailing_contacts WHERE stage = 'mailing' AND email IS NOT NULL`) as unknown as Array<{ e: string }>).map((r) => r.e),
  );

  const counts: Record<string, number> = {};
  const bump = (k: string) => { counts[k] = (counts[k] ?? 0) + 1; };
  const actions: Action[] = [];

  for (const r of rows) {
    const home = r.external_source === 'unlockmls' ? 'abor' : 'sabor';
    const label = home === 'abor' ? 'ABOR' : 'SABOR';
    if (!/^\d{5}$/.test(r.zip)) { bump(`${label}: untouched (no ZIP)`); continue; }
    if (r.state && r.state !== 'TX') { bump(`${label}: untouched (outside Texas)`); continue; }
    const county = zipCounty[r.zip];
    if (!county) { bump(`${label}: untouched (unknown ZIP)`); continue; }
    const homeSet = home === 'abor' ? ABOR : SABOR;
    if (homeSet.has(county)) { bump(`${label}: stays`); continue; }
    const seg = targetSegment(county, home);
    if (seg) {
      if (mailingEmails.has(r.email)) { bump(`${label}: stays (email already in a mailing list)`); continue; }
      actions.push({ id: r.id, kind: 'move', segment: seg });
      bump(`${label}: move to ${seg}`);
    } else {
      const has = Array.isArray(r.tags) && (r.tags as unknown[]).includes(OUTSIDE_TAG);
      if (has) { bump(`${label}: already tagged`); continue; }
      actions.push({ id: r.id, kind: 'tag' });
      bump(`${label}: tag ${OUTSIDE_TAG}`);
    }
  }

  if (dryRun) return NextResponse.json({ ok: true, dryRun: true, counts });

  const CHUNK = 2000;
  for (let i = 0; i < actions.length; i += CHUNK) {
    const part = actions.slice(i, i + CHUNK);
    const ids = part.map((a) => a.id);
    const kinds = part.map((a) => a.kind);
    const segs = part.map((a) => a.segment ?? '');
    await sql`
      INSERT INTO mailing_county_realign_backup (contact_id, action, prev_stage, prev_segment, prev_tags, new_segment)
      SELECT mc.id, t.kind, mc.stage, mc.segment, mc.tags, NULLIF(t.seg, '')
        FROM unnest(${ids}::uuid[], ${kinds}::text[], ${segs}::text[]) AS t(id, kind, seg)
        JOIN mailing_contacts mc ON mc.id = t.id`;
    await sql`
      UPDATE mailing_contacts mc
         SET stage = CASE WHEN t.kind = 'move' THEN 'mailing' ELSE mc.stage END,
             segment = CASE WHEN t.kind = 'move' THEN t.seg ELSE mc.segment END,
             tags = CASE
                      WHEN t.kind = 'tag' AND NOT jsonb_exists(mc.tags, ${OUTSIDE_TAG}) THEN mc.tags || to_jsonb(${OUTSIDE_TAG}::text)
                      ELSE mc.tags END,
             updated_at = NOW()
        FROM unnest(${ids}::uuid[], ${kinds}::text[], ${segs}::text[]) AS t(id, kind, seg)
       WHERE mc.id = t.id AND mc.stage = 'holding'`;
  }
  return NextResponse.json({ ok: true, dryRun: false, applied: actions.length, counts });
});
