// app/api/admin/advertisers/[id]/route.ts
//
//   GET    — single advertiser
//   PATCH  — update name / contact_email / requires_email_gate / publication
//   DELETE — remove (hotspots' advertiser_id will be set NULL via FK)

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { slugify, CRM_PATCHABLE_FIELDS, type Advertiser } from '@/lib/advertisers';
import { coerceFooterTemplateId } from '@/lib/footer-templates';
import { coerceHeaderStyle } from '@/lib/advertiser-header-styles';
import {
  ensurePublicationColumn, type Publication,
} from '@/lib/publication-theme';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { upsertAdvertiserMailingByAdvertiserId } from '@/lib/mailing';
import { syncAdvertiserToAgreement } from '@/lib/server/billing-crm-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function isAdmin(): Promise<boolean> {
  try {
    const admin = await getCurrentAdmin();
    return admin !== null;
  } catch {
    return false;
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

function normalizePublication(value: unknown): Publication | null {
  if (value === 'austin' || value === 'san_antonio' || value === 'both') return value;
  return null;
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  try {
    await ensureSchema();
    await ensurePublicationColumn();
    const sql = getSql();
    const rows = (await sql`
      SELECT * FROM advertisers WHERE id = ${idNum}
    `) as unknown as Advertiser[];
    if (rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.json({ advertiser: rows[0] });
  } catch (err) {
    console.error('[admin/advertisers GET id]', errMessage(err));
    return NextResponse.json({ error: 'get failed', detail: errMessage(err) }, { status: 500 });
  }
}

const STATUS_VALUES = new Set(['active', 'prospect', 'paused', 'archived']);
const TYPE_VALUES   = new Set(['advertiser', 'client', 'prospect', 'mailing']);
const EMAIL_STATUS  = new Set(['valid', 'invalid', 'risk', 'unknown']);

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  try {
    await ensureSchema();
    await ensurePublicationColumn();
    const sql = getSql();

    const updates: string[] = [];
    const setClauses: { col: string; val: unknown }[] = [];

    // Legacy fields
    if (typeof body.name === 'string' && body.name.trim()) {
      const name = body.name.trim();
      const baseSlug = slugify(name) || `advertiser-${idNum}`;
      setClauses.push({ col: 'name', val: name });
      setClauses.push({ col: 'slug', val: baseSlug });
    }
    if ('contact_email' in body) {
      const v = body.contact_email;
      setClauses.push({ col: 'contact_email', val: typeof v === 'string' && v.trim() ? v.trim() : null });
    }
    if ('requires_email_gate' in body) {
      setClauses.push({ col: 'requires_email_gate', val: !!body.requires_email_gate });
    }
    if ('publication' in body) {
      const pub = normalizePublication(body.publication);
      if (pub) setClauses.push({ col: 'publication', val: pub });
    }

    // CRM fields (allow-listed + validated)
    for (const field of CRM_PATCHABLE_FIELDS) {
      if (!(field in body)) continue;
      const raw = body[field as keyof typeof body];

      if (field === 'type'         && typeof raw === 'string' && !TYPE_VALUES.has(raw)) continue;
      if (field === 'status'       && typeof raw === 'string' && !STATUS_VALUES.has(raw)) continue;
      if (field === 'email_status' && raw !== null && typeof raw === 'string' && !EMAIL_STATUS.has(raw)) continue;

      if (field === 'additional_contacts' || field === 'tags') {
        if (raw === null || Array.isArray(raw)) {
          setClauses.push({ col: field, val: JSON.stringify(raw ?? []) });
        }
        continue;
      }

      if (field === 'email_verified_at' || field === 'portal_activated_at' || field === 'portal_onboarded_at') {
        if (raw === null || typeof raw === 'string') {
          setClauses.push({ col: field, val: raw || null });
        }
        continue;
      }

      if (raw === null || typeof raw === 'string') {
        const v = typeof raw === 'string' ? raw.trim() : null;
        setClauses.push({ col: field, val: v === '' ? null : v });
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: 'no patchable fields provided' }, { status: 400 });
    }

    for (const { col, val } of setClauses) {
      switch (col) {
        case 'name':                await sql`UPDATE advertisers SET name = ${val}                       WHERE id = ${idNum}`; break;
        case 'slug':                await sql`UPDATE advertisers SET slug = ${val}                       WHERE id = ${idNum}`; break;
        case 'contact_email':       await sql`UPDATE advertisers SET contact_email = ${val}              WHERE id = ${idNum}`; break;
        case 'requires_email_gate': await sql`UPDATE advertisers SET requires_email_gate = ${val}        WHERE id = ${idNum}`; break;
        case 'publication':         await sql`UPDATE advertisers SET publication = ${val}                WHERE id = ${idNum}`; break;
        case 'type':                await sql`UPDATE advertisers SET type = ${val}                       WHERE id = ${idNum}`; break;
        case 'status':              await sql`UPDATE advertisers SET status = ${val}                     WHERE id = ${idNum}`; break;
        case 'first_name':          await sql`UPDATE advertisers SET first_name = ${val}                 WHERE id = ${idNum}`; break;
        case 'last_name':           await sql`UPDATE advertisers SET last_name = ${val}                  WHERE id = ${idNum}`; break;
        case 'company':             await sql`UPDATE advertisers SET company = ${val}                    WHERE id = ${idNum}`; break;
        case 'title':               await sql`UPDATE advertisers SET title = ${val}                      WHERE id = ${idNum}`; break;
        case 'industry':            await sql`UPDATE advertisers SET industry = ${val}                   WHERE id = ${idNum}`; break;
        case 'license_number':      await sql`UPDATE advertisers SET license_number = ${val}             WHERE id = ${idNum}`; break;
        case 'avatar_url':          await sql`UPDATE advertisers SET avatar_url = ${val}                 WHERE id = ${idNum}`; break;
        case 'portal_email':        await sql`UPDATE advertisers SET portal_email = ${val}               WHERE id = ${idNum}`; break;
        case 'phone':               await sql`UPDATE advertisers SET phone = ${val}                      WHERE id = ${idNum}`; break;
        case 'office_phone':        await sql`UPDATE advertisers SET office_phone = ${val}               WHERE id = ${idNum}`; break;
        case 'website':             await sql`UPDATE advertisers SET website = ${val}                    WHERE id = ${idNum}`; break;
        case 'email_status':        await sql`UPDATE advertisers SET email_status = ${val}               WHERE id = ${idNum}`; break;
        case 'email_verified_at':   await sql`UPDATE advertisers SET email_verified_at = ${val}          WHERE id = ${idNum}`; break;
        case 'address':             await sql`UPDATE advertisers SET address = ${val}                    WHERE id = ${idNum}`; break;
        case 'address_2':           await sql`UPDATE advertisers SET address_2 = ${val}                  WHERE id = ${idNum}`; break;
        case 'city':                await sql`UPDATE advertisers SET city = ${val}                       WHERE id = ${idNum}`; break;
        case 'state':               await sql`UPDATE advertisers SET state = ${val}                      WHERE id = ${idNum}`; break;
        case 'zip':                 await sql`UPDATE advertisers SET zip = ${val}                        WHERE id = ${idNum}`; break;
        case 'portal_activated_at': await sql`UPDATE advertisers SET portal_activated_at = ${val}        WHERE id = ${idNum}`; break;
        case 'portal_onboarded_at': await sql`UPDATE advertisers SET portal_onboarded_at = ${val}        WHERE id = ${idNum}`; break;
        case 'additional_contacts': await sql`UPDATE advertisers SET additional_contacts = ${val}::jsonb WHERE id = ${idNum}`; break;
        case 'notes':               await sql`UPDATE advertisers SET notes = ${val}                      WHERE id = ${idNum}`; break;
        case 'tags':                await sql`UPDATE advertisers SET tags = ${val}::jsonb                WHERE id = ${idNum}`; break;
        // Public profile fields. These columns were added but missing here,
        // so edits saved through the admin modal silently dropped on the
        // floor. (Found 2026-06-12.)
        case 'tagline':             await sql`UPDATE advertisers SET tagline = ${val}                    WHERE id = ${idNum}`; break;
        case 'header_style': {
          // Unknown/invalid values collapse to 'current' so the column
          // can never hold a value the public renderer doesn't know about.
          const style = coerceHeaderStyle(val);
          await sql`UPDATE advertisers SET header_style = ${style} WHERE id = ${idNum}`;
          break;
        }
        case 'footer_template': {
          // Coerce unknown/legacy IDs back to the default so the column
          // never holds a value the picker doesn't recognise.
          const tpl = coerceFooterTemplateId(val);
          await sql`UPDATE advertisers SET footer_template = ${tpl} WHERE id = ${idNum}`;
          break;
        }
        case 'bio':                 await sql`UPDATE advertisers SET bio = ${val}                        WHERE id = ${idNum}`; break;
        case 'facebook_url':        await sql`UPDATE advertisers SET facebook_url = ${val}               WHERE id = ${idNum}`; break;
        case 'instagram_url':       await sql`UPDATE advertisers SET instagram_url = ${val}              WHERE id = ${idNum}`; break;
        case 'linkedin_url':        await sql`UPDATE advertisers SET linkedin_url = ${val}               WHERE id = ${idNum}`; break;
        case 'twitter_url':         await sql`UPDATE advertisers SET twitter_url = ${val}                WHERE id = ${idNum}`; break;
        case 'youtube_url':         await sql`UPDATE advertisers SET youtube_url = ${val}                WHERE id = ${idNum}`; break;
      }
      updates.push(col);
    }

    await sql`UPDATE advertisers SET updated_at = NOW() WHERE id = ${idNum}`;

    const rows = (await sql`SELECT * FROM advertisers WHERE id = ${idNum}`) as unknown as Advertiser[];
    if (rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    // Flow advertiser edits into the Advertisers mailing segment so the
    // mailing list stays in sync without waiting for the next cron run.
    // Best-effort — don't fail the advertiser update if this hiccups.
    try {
      await upsertAdvertiserMailingByAdvertiserId(idNum);
    } catch (err) {
      console.warn('[admin/advertisers PATCH] mailing upsert failed:', err);
    }

    // Mirror identity edits back onto the current agreement so the
    // Billing tab reflects CRM edits. Only fires when an identity column
    // changed (name/company/address/etc.), to avoid stomping billing
    // facts that should flow advertiser <- agreement, not the other way.
    const IDENTITY_COLS = new Set([
      'name', 'company', 'first_name', 'last_name',
      'contact_email', 'phone',
      'address', 'city', 'state', 'zip',
    ]);
    if (updates.some((c) => IDENTITY_COLS.has(c))) {
      try {
        await syncAdvertiserToAgreement(idNum);
      } catch (err) {
        console.warn('[admin/advertisers PATCH] syncAdvertiserToAgreement failed:', err);
      }
    }

    return NextResponse.json({ advertiser: rows[0], updated_fields: updates });
  } catch (err) {
    console.error('[admin/advertisers PATCH]', errMessage(err));
    return NextResponse.json({ error: 'update failed', detail: errMessage(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  try {
    await ensureSchema();
    const sql = getSql();
    const result = (await sql`
      DELETE FROM advertisers WHERE id = ${idNum} RETURNING id
    `) as unknown as Array<{ id: number }>;
    if (result.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/advertisers DELETE]', errMessage(err));
    return NextResponse.json({ error: 'delete failed', detail: errMessage(err) }, { status: 500 });
  }
}
