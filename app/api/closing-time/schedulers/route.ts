import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import { requireDeal } from '@/lib/server/closing-time-assist';
import { agentOf, calendarsFor, cancelByAgent, deleteCombo, deleteScheduler, listSchedulers, saveCombo, saveScheduler, setActive, setSlug } from '@/lib/server/closing-time-schedulers';
import { aliasify } from '@/lib/scheduler-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const day = z.object({ on: z.boolean(), start: hhmm, end: hhmm }).refine((d) => !d.on || d.start < d.end, 'End time must be after start time.');
const offset = { amount: z.number().int().min(0).max(1000), unit: z.enum(['minutes', 'hours', 'days']), subject: z.string().max(200).default(''), message: z.string().max(4000).default('') };
const config = z.object({
  bookingCalendar: z.string().min(1, 'Select a booking calendar.').max(400), bookingCalendarName: z.string().max(200).default(''),
  additionalCalendars: z.array(z.object({ id: z.string().max(400), name: z.string().max(200) })).max(6).default([]),
  name: z.string().trim().min(1, 'Name your scheduler.').max(120), yourName: z.string().trim().max(120).default(''),
  urlMode: z.enum(['alias', 'root']), alias: z.string().max(60).transform(aliasify),
  lengths: z.array(z.number().int().min(5).max(480)).min(1).max(8), defaultLength: z.number().int().min(5).max(480),
  hours: z.object({ mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day }),
  timezone: z.string().min(1).max(60), windowDays: z.number().int().min(1).max(365), noticeMin: z.number().int().min(0).max(20160),
  bufferBeforeMin: z.number().int().min(0).max(240), bufferAfterMin: z.number().int().min(0).max(240), incrementMin: z.number().int().min(0).max(240),
  subject: z.string().max(300).default(''), description: z.string().max(4000).default(''), color: z.string().max(4).default(''),
  meeting: z.enum(['none', 'google_meet', 'teams', 'custom']), meetingLink: z.string().max(500).default(''), attendees: z.string().max(4000).default(''),
  questions: z.array(z.object({ id: z.string().min(1).max(40), label: z.string().trim().min(1).max(200), type: z.enum(['text', 'textarea', 'phone']), required: z.boolean() })).max(10).default([]),
  welcome: z.string().max(1000).default(''), redirectUrl: z.string().max(500).default(''), language: z.enum(['en', 'es']), bookerLocale: z.enum(['auto', 'en', 'es']),
  timeFormat: z.enum(['12h', '24h']), weekStart: z.enum(['sunday', 'monday']), hasBanner: z.boolean().default(false), hasAvatar: z.boolean().default(false),
  reminders: z.array(z.object(offset)).max(2).default([]), followUp: z.object(offset).nullable().default(null),
}).refine((c) => c.lengths.includes(c.defaultLength), { message: 'The default time must be one of the meeting lengths.', path: ['defaultLength'] })
  .refine((c) => !c.redirectUrl || /^https:\/\//.test(c.redirectUrl), { message: 'The redirect URL must start with https://', path: ['redirectUrl'] })
  .refine((c) => c.meeting !== 'custom' || /^https:\/\//.test(c.meetingLink), { message: 'Add a meeting link that starts with https://', path: ['meetingLink'] });

const dealId = z.string().min(1).max(120);
const action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), dealId, id: z.string().uuid().nullable(), config }),
  z.object({ action: z.literal('slug'), dealId, slug: z.string().max(80) }),
  z.object({ action: z.literal('active'), id: z.string().uuid(), active: z.boolean() }),
  z.object({ action: z.literal('delete'), id: z.string().uuid() }),
  z.object({ action: z.literal('combo'), dealId, id: z.string().uuid().optional(), title: z.string().trim().min(1).max(120), alias: z.string().max(60).transform(aliasify), schedulerIds: z.array(z.string().uuid()).min(2).max(10) }),
  z.object({ action: z.literal('delete_combo'), id: z.string().uuid() }),
  z.object({ action: z.literal('cancel_booking'), id: z.string().uuid() }),
]);

const priv = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });

export const GET = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  const id = dealId.parse(new URL(req.url).searchParams.get('dealId'));
  await requireDeal(user.realtorId, id);
  const [data, cals, agent] = await Promise.all([listSchedulers(user.realtorId, id), calendarsFor(user.realtorId).catch(() => ({ account: null, calendars: [] })), agentOf(user.realtorId)]);
  return priv({ ...data, ...cals, accountEmail: user.email, agentName: agent.name === 'Your agent' ? '' : agent.name });
});

export const POST = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  const parsed = action.safeParse(await req.json());
  if (!parsed.success) return priv({ error: parsed.error.issues[0]?.message ?? 'Check the highlighted fields.' }, 400);
  const input = parsed.data;
  switch (input.action) {
    case 'save': return priv({ ok: true, id: await saveScheduler(user.realtorId, input.dealId, input.id, input.config) });
    case 'slug': return priv({ ok: true, slug: await setSlug(user.realtorId, input.dealId, input.slug) });
    case 'active': await setActive(user.realtorId, input.id, input.active); return priv({ ok: true });
    case 'delete': await deleteScheduler(user.realtorId, input.id); return priv({ ok: true });
    case 'combo': await saveCombo(user.realtorId, input.dealId, input); return priv({ ok: true });
    case 'delete_combo': await deleteCombo(user.realtorId, input.id); return priv({ ok: true });
    case 'cancel_booking': await cancelByAgent(user.realtorId, input.id); return priv({ ok: true });
  }
});
