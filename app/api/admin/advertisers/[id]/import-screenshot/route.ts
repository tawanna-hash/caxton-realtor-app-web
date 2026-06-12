// app/api/admin/advertisers/[id]/import-screenshot/route.ts
//
//   POST  — multipart/form-data with field `image` containing a PNG or JPEG.
//           Calls Gemini Vision to extract { locations, staff } from the
//           screenshot and bulk-inserts them into advertiser_locations +
//           advertiser_staff (+ advertiser_staff_locations join rows).
//
// Returns { inserted: { locations, staff }, extracted: { locations, staff } }
// so the client can show a summary toast and reload the editor.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { extractFromScreenshot } from '@/lib/server/gemini-screenshot-extract';
import { formatPhone } from '@/lib/format-phone';
import { upsertStaffMailingByStaffId } from '@/lib/mailing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Vision extraction can be slow on cold start; allow up to 60s.
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB cap on uploaded screenshot
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  // Parse multipart form
  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    return NextResponse.json({ error: 'invalid form', detail: errMessage(err) }, { status: 400 });
  }

  const file = form.get('image');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'image file required (field "image")' }, { status: 400 });
  }

  const mimeType = (file.type || '').toLowerCase();
  if (!ALLOWED_MIME.has(mimeType)) {
    return NextResponse.json(
      { error: `unsupported image type: ${mimeType || '(unknown)'}` },
      { status: 415 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `image too large: ${file.size} bytes (max ${MAX_BYTES})` },
      { status: 413 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const imageBase64 = buf.toString('base64');

  const result = await extractFromScreenshot({ imageBase64, mimeType });
  if (!result.ok) {
    const status = result.reason === 'no-key' ? 503 : result.reason === 'rate-limit' ? 429 : 502;
    return NextResponse.json(
      { error: `extraction failed: ${result.reason}`, detail: result.detail },
      { status },
    );
  }

  const { locations: extLocs, staff: extStaff } = result.data;

  try {
    await ensureSchema();
    const sql = getSql();

    // ── Insert locations, capture new ids in order ────────────────────
    const insertedLocationIds: string[] = [];
    // Only honor `is_primary: true` on at most one row. If the advertiser
    // already has a primary location, we leave it alone (don't steal the
    // flag from an existing record).
    const existingPrimary = (await sql`
      SELECT id FROM advertiser_locations
      WHERE advertiser_id = ${idNum} AND is_primary = true
      LIMIT 1
    `) as unknown as Array<{ id: string }>;

    let primaryAssigned = existingPrimary.length > 0;

    for (let i = 0; i < extLocs.length; i++) {
      const loc = extLocs[i];
      const shouldBePrimary = !primaryAssigned && loc.is_primary;
      if (shouldBePrimary) primaryAssigned = true;

      const rows = (await sql`
        INSERT INTO advertiser_locations (
          advertiser_id, label, address, address_2, city, state, zip,
          phone, email, hours, is_primary, sort_order
        ) VALUES (
          ${idNum},
          ${loc.label},
          ${loc.address},
          ${loc.address_2},
          ${loc.city},
          ${loc.state},
          ${loc.zip},
          ${loc.phone ? (formatPhone(loc.phone) || loc.phone) : null},
          ${loc.email ? loc.email.toLowerCase() : null},
          ${loc.hours},
          ${shouldBePrimary},
          ${i}
        )
        RETURNING id
      `) as unknown as Array<{ id: string }>;
      insertedLocationIds.push(rows[0].id);
    }

    // If we just inserted a primary and there was no existing primary,
    // we already set is_primary=true on that one row. No global update
    // needed because we guarded with `primaryAssigned`.

    // ── Insert staff + bind to locations ──────────────────────────────
    let staffInserted = 0;
    for (let i = 0; i < extStaff.length; i++) {
      const s = extStaff[i];
      if (!s.name) continue;

      const rows = (await sql`
        INSERT INTO advertiser_staff (
          advertiser_id, name, title, email, phone, photo_url, sort_order
        ) VALUES (
          ${idNum},
          ${s.name},
          ${s.title},
          ${s.email ? s.email.toLowerCase() : null},
          ${s.phone ? (formatPhone(s.phone) || s.phone) : null},
          ${s.photo_url},
          ${i}
        )
        RETURNING id
      `) as unknown as Array<{ id: string }>;

      const staffId = rows[0].id;
      staffInserted++;

      // location_index is 1-based per the prompt
      if (
        s.location_index !== null &&
        s.location_index >= 1 &&
        s.location_index <= insertedLocationIds.length
      ) {
        const locId = insertedLocationIds[s.location_index - 1];
        await sql`
          INSERT INTO advertiser_staff_locations (staff_id, location_id)
          VALUES (${staffId}::uuid, ${locId}::uuid)
          ON CONFLICT DO NOTHING
        `;
      }

      // Best-effort mailing sync, same as the staff POST route.
      try {
        await upsertStaffMailingByStaffId(staffId);
      } catch (err) {
        console.warn('[import-screenshot] mailing upsert failed:', errMessage(err));
      }
    }

    return NextResponse.json({
      ok: true,
      inserted: {
        locations: insertedLocationIds.length,
        staff: staffInserted,
      },
      extracted: result.data,
    });
  } catch (err) {
    console.error('[import-screenshot]', errMessage(err));
    return NextResponse.json(
      { error: 'insert failed', detail: errMessage(err) },
      { status: 500 },
    );
  }
}
