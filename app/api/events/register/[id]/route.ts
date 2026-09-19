import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema, getSql } from '@/lib/db';
import { notifyEventRegistration } from '@/lib/server/event-registration-notify';
import { captureServerEvent } from '@/lib/server/posthog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const inputSchema = z.object({
  fullName: z.string().trim().min(2).max(150),
  company: z.string().trim().min(2).max(200),
  isRealtor: z.boolean().default(false),
  licenseNumber: z.string().trim().max(80).optional().nullable(),
  email: z.string().trim().email().max(320),
  mobile: z.string().trim().min(7).max(40),
  consent: z.literal(true),
  hp: z.string().optional(),
});

const recentSubmissions = new Map<string, number[]>();

function requesterKey(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const hits = (recentSubmissions.get(key) ?? []).filter((time) => now - time < 60_000);
  hits.push(now);
  recentSubmissions.set(key, hits);
  return hits.length > 5;
}

export async function POST(req: Request, ctx: Ctx) {
  if (isRateLimited(requesterKey(req))) {
    return NextResponse.json(
      { ok: false, error: 'Too many attempts. Please wait a minute and try again.' },
      { status: 429 },
    );
  }

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: 'Invalid event.' }, { status: 400 });
  }

  const parsed = inputSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message || 'Please check the form.' },
      { status: 400 },
    );
  }
  const input = parsed.data;
  if (input.hp?.trim()) return NextResponse.json({ ok: true });

  await ensureSchema();
  const sql = getSql();
  const events = (await sql`
    SELECT id, title, start_date, website
      FROM events
     WHERE id = ${id}
       AND hidden = false
       AND NULLIF(TRIM(COALESCE(link, '')), '') IS NULL
     LIMIT 1
  `) as unknown as Array<{
    id: number;
    title: string;
    start_date: string | null;
    website: string | null;
  }>;
  const event = events[0];
  if (!event) {
    return NextResponse.json(
      { ok: false, error: 'This event uses the organizer’s registration page.' },
      { status: 409 },
    );
  }

  const email = input.email.toLowerCase();
  const ip = requesterKey(req);
  const inserted = (await sql`
    INSERT INTO event_registrations
      (event_id, full_name, company, is_realtor, license_number, email, mobile,
       consented_at, ip, user_agent)
    VALUES
      (${event.id}, ${input.fullName}, ${input.company}, ${input.isRealtor},
       ${input.licenseNumber || null}, ${email}, ${input.mobile}, NOW(), ${ip},
       ${req.headers.get('user-agent')})
    ON CONFLICT (event_id, email) DO NOTHING
    RETURNING id
  `) as unknown as Array<{ id: number }>;

  if (inserted.length === 0) {
    await sql`
      UPDATE event_registrations
         SET full_name = ${input.fullName},
             company = ${input.company},
             is_realtor = ${input.isRealtor},
             license_number = ${input.licenseNumber || null},
             mobile = ${input.mobile},
             consented_at = NOW(),
             ip = ${ip},
             user_agent = ${req.headers.get('user-agent')}
       WHERE event_id = ${event.id} AND email = ${email}
    `;
    return NextResponse.json({
      ok: true,
      duplicate: true,
      redirectUrl: event.website || null,
    });
  }

  const registrationId = inserted[0].id;
  const notice = await notifyEventRegistration({
    registrationId,
    eventId: event.id,
    eventTitle: event.title,
    eventStart: event.start_date,
    fullName: input.fullName,
    company: input.company,
    isRealtor: input.isRealtor,
    licenseNumber: input.licenseNumber || null,
    email,
    mobile: input.mobile,
  });
  if (notice.ok) {
    await sql`
      UPDATE event_registrations
         SET notification_sent_at = NOW()
       WHERE id = ${registrationId}
    `;
  } else {
    console.error('[event-registration] notification failed', notice.error);
  }

  captureServerEvent('event_registration_completed', email, {
    event_id: event.id,
    event_title: event.title,
    is_realtor: input.isRealtor,
    source: 'first_party_event_registry',
  });

  return NextResponse.json(
    { ok: true, registrationId, redirectUrl: event.website || null },
    { status: 201 },
  );
}
