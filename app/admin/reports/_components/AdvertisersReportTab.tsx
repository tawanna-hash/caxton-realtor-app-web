// app/admin/reports/_components/AdvertisersReportTab.tsx
//
// Phase 6e: self-contained "Advertisers" tab for /admin/reports. Owns all its
// own state so page.tsx only needs to render it. Lets an admin pick several
// advertisers, choose a date range + optional shared message, and email each
// of them their performance report in one click via /api/admin/advertisers/batch-report.

'use client';

import { useEffect, useMemo, useState } from 'react';
import AdvertiserReportDrawer from './AdvertiserReportDrawer';

type DaysOption = 7 | 30 | 90 | 180;
const DAYS_OPTIONS: Array<{ value: DaysOption; label: string }> = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '180 days' },
];

interface Advertiser {
  id: number;
  name: string;
  slug: string;
  publication: 'austin' | 'san_antonio' | 'both';
  contact_email: string | null;
}

interface SendResult {
  id: number;
  name: string;
  sent: boolean;
  recipient?: string;
  error?: string;
}

function publicationLabel(pub: Advertiser['publication']): string {
  return pub === 'san_antonio' ? 'Newsline San Antonio' : pub === 'both' ? 'Both' : 'RealtyLine';
}

function rangeFromDays(days: DaysOption): { from: string; to: string } {
  const to = new Date();
  to.setUTCHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  from.setUTCHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function AdvertisersReportTab() {
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [days, setDays] = useState<DaysOption>(30);
  const [message, setMessage] = useState('');

  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SendResult[] | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // Drawer state for per-row View / Edit. `drawer` is null when closed.
  const [drawer, setDrawer] = useState<
    | { advertiser: Advertiser; mode: 'view' | 'edit' }
    | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/advertisers', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        // The advertisers list endpoint returns { advertisers: [...] } with
        // contact_email + publication included.
        const list: Advertiser[] = Array.isArray(data?.advertisers) ? data.advertisers : [];
        setAdvertisers(list);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setLoadError(err.message);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const sendable = useMemo(
    () => advertisers.filter((a) => (a.contact_email || '').trim().length > 0),
    [advertisers],
  );

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllSendable = () => setSelected(new Set(sendable.map((a) => a.id)));
  const clearAll = () => setSelected(new Set());

  const handleSend = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setSending(true);
    setResults(null);
    setSendError(null);
    try {
      const { from, to } = rangeFromDays(days);
      const res = await fetch('/api/admin/advertisers/batch-report', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ advertiserIds: ids, from, to, message: message.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || data?.error || `${res.status}`);
      setResults(data.results as SendResult[]);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'send failed');
    } finally {
      setSending(false);
    }
  };

  const selectedCount = selected.size;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Advertiser reports</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Email performance reports to multiple advertisers at once. Only advertisers with a contact
          email can be sent to.
        </p>
      </div>

      {loadError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Failed to load advertisers: {loadError}
        </div>
      ) : null}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div>
          <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1">Reporting window</label>
          <div className="inline-flex rounded-md border border-gray-300 overflow-hidden">
            {DAYS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDays(opt.value)}
                className={[
                  'px-3 py-1.5 text-sm border-r border-gray-300 last:border-r-0 transition-colors',
                  days === opt.value ? 'bg-[#1a2a44] text-white' : 'bg-white text-gray-700 hover:bg-gray-50',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 sm:ml-auto">
          <button
            type="button"
            onClick={selectAllSendable}
            disabled={loading || sendable.length === 0}
            className="text-xs text-[#1a2a44] hover:underline disabled:text-gray-400 disabled:no-underline"
          >
            Select all sendable
          </button>
          <span className="text-gray-300">·</span>
          <button
            type="button"
            onClick={clearAll}
            disabled={selectedCount === 0}
            className="text-xs text-gray-500 hover:underline disabled:text-gray-300 disabled:no-underline"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Advertiser list */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2 animate-pulse">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-5 bg-gray-200 rounded w-full" />
            ))}
          </div>
        ) : advertisers.length === 0 ? (
          <p className="p-4 text-sm text-gray-400">No advertisers yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {advertisers.map((a) => {
              const email = (a.contact_email || '').trim();
              const canSend = email.length > 0;
              const isChecked = selected.has(a.id);
              return (
                <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={!canSend}
                    onChange={() => toggle(a.id)}
                    className="h-4 w-4 disabled:opacity-40"
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${canSend ? 'text-gray-900' : 'text-gray-400'}`}>
                      {a.name}
                      <span className="ml-2 text-[10px] font-normal uppercase tracking-wider text-gray-400">
                        {publicationLabel(a.publication)}
                      </span>
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {canSend ? email : 'No contact email — add one on the Advertisers page to send'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => setDrawer({ advertiser: a, mode: 'view' })}
                      disabled={!canSend}
                      className="text-xs font-medium text-[#1a2a44] hover:underline disabled:text-gray-300 disabled:no-underline"
                      title={canSend ? 'Preview the report email' : 'Add a contact email to preview'}
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => setDrawer({ advertiser: a, mode: 'edit' })}
                      disabled={!canSend}
                      className="text-xs font-medium text-[#1a2a44] hover:underline disabled:text-gray-300 disabled:no-underline"
                      title={canSend ? 'Customize and send to this advertiser' : 'Add a contact email to send'}
                    >
                      Edit
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Optional message */}
      <div>
        <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1">
          Optional message (added to each email)
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="e.g. Thanks for advertising with us this month — here's how your placement performed."
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
        />
      </div>

      {/* Send */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || selectedCount === 0}
          className="bg-[#1a2a44] hover:bg-[#243556] text-white px-5 py-2.5 rounded-md text-sm font-medium disabled:opacity-40"
        >
          {sending ? 'Sending…' : `Send ${selectedCount || ''} report${selectedCount === 1 ? '' : 's'}`}
        </button>
        {sendError ? <span className="text-sm text-red-700">{sendError}</span> : null}
      </div>

      {/* Per-row drawer (View / Edit) */}
      {drawer ? (
        <AdvertiserReportDrawer
          advertiser={drawer.advertiser}
          mode={drawer.mode}
          initialDays={days}
          initialMessage={message}
          onClose={() => setDrawer(null)}
        />
      ) : null}

      {/* Results */}
      {results ? (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-700">
            {results.filter((r) => r.sent).length} sent · {results.filter((r) => !r.sent).length} failed
          </div>
          <ul className="divide-y divide-gray-100">
            {results.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className={r.sent ? 'text-emerald-600' : 'text-red-600'}>
                  {r.sent ? '✓' : '✕'}
                </span>
                <span className="flex-1 text-gray-900">{r.name}</span>
                <span className="text-xs text-gray-500">
                  {r.sent ? r.recipient : r.error}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
