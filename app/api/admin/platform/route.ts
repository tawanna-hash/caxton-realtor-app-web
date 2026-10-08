/** Back office for Closing Time: settings, feature switches, release queue. Admin only. */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import {
  activeDealUsers, cancelRelease, createFlag, disableFlag, getSetting, listFlags, listReleases, listSettings, platformLog,
  publishRelease, saveRelease, saveSetting, sendReleaseNotice, settingHistory, NOTICE_LEAD_DAYS,
} from '@/lib/server/platform-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAdminTracking(async () => {
  await requireAdmin();
  const [settings, flags, releases, log, history, users, smsOn] = await Promise.all([
    listSettings(), listFlags(), listReleases(), platformLog(), settingHistory(), activeDealUsers(), getSetting<boolean>('notice.sms_enabled', false),
  ]);
  return NextResponse.json({ settings, flags, releases, log, history, noticeLeadDays: NOTICE_LEAD_DAYS, smsOn, audience: { total: users.length, withPhone: users.filter((u) => u.phone).length } });
});

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('saveSetting'), key: z.string().trim().min(1).max(120), valueJson: z.string().max(20000), description: z.string().max(400).default('') }),
  z.object({ action: z.literal('createFlag'), key: z.string().trim().regex(/^[a-z0-9._-]{2,80}$/), label: z.string().trim().min(1).max(120), description: z.string().max(400).default('') }),
  z.object({ action: z.literal('disableFlag'), key: z.string().min(1) }),
  z.object({ action: z.literal('saveRelease'), id: z.string().optional(), title: z.string().trim().min(1).max(160), summary: z.string().max(300).default(''), flagKeys: z.array(z.string()).default([]), noticeSubject: z.string().max(200).default(''), noticeBody: z.string().max(4000).default(''), goLiveAt: z.string().nullable().default(null) }),
  z.object({ action: z.literal('sendNotice'), id: z.string(), confirm: z.literal(true) }),
  z.object({ action: z.literal('publish'), id: z.string() }),
  z.object({ action: z.literal('cancel'), id: z.string() }),
]);

export const POST = withAdminTracking(async (req: Request) => {
  const admin = await requireAdmin();
  const actor = admin.email ?? 'admin';
  const input = body.parse(await req.json());
  try {
    switch (input.action) {
      case 'saveSetting': {
        let value: unknown; try { value = JSON.parse(input.valueJson); } catch { return NextResponse.json({ error: 'The value must be valid JSON, for example true, 5, or "text".' }, { status: 400 }); }
        await saveSetting(input.key, value, input.description, actor); break;
      }
      case 'createFlag': await createFlag(input.key, input.label, input.description, actor); break;
      case 'disableFlag': await disableFlag(input.key, actor); break;
      case 'saveRelease': return NextResponse.json({ ok: true, id: await saveRelease(input, actor) });
      case 'sendNotice': return NextResponse.json({ ok: true, result: await sendReleaseNotice(input.id, actor, await getSetting<boolean>('notice.sms_enabled', false)) });
      case 'publish': await publishRelease(input.id, actor); break;
      case 'cancel': await cancelRelease(input.id, actor); break;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Something went wrong.' }, { status: 400 });
  }
});
