import { NextResponse } from 'next/server';
import { MAX_UPLOAD_BYTES, savePortalUpload } from '@/lib/server/closing-time-assist';
import { fileClientUpload } from '@/lib/server/closing-time-connected';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Public client upload. Authorized only by the unguessable portal token; attaches to an already-requested document. */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: 'Invalid upload' }, { status: 400 }); }
  const file = form.get('file');
  const docId = String(form.get('docId') ?? '');
  if (!(file instanceof File) || !docId) return NextResponse.json({ error: 'Choose a file' }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: 'File must be under 4 MB.' }, { status: 400 });
  const result = await savePortalUpload(token, docId, { name: file.name, type: file.type, bytes: Buffer.from(await file.arrayBuffer()) });
  if (result.ok && result.id && result.realtorId && result.dealId) {
    await fileClientUpload(result.realtorId, result.dealId, result.id, { uploader: result.uploader ?? '', label: result.label ?? 'Document', filename: file.name }).catch(() => undefined);
  }
  return NextResponse.json(result.ok ? { ok: true } : { error: result.error }, { status: result.ok ? 200 : 400 });
}
