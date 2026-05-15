'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { adminApi } from '@/lib/admin-api';
import {
  PUBLICATION_FILTER_LABELS,
  type PublicationId,
} from '@/lib/publications';

type AdminEvent = {
  id: number;
  externalSource: 'unlockmls' | 'wordpress' | 'manual' | 'fpr' | 'hba';
  externalId: string;
  publication: 'austin' | 'san_antonio';
  title: string;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  hidden: boolean;
  editedFields: string[];
  editedBy: string | null;
  editedAt: string | null;
};

type SortKey = 'title' | 'pub' | 'when' | 'source' | 'status';

const PUB_STYLES: Record<PublicationId, string> = {
  austin: 'bg-[#021D40]/10 text-[#021D40] border-[#021D40]/20',
  san_antonio: 'bg-[#3D0740]/10 text-[#3D0740] border-[#3D0740]/20',
};

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  unlockmls: 'UnlockMLS',
  wordpress: 'WordPress',
  fpr: 'Five Points',
  hba: 'HBA Austin',
};

function formatDateTime(s: string | null) {
  if (!s) return '-';
  return new Date(s).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function EventsPage() {
  const { admin, loading: authLoading } = useAdmin();
  const [items, setItems] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'austin' | 'san_antonio'>('all');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('when');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = [...items].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortKey) {
      case 'title': return a.title.localeCompare(b.title) * dir;
      case 'pub': return a.publication.localeCompare(b.publication) * dir;
      case 'when': {
        const aT = a.startDate ? new Date(a.startDate).getTime() : 0;
        const bT = b.startDate ? new Date(b.startDate).getTime() : 0;
        return (aT - bT) * dir;
      }
      case 'source': return a.externalSource.localeCompare(b.externalSource) * dir;
      case 'status': return (Number(a.hidden) - Number(b.hidden)) * dir;
      default: return 0;
    }
  });

  const reload = () => {
    setLoading(true);
    const pub = filter === 'all' ? undefined : filter;
    adminApi
      .listEvents(pub)
      .then((data) => {
        setItems(data?.events || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!admin) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, filter]);

  const handleHideToggle = async (ev: AdminEvent) => {
    setBusyId(ev.id);
    try {
      if (ev.hidden) {
        await adminApi.unhideEvent(ev.id);
      } else {
        await adminApi.hideEvent(ev.id);
      }
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (ev: AdminEvent) => {
    if (ev.externalSource !== 'manual') return;
    if (!window.confirm(`Delete "${ev.title}"? This cannot be undone.`)) return;
    setBusyId(ev.id);
    try {
      await adminApi.deleteEvent(ev.id);
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  if (authLoading || !admin) {
    return <div className="max-w-6xl mx-auto px-6 py-12 text-sm text-gray-500">Loading...</div>;
  }

  const filterButton = (key: 'all' | 'austin' | 'san_antonio', label: string) => (
    <button
      key={key}
      onClick={() => setFilter(key)}
      className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
        filter === key
          ? 'bg-[#1a2a44] text-white border-[#1a2a44]'
          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Events</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage scraped + manual events. Manual events appear in the public calendar; scraped events can be hidden.
          </p>
        </div>
        <Link
          href="/admin/events/new"
          className="px-4 py-2 bg-[#1a2a44] text-white text-sm font-medium rounded hover:bg-[#021D40] transition-colors"
        >
          + New Event
        </Link>
      </div>

      <div className="flex items-center gap-2 mb-4">
        {filterButton('all', 'All')}
        {filterButton('austin', 'RealtyLine')}
        {filterButton('san_antonio', 'Newsline SA')}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-md mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500 py-12 text-center">Loading events...</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-gray-500 py-12 text-center bg-white border border-gray-200 rounded">
          No events found. <Link href="/admin/events/new" className="text-[#1a2a44] underline">Create one</Link>.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <SortTh label="Title" k="title" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Pub" k="pub" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="When" k="when" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Source" k="source" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Status" k="status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <th className="text-right px-4 py-3 font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((ev) => {
                const isManual = ev.externalSource === 'manual';
                const hasEdits = ev.editedFields.length > 0;
                return (
                  <tr key={ev.id} className={ev.hidden ? 'bg-gray-50' : ''}>
                    <td className="px-4 py-3">
                      <Link href={`/admin/events/${ev.id}`} className="font-medium text-gray-900 hover:text-[#1a2a44] hover:underline">
                        {ev.title}
                      </Link>
                      {hasEdits && !isManual && (
                        <div className="text-xs text-amber-700 mt-0.5">
                          ✎ Edited: {ev.editedFields.join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded border ${PUB_STYLES[ev.publication] || ''}`}>
                        {PUBLICATION_FILTER_LABELS[ev.publication] || ev.publication}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {formatDateTime(ev.startDate)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {SOURCE_LABELS[ev.externalSource] || ev.externalSource}
                    </td>
                    <td className="px-4 py-3">
                      {ev.hidden ? (
                        <span className="inline-block px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-700">Hidden</span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-md text-xs font-medium bg-green-100 text-green-800">Visible</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Link href={`/admin/events/${ev.id}`} className="text-xs text-[#1a2a44] hover:underline mr-3">
                        Edit
                      </Link>
                      <button
                        onClick={() => handleHideToggle(ev)}
                        disabled={busyId === ev.id}
                        className="text-xs text-gray-700 hover:text-gray-900 mr-3 disabled:opacity-50"
                      >
                        {ev.hidden ? 'Unhide' : 'Hide'}
                      </button>
                      <button
                        onClick={() => handleDelete(ev)}
                        disabled={!isManual || busyId === ev.id}
                        title={isManual ? '' : 'Scraped events can only be hidden — they would be recreated on next scraper run.'}
                        className="text-xs text-red-600 hover:text-red-800 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SortTh({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th className="text-left px-4 py-3 font-medium text-gray-700">
      <button
        type="button"
        onClick={() => onSort(k)}
        className="inline-flex items-center gap-1 hover:text-gray-900"
      >
        {label}
        {active && <span className="text-gray-500">{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  );
}
