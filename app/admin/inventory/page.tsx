'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type {
  BuilderInventoryRow,
  Status,
} from '@/lib/builder-inventory';
import EditInventoryModal from '@/components/inventory/EditInventoryModal';

import PageTitle from '@/components/ui/PageTitle';
type Tab = 'pending' | 'active' | 'rejected';

const TAB_LABELS: Record<Tab, string> = {
  pending: 'Pending review',
  active: 'Active',
  rejected: 'Rejected',
};

export default function AdminInventoryPage() {
  const [tab, setTab] = useState<Tab>('active');
  const [rows, setRows] = useState<BuilderInventoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<Status, number> | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/inventory?status=${tab}`, {
          credentials: 'include',
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || `HTTP ${res.status}`);
        }
        const body = (await res.json()) as {
          rows: BuilderInventoryRow[];
          counts: Record<Status, number>;
        };
        if (cancelled) return;
        setRows(body.rows);
        setCounts(body.counts);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setRows([]);
        setError(e instanceof Error ? e.message : 'Failed to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, reloadKey]);

  const handleEditClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, id: number) => {
      // Allow cmd/ctrl/middle-click to open the dedicated page in a new tab.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      setEditingId(id);
    },
    [],
  );

  const handleChanged = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-1">
              Admin
            </p>
            <PageTitle size="md">
              Builder Inventory &amp; Promotions
            </PageTitle>
            <p className="text-sm text-gray-600 font-light mt-2 max-w-2xl">
              Submissions from builder and developer clients. Approve, reject, or
              feature each entry. Approved items appear on the public /inventory
              page in the publication they were tagged for.
            </p>
          </div>
          <Link
            href="/admin/inventory/new"
            className="shrink-0 bg-[#E06100] text-white px-4 py-2 text-sm font-medium hover:bg-[#FF7820] rounded-md transition-colors whitespace-nowrap"
          >
            + Create Promotion
          </Link>
        </div>

        <div className="flex gap-1 border-b border-gray-200 mb-6">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => {
            const active = t === tab;
            const count = counts?.[t];
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={
                  'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ' +
                  (active
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-700')
                }
              >
                {TAB_LABELS[t]}
                {count != null && (
                  <span className="ml-2 text-xs text-gray-400">{count}</span>
                )}
                {t === 'pending' && !active && count != null && count > 0 && (
                  <span
                    aria-label={`${count} pending review`}
                    className="ml-1.5 inline-block w-2 h-2 rounded-full bg-red-600 align-middle"
                  />
                )}
              </button>
            );
          })}
        </div>

        {error && (
          <div
            role="alert"
            className="border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-900 mb-6"
          >
            {error}
          </div>
        )}

        {rows == null && !error && (
          <p className="text-sm text-gray-500 font-light">Loading…</p>
        )}

        {rows != null && rows.length === 0 && !error && (
          <EmptyState tab={tab} onSwitchTab={setTab} />
        )}

        <EditInventoryModal
          id={editingId}
          onClose={() => setEditingId(null)}
          onChanged={handleChanged}
        />

        {rows != null && rows.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3 font-medium w-20" />
                  <th className="px-4 py-3 font-medium">Submitted</th>
                  <th className="px-4 py-3 font-medium">Builder / Title</th>
                  <th className="px-4 py-3 font-medium">Kind</th>
                  <th className="px-4 py-3 font-medium">Publication</th>
                  <th className="px-4 py-3 font-medium">Submitter</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-gray-200 last:border-b-0">
                    <td className="px-4 py-3">
                      <div className="w-16 h-16 bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center rounded-md">
                        {r.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.thumbnailUrl}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <span className="text-gray-300 text-2xl" aria-hidden="true">
                            &#x1F3E0;
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {new Date(r.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{r.builderName}</p>
                      <p className="text-gray-600">{r.title}</p>
                      <p className="text-xs text-gray-500">{r.city}, {r.state}</p>
                    </td>
                    <td className="px-4 py-3">
                      <KindBadge kind={r.kind} />
                    </td>
                    <td className="px-4 py-3 text-gray-700">{r.publication}</td>
                    <td className="px-4 py-3">
                      <p className="text-gray-700">{r.submittedByName}</p>
                      <p className="text-xs text-gray-500">{r.submittedByEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/inventory/${r.id}`}
                        onClick={(e) => handleEditClick(e, r.id)}
                        className="text-sm font-medium text-gray-900 hover:underline"
                      >
                        Review →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ tab, onSwitchTab }: { tab: Tab; onSwitchTab: (t: Tab) => void }) {
  const messages: Record<Tab, string> = {
    pending: 'No submissions waiting for review.',
    active: 'No active submissions yet.',
    rejected: 'No rejected submissions.',
  };
  const cta: Partial<Record<Tab, { label: string; target: Tab }>> = {
    pending: { label: 'View active submissions →', target: 'active' },
    rejected: { label: 'View active submissions →', target: 'active' },
  };
  const action = cta[tab];
  return (
    <div className="bg-white border border-gray-200 rounded-md p-12 text-center">
      <p className="text-gray-500 font-light mb-4">{messages[tab]}</p>
      {action && (
        <button
          type="button"
          onClick={() => onSwitchTab(action.target)}
          className="text-sm font-medium text-[#021D40] underline"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function KindBadge({ kind }: { kind: 'listing' | 'promotion' }) {
  const styles =
    kind === 'listing'
      ? 'bg-green-50 text-green-900 rounded-md'
      : 'bg-amber-50 text-amber-900 rounded-md';
  return (
    <span
      className={
        'inline-block text-xs font-medium px-2 py-0.5 rounded-md ' + styles
      }
    >
      {kind === 'listing' ? 'Listing' : 'Promotion'}
    </span>
  );
}
