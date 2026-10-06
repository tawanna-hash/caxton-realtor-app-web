'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { adminApi } from '@/lib/admin-api';
import PendingSubmissions from './PendingSubmissions';
import PageTitle from '@/components/ui/PageTitle';
import ContentPagination from '@/app/admin/_components/ContentPagination';
import {
  PUBLICATIONS,
  PUBLICATION_FILTER_LABELS,
  type PublicationId,
} from '@/lib/publications';

type AdminEvent = {
  id: number;
  externalSource: 'unlockmls' | 'wordpress' | 'manual' | 'fpr' | 'hba';
  externalId: string;
  publication: PublicationId;
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
  austin: 'bg-brand-700/10 text-brand-700 border-brand-700/20',
  san_antonio: 'bg-brand-700/10 text-brand-700 border-brand-700/20',
  houston: 'bg-brand-700/10 text-brand-700 border-brand-700/20',
  dallas: 'bg-brand-700/10 text-brand-700 border-brand-700/20',
};

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  unlockmls: 'UnlockMLS',
  wordpress: 'WordPress',
  fpr: 'Five Points',
  hba: 'HBA Austin',
  realtyline: 'RealtyLine',
  gmail: 'Gmail',
  metrotex: 'MetroTex',
  gfwar: 'Greater Ft. Worth',
  arbor: 'Arlington',
  gdwcar: 'Greater Denton/Wise',
  granbury: 'Granbury',
  texoma: 'Greater Texoma',
  gmwar: 'Greater Metro West',
};

/** Calendar day (YYYY-MM-DD) in Central time. */
function centralDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/**
 * Same rule as the public calendar: an event is past once its final
 * calendar day (end date, else start date) is before today in Central time.
 * Undated events are never treated as past.
 */
