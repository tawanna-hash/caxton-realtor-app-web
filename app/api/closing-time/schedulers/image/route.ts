import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import { setImage } from '@/lib/server/closing-time-schedulers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Banner or avatar for a scheduler: PNG or JPG up to 4 MB. An empty upload removes it. */
export const POST = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  const form = await req.formData();
  const id = String(form.get('id') ?? '');
  const kind = form.get('kind') === 'avatar' ? 'avatar' : 'banner';
  const file = form.get('file');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Save the scheduler first.' }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) { await setImage(user.realtorId, id, kind, null); return NextResponse.json({ ok: true }); }
  if (!/^image\/(png|jpeg)$/.test(file.type)) return NextResponse.json({ error: 'Use a PNG or JPG.' }, { status: 400 });
  if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: 'Images must be under 4 MB.' }, { status: 400 });
  await setImage(user.realtorId, id, kind, { type: file.type, bytes: Buffer.from(await file.arrayBuffer()) });
  return NextResponse.json({ ok: true });
});
