'use client';

// app/admin/magazines/MagazinesAdminClient.tsx
//
// Two-column list of magazines (austin + san_antonio), newest first.
// Each card shows the cover, issue label, page count, and edit/delete actions.
// Top has a "+ New Issue" button that navigates to /admin/magazines/new.

import { useState } from 'react';
import Link from 'next/link';

type Magazine = {
  id: number;
  publication: 'austin' | 'san_antonio';
  year: number;
  month: number;
  issue_label: string;
  cover_url: string | null;
  reader_url: string | null;
  page_urls: string[] | null;
  page_count: number;
  sort_date: string;
};

type Props = {
  initialMagazines: Magazine[];
};

const PUB_LABEL: Record<'austin' | 'san_antonio', string> = {
  austin: 'RealtyLine (Austin)',
  san_antonio: 'Newsline (San Antonio)',
};

export default function MagazinesAdminClient({ initialMagazines }: Props) {
  const [magazines, setMagazines] = useState<Magazine[]>(initialMagazines);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const austin = magazines.filter((m) => m.publication === 'austin');
  const sa = magazines.filter((m) => m.publication === 'san_antonio');

  async function handleDelete(id: number, label: string) {
    if (!confirm(`Delete "${label}"? This removes the row from the database. Uploaded files remain in Vercel Blob.`)) {
      return;
    }
    setDeletingId(id);
    setError(null);
    try {
      const r = await fetch(`/api/admin/magazines/${id}`, { method: 'DELETE' });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `Delete failed (${r.status})`);
      }
      setMagazines((prev) => prev.filter((m) => m.id !== id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      setError(msg);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Magazines</h1>
          <Link
            href="/admin/magazines/new"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium text-sm"
          >
            + New Issue
          </Link>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Column label={PUB_LABEL.austin} magazines={austin} deletingId={deletingId} onDelete={handleDelete} />
          <Column label={PUB_LABEL.san_antonio} magazines={sa} deletingId={deletingId} onDelete={handleDelete} />
        </div>
      </div>
    </div>
  );
}

function Column({
  label,
  magazines,
  deletingId,
  onDelete,
}: {
  label: string;
  magazines: Magazine[];
  deletingId: number | null;
  onDelete: (id: number, label: string) => void;
}) {
  return (
    <div>
      <h2 className="text-sm uppercase tracking-wider text-gray-500 font-medium mb-3">{label}</h2>
      {magazines.length === 0 ? (
        <p className="text-gray-400 text-sm italic">No issues yet.</p>
      ) : (
        <ul className="space-y-3">
          {magazines.map((m) => (
            <li
              key={m.id}
              className="bg-white border border-gray-200 rounded-md p-3 flex items-start gap-3"
            >
              {m.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.cover_url} alt="" className="w-16 h-20 object-cover bg-gray-100 rounded flex-shrink-0" />
              ) : (
                <div className="w-16 h-20 bg-gray-100 rounded flex items-center justify-center text-gray-300 text-xs flex-shrink-0">
                  No cover
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-gray-900">{m.issue_label}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {m.page_count} {m.page_count === 1 ? 'page' : 'pages'} · sort {m.sort_date?.slice(0, 10)}
                </p>
                {(!m.cover_url || !m.page_urls || m.page_urls.length === 0) && (
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠ {!m.cover_url ? 'missing cover · ' : ''}
                    {!m.page_urls || m.page_urls.length === 0 ? 'no pages uploaded' : ''}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-2">
                  <Link
                    href={`/admin/magazines/${m.id}`}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => onDelete(m.id, m.issue_label)}
                    disabled={deletingId === m.id}
                    className="text-xs text-red-600 hover:underline disabled:opacity-50"
                  >
                    {deletingId === m.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
