// app/portal/files/page.tsx
//
// Lists files shared with the current advertiser. Visibility = 'visible' only.

import { redirect } from 'next/navigation';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import type { PortalFile } from '@/lib/portal';

import { PageIntro, IconSquare } from '@/components/portal/Mint';
import { FileText } from 'lucide-react';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function PortalFilesPage() {
  const user = await getCurrentPortalUser();
  if (!user) redirect('/portal/error?code=auth');

  await ensureSchema();
  const sql = getSql();
  const files = (await sql`
    SELECT * FROM portal_files
    WHERE advertiser_id = ${user.advertiser_id}
      AND visibility = 'visible'
    ORDER BY created_at DESC
  `) as unknown as PortalFile[];

  return (
    <div className="space-y-6">
      <PageIntro title="Files">Documents and assets we&apos;ve shared with you.</PageIntro>

      {files.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
          No files yet. Your account manager will upload here.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {files.map((f) => (
            <a
              key={f.id}
              href={f.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-[#301D5D]/40 hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <IconSquare tone="purple"><FileText className="h-4 w-4" /></IconSquare>
                <h2 className="min-w-0 flex-1 !text-base !font-normal !text-gray-800 break-words">{f.title}</h2>
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 capitalize">{f.category}</span>
              </div>
              {f.description && <p className="mt-1 text-sm text-gray-600 line-clamp-2">{f.description}</p>}
              <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
                <span>Added {new Date(f.created_at).toLocaleDateString()}</span>
                <span className="text-sm font-medium text-[#301D5D]">Download</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
