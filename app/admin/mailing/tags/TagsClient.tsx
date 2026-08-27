// app/admin/mailing/tags/TagsClient.tsx
//
// Tag library — list every distinct tag across mailing_contacts,
// advertisers, and realtors with row counts, plus inline Rename and
// Delete actions. Tag colors mirror what MailingClient renders so the
// table previews exactly how each tag will look on a contact card.

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PageTitle from '@/components/ui/PageTitle';
import MailingBreadcrumb from '@/components/admin/MailingBreadcrumb';

const ACCENT = '#301D5D';

type TagRow = {
  tag: string;
  mailing_contacts: number;
  advertisers: number;
  realtors: number;
  total: number;
};

type TagStyle = { bg: string; fg: string; label?: string };

// Mirror the chip styling in app/admin/mailing/[segment]/MailingClient.tsx
// so this page is the visual source-of-truth for tag colors.
function styleFor(t: string): TagStyle {
  switch (t) {
    case 'active-advertiser': return { bg: '#ffedd5', fg: '#c2410c', label: 'Active Partner' };
    case 'non-advertiser':    return { bg: '#fed7aa', fg: '#9a3412', label: 'Non-Advertiser' };
    case 'manual':            return { bg: '#ede9fe', fg: '#301D5D', label: 'Manual' };
    case 'REALTOR':           return { bg: '#dcfce7', fg: '#16a34a' };
    case 'Loan Officer':      return { bg: '#fef3c7', fg: '#d97706' };
    case 'Business Development': return { bg: '#e2e8f0', fg: '#475569' };
    default:                  return { bg: '#f3f4f6', fg: '#374151' };
  }
}

// Provenance / legacy tags are hidden from the chip preview but still
// listed in the table so admins know they exist. They render as muted.
const PROVENANCE_PREFIX = '_was:';

function TagChip({ tag }: { tag: string }) {
  const s = styleFor(tag);
  const isProvenance = tag.startsWith(PROVENANCE_PREFIX);
  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
      style={{
        background: isProvenance ? '#f3f4f6' : s.bg,
        color: isProvenance ? '#6b7280' : s.fg,
      }}
    >
      {s.label || tag}
    </span>
  );
}

