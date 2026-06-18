// app/portal/files/page.tsx
//
// Lists files shared with the current advertiser. Visibility = 'visible' only.

import { redirect } from 'next/navigation';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import type { PortalFile } from '@/lib/portal';

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
      <header>
        <div className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Portal</div>
        <h1 className="font-serif text-3xl text-gray-900">Files</h1>
        <p className="text-gray-600 mt-1">Documents and assets we&apos;ve shared with you.</p>
      </header>

      {files.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
          No files yet. Your account manager will upload here.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Added</th>
                <th className="px-4 py-3 font-medium text-right">Open</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id} className="border-t border-gray-100">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{f.title}</div>
                    {f.description && <div className="text-xs text-gray-500">{f.description}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{f.category}</td>
                  <td className="px-4 py-3 text-gray-600">{new Date(f.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={f.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-700 hover:underline"
                    >
                      Download
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