function isPastEvent(ev: { startDate: string | null; endDate: string | null }, today: string): boolean {
  const ref = ev.endDate ?? ev.startDate;
  if (!ref) return false;
  const d = new Date(ref);
  if (Number.isNaN(d.getTime())) return false;
  return centralDay(d) < today;
}

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
  const [filter, setFilter] = useState<'all' | PublicationId>('all');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('when');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  // Past events stay in the archive but are hidden from the list by default.
  const [showPast, setShowPast] = useState(false);

  // The server supplies one global Central-time count for all publications.
  // Hidden scraped events remain in the archive but need no further action.
  const [expiredSummary, setExpiredSummary] = useState({
    total: 0, manual: 0, visibleScraped: 0, hiddenScraped: 0,
  });
  const expiredActionCount = expiredSummary.manual + expiredSummary.visibleScraped;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const today = centralDay(new Date());
  const pastCount = items.filter((ev) => isPastEvent(ev, today)).length;
  const listed = showPast ? items : items.filter((ev) => !isPastEvent(ev, today));

  const sorted = [...listed].sort((a, b) => {
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
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const reload = () => {
    setLoading(true);
    const pub = filter === 'all' ? undefined : filter;
    adminApi
      .listEvents(pub)
      .then((data) => {
        const events: AdminEvent[] = data?.events || [];
        setItems(events);
        setExpiredSummary(data?.expired ?? {
          total: 0, manual: 0, visibleScraped: 0, hiddenScraped: 0,
        });
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!admin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reload() is the load-on-mount/filter-change effect; pre-existing pattern
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

  const handleDeleteExpired = async () => {
    if (expiredActionCount === 0) {
      alert('No expired events need clearing.');
      return;
    }
    const msg =
      `Clear ${expiredActionCount} expired event${expiredActionCount === 1 ? '' : 's'}? ` +
      `${expiredSummary.manual} manual event${expiredSummary.manual === 1 ? '' : 's'} will be permanently deleted; ` +
      `${expiredSummary.visibleScraped} scraped event${expiredSummary.visibleScraped === 1 ? '' : 's'} will be hidden.`;
    if (!window.confirm(msg)) return;
    setBulkBusy(true);
    try {
      const res = await adminApi.deleteExpiredEvents();
      const deleted = res?.deletedCount ?? 0;
      const hidden = res?.hiddenCount ?? 0;
      reload();
      alert(`Deleted ${deleted} manual event${deleted === 1 ? '' : 's'} and hid ${hidden} scraped event${hidden === 1 ? '' : 's'}.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBulkBusy(false);
    }
  };

  if (authLoading || !admin) {
    return <div className="max-w-6xl mx-auto px-6 py-12 text-sm text-gray-500">Loading...</div>;
  }

  const filterButton = (key: 'all' | PublicationId, label: string) => (
    <button
      key={key}
      onClick={() => setFilter(key)}
      className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
        filter === key
          ? 'bg-[#301D5D] text-white border-brand-700'
          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="content-admin-shell">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <PageTitle size="md">Calendar Events</PageTitle>
          <p className="text-sm text-gray-500 mt-1">
            Manage scraped + manual events. Manual events appear in the public calendar; scraped events can be hidden.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDeleteExpired}
            disabled={bulkBusy || expiredActionCount === 0}
            title={
              expiredActionCount === 0
                ? 'No expired events need clearing'
                : `Delete ${expiredSummary.manual} manual and hide ${expiredSummary.visibleScraped} scraped expired events`
            }
            className="px-4 py-2 bg-white text-[#661102] text-sm font-medium rounded-md border border-[#FF2A04]/50 hover:bg-[#FFEAE6] transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {bulkBusy
              ? 'Clearing\u2026'
              : `Clear expired${expiredActionCount > 0 ? ` (${expiredActionCount})` : ''}`}
          </button>
          <Link
            href="/admin/events/new"
            className="px-4 py-2 bg-brand-700 text-white text-sm font-medium rounded-md hover:bg-[#42277C] transition-colors"
          >
            + New Event
          </Link>
        </div>
      </div>
      <PendingSubmissions onChanged={reload} />

      <section className="content-admin-summary" aria-label="Event summary">
        <div><strong>{items.length.toLocaleString()}</strong><span>Total events</span></div>
        <div><strong>{items.filter((event) => !event.hidden).length.toLocaleString()}</strong><span>Visible</span></div>
        <div><strong>{items.filter((event) => event.hidden).length.toLocaleString()}</strong><span>Hidden</span></div>
        <div title="Events whose last day is before today (Central time). Kept in the archive; use Show past events to see them."><strong>{pastCount.toLocaleString()}</strong><span>Past events</span></div>
      </section>

      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          {filterButton('all', 'All')}
          {PUBLICATIONS.map((publication) => (
            filterButton(publication.id, publication.filterLabel)
          ))}
        </div>
        {/* BUG-29: surface counts so admins can see at a glance how many events are loaded + how many are hidden */}
        {!loading && items.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
            <button
              type="button"
              onClick={() => { setShowPast((v) => !v); setPage(1); }}
              aria-pressed={showPast}
              className={`inline-flex items-center px-2 py-1 rounded-full border font-medium ${showPast ? 'bg-brand-50 border-brand-300 text-brand-800' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
            >
              {showPast ? 'Hide past events' : `Show past events (${pastCount})`}
            </button>
            <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 border border-gray-200 font-medium">
              {items.length} total
            </span>
            <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 border border-gray-200">
              {items.filter((e) => !e.hidden).length} visible
            </span>
            <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 border border-gray-200">
              {items.filter((e) => e.hidden).length} hidden
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-[#FFEAE6] border border-[#FF2A04]/30 text-[#661102] text-sm px-4 py-3 rounded-md mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500 py-12 text-center">Loading events...</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-gray-500 py-12 text-center bg-white border border-gray-200 rounded-md">
          No events found. <Link href="/admin/events/new" className="text-brand-700 underline">Create one</Link>.
        </div>
      ) : (
        <>
        {/* mobile card list */}
        <ul className="sm:hidden divide-y divide-gray-100 rounded-md border border-gray-200 bg-white overflow-hidden">
          {pageItems.map((ev) => {
            const isManual = ev.externalSource === 'manual';
            const hasEdits = ev.editedFields.length > 0;
            return (
              <li key={`m-${ev.id}`} className={`p-3 ${ev.hidden ? 'bg-gray-50' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/events/${ev.id}`} className="font-medium text-gray-900 hover:text-brand-700 hover:underline">
                      {ev.title}
                    </Link>
                    {hasEdits && !isManual && (
                      <div className="text-xs text-[#645600] mt-0.5">✎ Edited: {ev.editedFields.join(', ')}</div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-md border ${PUB_STYLES[ev.publication] || ''}`}>
                      {PUBLICATION_FILTER_LABELS[ev.publication] || ev.publication}
                    </span>
                    {ev.hidden ? (
                      <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 text-gray-700">Hidden</span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#E0FBE0] text-[#005A00]">Visible</span>
                    )}
                  </div>
                </div>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-gray-500">When</dt>
                  <dd className="text-gray-700">{formatDateTime(ev.startDate)}</dd>
                  <dt className="text-gray-500">Source</dt>
                  <dd className="text-gray-600">{SOURCE_LABELS[ev.externalSource] || ev.externalSource}</dd>
                </dl>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  <Link href={`/admin/events/${ev.id}`} className="text-brand-700 hover:underline">Edit</Link>
                  <button
                    onClick={() => handleHideToggle(ev)}
                    disabled={busyId === ev.id}
                    className="text-gray-700 hover:text-gray-900 disabled:opacity-50"
                  >
                    {ev.hidden ? 'Unhide' : 'Hide'}
                  </button>
                  <button
                    onClick={() => handleDelete(ev)}
                    disabled={!isManual || busyId === ev.id}
                    title={isManual ? '' : 'Scraped events can only be hidden — they would be recreated on next scraper run.'}
                    className="text-[#661102] hover:text-[#661102] disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="hidden sm:block bg-white border border-gray-200 rounded-md overflow-x-auto">
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
              {pageItems.map((ev) => {
                const isManual = ev.externalSource === 'manual';
                const hasEdits = ev.editedFields.length > 0;
                return (
                  <tr key={ev.id} className={ev.hidden ? 'bg-gray-50' : ''}>
                    <td className="px-4 py-3">
                      <Link href={`/admin/events/${ev.id}`} className="font-medium text-gray-900 hover:text-brand-700 hover:underline">
                        {ev.title}
                      </Link>
                      {hasEdits && !isManual && (
                        <div className="text-xs text-[#645600] mt-0.5">
                          ✎ Edited: {ev.editedFields.join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-md border ${PUB_STYLES[ev.publication] || ''}`}>
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
                        <span className="inline-block px-2 py-0.5 rounded-md text-xs font-medium bg-[#E0FBE0] text-[#005A00]">Visible</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Link href={`/admin/events/${ev.id}`} className="text-xs text-brand-700 hover:underline mr-3">
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
                        className="text-xs text-[#661102] hover:text-[#661102] disabled:opacity-30 disabled:cursor-not-allowed"
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
        <ContentPagination
          count={sorted.length}
          page={safePage}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        />
        </>
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