export default function TagsClient() {
  const [rows, setRows] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyTag, setBusyTag] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [creating, setCreating] = useState<string>('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/mailing/tags', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { tags: TagRow[] } = await res.json();
      setRows(data.tags);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  const visibleRows = useMemo(() => {
    // Hide provenance tags (_was:*) from the main list by default; they show
    // in a collapsed "Legacy provenance" footer instead.
    return rows.filter((r) => !r.tag.startsWith(PROVENANCE_PREFIX));
  }, [rows]);

  const provenanceRows = useMemo(
    () => rows.filter((r) => r.tag.startsWith(PROVENANCE_PREFIX)),
    [rows],
  );

  async function doRename(from: string, to: string) {
    const trimmedTo = to.trim();
    if (!trimmedTo) {
      setError('New tag name cannot be empty.');
      return;
    }
    if (trimmedTo === from) {
      setRenaming(null);
      return;
    }
    setBusyTag(from);
    setError(null);
    try {
      const res = await fetch('/api/admin/mailing/tags', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename', from, to: trimmedTo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setStatusMsg(`Renamed "${from}" → "${trimmedTo}".`);
      setRenaming(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'rename failed');
    } finally {
      setBusyTag(null);
    }
  }

  async function doDelete(tag: string, total: number) {
    if (!window.confirm(
      `Delete tag "${tag}" from all ${total.toLocaleString()} rows?\n\n` +
      `This strips the tag from every contact, advertiser, and realtor that has it. ` +
      `The rows themselves are not deleted.`
    )) return;
    setBusyTag(tag);
    setError(null);
    try {
      const res = await fetch('/api/admin/mailing/tags', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', from: tag }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setStatusMsg(`Deleted "${tag}" from ${total.toLocaleString()} rows.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'delete failed');
    } finally {
      setBusyTag(null);
    }
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <MailingBreadcrumb trail={[{ label: 'Mailing List', href: '/admin/mailing' }, { label: 'Manage Tags' }]} />
      <PageTitle size="md">Tag Library</PageTitle>
      <p className="-mt-2 text-sm text-gray-600">
        Rename, merge, or delete tags across the entire mailing system.
      </p>

      <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-600">
        <p>
          Tags live on <strong>mailing_contacts</strong>, <strong>partners</strong>, and{' '}
          <strong>realtors</strong>. Renaming a tag updates every row that has it across all three tables.
          Deleting a tag strips it from every row but keeps the rows themselves.
        </p>
        <p className="mt-2 text-xs text-gray-500">
          Core categories: <TagChip tag="REALTOR" /> <TagChip tag="Loan Officer" /> <TagChip tag="Business Development" />
          {' '}— plus per-segment audience tags <TagChip tag="active-advertiser" /> <TagChip tag="non-advertiser" /> <TagChip tag="manual" />.
        </p>
      </div>

      {statusMsg && (
        <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {statusMsg}
          <button className="ml-3 text-xs underline" onClick={() => setStatusMsg(null)}>dismiss</button>
        </div>
      )}
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="rounded border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: ACCENT }}>
            Tags ({visibleRows.length})
          </h2>
          <button
            onClick={() => void load()}
            className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {/* Mobile card list. */}
        <div className="sm:hidden divide-y divide-gray-100">
          {visibleRows.length === 0 && !loading && (
            <div className="px-4 py-6 text-center text-sm text-gray-500">No tags yet.</div>
          )}
          {visibleRows.map((r) => {
            const isRenaming = renaming?.from === r.tag;
            const isBusy = busyTag === r.tag;
            return (
              <div key={r.tag} className="px-4 py-3 space-y-2">
                {isRenaming ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={renaming.to}
                      onChange={(e) => setRenaming({ ...renaming, to: e.target.value })}
                      className="rounded border border-gray-300 px-2 py-1 text-sm flex-1 min-w-[120px]"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void doRename(r.tag, renaming.to);
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                    />
                    <button
                      onClick={() => void doRename(r.tag, renaming.to)}
                      disabled={isBusy}
                      className="rounded bg-brand-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {isBusy ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => setRenaming(null)}
                      className="rounded border border-gray-300 px-2 py-1 text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <TagChip tag={r.tag} />
                    <span className="font-mono text-xs text-gray-400 break-all">{r.tag}</span>
                  </div>
                )}
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-gray-500 uppercase tracking-wider">Mailing</dt>
                  <dd className="text-gray-800 text-right tabular-nums">{r.mailing_contacts.toLocaleString()}</dd>
                  <dt className="text-gray-500 uppercase tracking-wider">Partners</dt>
                  <dd className="text-gray-800 text-right tabular-nums">{r.advertisers.toLocaleString()}</dd>
                  <dt className="text-gray-500 uppercase tracking-wider">Realtors</dt>
                  <dd className="text-gray-800 text-right tabular-nums">{r.realtors.toLocaleString()}</dd>
                  <dt className="text-gray-500 uppercase tracking-wider">Total</dt>
                  <dd className="text-gray-900 text-right tabular-nums font-semibold">{r.total.toLocaleString()}</dd>
                </dl>
                {!isRenaming && (
                  <div className="pt-1 flex gap-2 justify-end">
                    <button
                      onClick={() => setRenaming({ from: r.tag, to: r.tag })}
                      disabled={isBusy}
                      className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => void doDelete(r.tag, r.total)}
                      disabled={isBusy}
                      className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {isBusy ? 'Working…' : 'Delete'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">Tag</th>
                <th className="px-4 py-2 text-right">Mailing</th>
                <th className="px-4 py-2 text-right">Partners</th>
                <th className="px-4 py-2 text-right">Realtors</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 && !loading && (
                <tr><td className="px-4 py-6 text-center text-gray-500" colSpan={6}>No tags yet.</td></tr>
              )}
              {visibleRows.map((r) => {
                const isRenaming = renaming?.from === r.tag;
                const isBusy = busyTag === r.tag;
                return (
                  <tr key={r.tag} className="border-t border-gray-100">
                    <td className="px-4 py-2">
                      {isRenaming ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={renaming.to}
                            onChange={(e) => setRenaming({ ...renaming, to: e.target.value })}
                            className="rounded border border-gray-300 px-2 py-1 text-sm"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void doRename(r.tag, renaming.to);
                              if (e.key === 'Escape') setRenaming(null);
                            }}
                          />
                          <button
                            onClick={() => void doRename(r.tag, renaming.to)}
                            disabled={isBusy}
                            className="rounded bg-brand-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            {isBusy ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={() => setRenaming(null)}
                            className="rounded border border-gray-300 px-2 py-1 text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <TagChip tag={r.tag} />
                          <span className="font-mono text-xs text-gray-400">{r.tag}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.mailing_contacts.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.advertisers.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.realtors.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold">{r.total.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right">
                      {!isRenaming && (
                        <div className="inline-flex gap-2">
                          <button
                            onClick={() => setRenaming({ from: r.tag, to: r.tag })}
                            disabled={isBusy}
                            className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                          >
                            Rename
                          </button>
                          <button
                            onClick={() => void doDelete(r.tag, r.total)}
                            disabled={isBusy}
                            className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            {isBusy ? 'Working…' : 'Delete'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {provenanceRows.length > 0 && (
        <details className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
          <summary className="cursor-pointer text-gray-600">
            Legacy provenance markers ({provenanceRows.length})
          </summary>
          <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-gray-600 sm:grid-cols-2 lg:grid-cols-3">
            {provenanceRows.map((r) => (
              <div key={r.tag} className="flex justify-between rounded bg-white px-2 py-1">
                <span className="font-mono">{r.tag}</span>
                <span className="tabular-nums text-gray-500">{r.total.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            These mark rows that came from now-merged segments. They are safe to keep for audit but can be deleted from the main table above if you no longer need the provenance.
          </p>
        </details>
      )}
    </div>
  );
}
