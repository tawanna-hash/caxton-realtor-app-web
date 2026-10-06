'use client';

import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';

type Upload = { id: string; docId: string; filename: string; createdAt: string; uploader: string; storedIn: string; storedPath: string; storedUrl: string; archived: boolean };

/** Files clients sent through their portal links: who sent each one, when, and where it is filed. */
export default function ClientUploadsCard({ dealId, version }: { dealId: string; version: string }) {
  const [rows, setRows] = useState<Upload[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/closing-time/assist?dealId=${encodeURIComponent(dealId)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => { if (live) setRows(body ? (body.uploads as Upload[]).filter((u) => !u.archived && !u.docId.startsWith('req:')) : []); })
      .catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [dealId, version]);
  if (!rows) return null;
  const when = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <div className="ds-card">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-900"><FileText className="h-4 w-4 text-[#7059A8]" aria-hidden="true" />Client Uploads</span>
        <span className="text-xs font-medium text-slate-500">{rows.length}</span>
      </div>
      {rows.length === 0 && <p className="px-4 pb-4 text-xs text-slate-500">General uploads from your clients appear here. Files for a document request show under that request.</p>}
      {rows.map((u) => (
        <div key={u.id} className="ds-list-row">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-slate-800">{u.filename}</span>
            <span className="block text-xs text-slate-500">{u.uploader ? `Uploaded by ${u.uploader}` : 'Uploaded by a client'} · {when(u.createdAt)}</span>
          </span>
          {u.storedIn
            ? (u.storedUrl ? <a className="text-xs font-medium text-[#301D5D] underline underline-offset-2" href={u.storedUrl} target="_blank" rel="noreferrer">{u.storedPath || 'Open'}</a> : <span className="text-xs text-slate-500">{u.storedPath}</span>)
            : <a className="text-xs font-medium text-[#301D5D] underline underline-offset-2" href={`/api/closing-time/assist/upload/${u.id}`}>Held In Closing Time</a>}
        </div>
      ))}
    </div>
  );
}
