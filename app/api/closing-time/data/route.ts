import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/server/auth/user';
import { ApiError, withErrorHandling } from '@/lib/server/error';
import { getAgentCommandCenterWorkspace } from '@/lib/server/agent-command-center-workspaces';
import {
  buildDealsFromCsv, contactsToCsv, createBackup, dealsToCsv, getBackupWorkspace, importDeals, listBackups,
} from '@/lib/server/closing-time-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const file = (body: string, name: string, type: string) =>
  new NextResponse(body, { headers: { ...NO_STORE, 'Content-Type': `${type};charset=utf-8`, 'Content-Disposition': `attachment; filename="${name}"` } });

export const GET = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  const url = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'backups';
  const stamp = new Date().toISOString().slice(0, 10);

  if (action === 'backups') return json({ backups: await listBackups(user.realtorId) });

  if (action === 'download-backup') {
    const id = z.string().uuid().parse(url.searchParams.get('id'));
    const backup = await getBackupWorkspace(user.realtorId, id);
    if (!backup) throw new ApiError(404, 'Backup not found');
    return file(
      JSON.stringify({ recordType: 'Closing Time backup', createdAt: backup.createdAt, workspace: backup.workspace }, null, 2),
      `closing-time-backup-${backup.createdAt.slice(0, 10)}.json`,
      'application/json',
    );
  }

  if (action === 'export') {
    const stored = await getAgentCommandCenterWorkspace(user.realtorId);
    const workspace = stored?.workspace ?? { deals: [] };
    const format = url.searchParams.get('format') ?? 'json';
    if (format === 'deals-csv') return file(dealsToCsv(workspace.deals), `closing-time-deals-${stamp}.csv`, 'text/csv');
    if (format === 'contacts-csv') return file(contactsToCsv(workspace.deals), `closing-time-contacts-${stamp}.csv`, 'text/csv');
    return file(
      JSON.stringify({ recordType: 'Closing Time full export', exportedAt: new Date().toISOString(), workspace }, null, 2),
      `closing-time-export-${stamp}.json`,
      'application/json',
    );
  }
  throw new ApiError(400, 'Unknown action');
});

const postSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('backup') }),
  z.object({ action: z.literal('import-preview'), csv: z.string().min(1).max(2_000_000) }),
  z.object({ action: z.literal('import'), csv: z.string().min(1).max(2_000_000) }),
]);

export const POST = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  const input = postSchema.parse(await req.json());
  if (input.action === 'backup') {
    const backup = await createBackup(user.realtorId, 'manual');
    if (!backup) throw new ApiError(400, 'Nothing to back up yet');
    return json({ backup });
  }
  let built;
  try { built = buildDealsFromCsv(input.csv); } catch (e) { throw new ApiError(400, e instanceof Error ? e.message : 'Could not read the file'); }
  if (input.action === 'import-preview') return json({ preview: built.preview });
  try {
    const result = await importDeals(user.realtorId, built.deals);
    return json({ ...result, preview: built.preview });
  } catch (e) { throw new ApiError(400, e instanceof Error ? e.message : 'Import failed'); }
});
