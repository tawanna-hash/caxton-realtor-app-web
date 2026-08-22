'use client';

// app/admin/notifications/SubscribersSection.tsx
//
// Inline subscribers manager that lives below the notifications table.
// Supports: listing all subscriptions, changing a subscriber's market,
// revoking a subscriber, and sending a one-off test push.

import { useCallback, useEffect, useState } from 'react';

type Market = 'austin' | 'san_antonio' | 'houston' | 'dallas';
const MARKET_LABELS: Record<Market, string> = {
  austin: 'Austin',
  san_antonio: 'San Antonio',
  houston: 'Houston',
  dallas: 'Dallas',
};

interface Subscriber {
  id: string;
  realtorId: string | null;
  realtorName: string | null;
  realtorEmail: string | null;
  market: string | null;
  endpointHost: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  active: boolean;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function deviceLabel(ua: string | null): string {
  if (!ua) return 'Unknown device';
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) {
    if (/Chrome/.test(ua)) return 'Mac · Chrome';
    if (/Firefox/.test(ua)) return 'Mac · Firefox';
    if (/Safari/.test(ua)) return 'Mac · Safari';
    return 'Mac';
  }
  if (/Windows/.test(ua)) {
    if (/Chrome/.test(ua)) return 'Windows · Chrome';
    if (/Firefox/.test(ua)) return 'Windows · Firefox';
    if (/Edg/.test(ua)) return 'Windows · Edge';
    return 'Windows';
  }
  if (/Linux/.test(ua)) return 'Linux';
  return 'Other';
}

export default function SubscribersSection() {
  const [subs, setSubs] = useState<Subscriber[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRevoked, setShowRevoked] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/notifications/subscribers', {
        cache: 'no-store',
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j?.error || 'Failed to load subscribers');
        return;
      }
      setSubs(j.subscribers || []);
      setError(null);
    } catch (err) {
      setError((err as Error).message || 'Network error');
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => { void load(); });
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  async function updateMarket(sub: Subscriber, next: Market) {
    setBusy(sub.id);
    try {
      const res = await fetch(`/api/admin/notifications/subscribers/${sub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setToast(j?.error || 'Update failed');
        return;
      }
      setSubs((prev) =>
        prev ? prev.map((s) => (s.id === sub.id ? { ...s, market: next } : s)) : prev,
      );
      setToast(`Moved to ${MARKET_LABELS[next]}`);
    } finally {
      setBusy(null);
    }
  }

  async function revoke(sub: Subscriber) {
    if (!confirm(`Revoke this subscriber? They will stop receiving push notifications.`)) return;
    setBusy(sub.id);
    try {
      const res = await fetch(`/api/admin/notifications/subscribers/${sub.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setToast(j?.error || 'Revoke failed');
        return;
      }
      setSubs((prev) =>
        prev
          ? prev.map((s) =>
              s.id === sub.id
                ? { ...s, revokedAt: new Date().toISOString(), active: false }
                : s,
            )
          : prev,
      );
      setToast('Subscriber revoked');
    } finally {
      setBusy(null);
    }
  }

  async function sendTest(sub: Subscriber) {
    setBusy(sub.id);
    try {
      const res = await fetch(
        `/api/admin/notifications/subscribers/${sub.id}/test-push`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast(j?.error || 'Test failed');
        return;
      }
      if (j.ok) {
        setToast('Test push sent — check the device.');
      } else if (j.gone) {
        setToast('Endpoint is dead (410). Subscriber auto-revoked.');
        setSubs((prev) =>
          prev
            ? prev.map((s) =>
                s.id === sub.id
                  ? { ...s, revokedAt: new Date().toISOString(), active: false }
                  : s,
              )
            : prev,
        );
      } else {
        setToast(`Send failed: ${j.error || 'unknown'}`);
      }
    } finally {
      setBusy(null);
    }
  }

  if (subs === null) {
    return (
      <section className="mt-10">
        <h2 className="text-base font-semibold text-gray-900 mb-2">Subscribers</h2>
        <div className="text-sm text-gray-500">Loading…</div>
      </section>
    );
  }

  const visible = showRevoked ? subs : subs.filter((s) => s.active);
  const activeCount = subs.filter((s) => s.active).length;

  return (
    <section className="mt-10">
      <div className="flex items-end justify-between gap-4 mb-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Subscribers</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {activeCount} active · {subs.length - activeCount} revoked
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={showRevoked}
            onChange={(e) => setShowRevoked(e.target.checked)}
            className="rounded"
          />
          Show revoked
        </label>
      </div>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {visible.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            No subscribers yet.
          </div>
        ) : (
          <>
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">User</th>
                  <th className="text-left px-4 py-3 font-medium">Device</th>
                  <th className="text-left px-4 py-3 font-medium">Market</th>
                  <th className="text-left px-4 py-3 font-medium">Subscribed</th>
                  <th className="text-left px-4 py-3 font-medium">Last seen</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((sub) => (
                  <tr
                    key={sub.id}
                    className={`hover:bg-gray-50 ${sub.active ? '' : 'opacity-60'}`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 text-sm">
                        {sub.realtorName || (
                          <span className="text-gray-500 italic">Anonymous</span>
                        )}
                      </div>
                      {sub.realtorEmail && (
                        <div className="text-xs text-gray-500">{sub.realtorEmail}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-xs">
                      {deviceLabel(sub.userAgent)}
                      {sub.endpointHost && (
                        <div className="text-gray-400">{sub.endpointHost}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={sub.market || ''}
                        onChange={(e) => updateMarket(sub, e.target.value as Market)}
                        disabled={!sub.active || busy === sub.id}
                        className="text-xs border border-gray-300 rounded px-2 py-1 bg-white disabled:opacity-50"
                      >
                        <option value="" disabled>
                          Unset
                        </option>
                        {(Object.keys(MARKET_LABELS) as Market[]).map((m) => (
                          <option key={m} value={m}>
                            {MARKET_LABELS[m]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-xs">
                      {formatDate(sub.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-xs">
                      {formatDate(sub.lastSeenAt)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {sub.active ? (
                        <div className="inline-flex gap-3">
                          <button
                            type="button"
                            onClick={() => sendTest(sub)}
                            disabled={busy === sub.id}
                            className="text-xs font-medium text-brand-700 hover:underline disabled:opacity-50"
                          >
                            {busy === sub.id ? 'Sending…' : 'Send test'}
                          </button>
                          <button
                            type="button"
                            onClick={() => revoke(sub)}
                            disabled={busy === sub.id}
                            className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                          >
                            Revoke
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Revoked</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile card list. */}
          <ul className="sm:hidden divide-y divide-gray-100">
            {visible.map((sub) => (
              <li
                key={sub.id}
                className={`px-4 py-3 space-y-2 ${sub.active ? '' : 'opacity-60'}`}
              >
                <div>
                  <div className="font-medium text-gray-900 text-sm">
                    {sub.realtorName || <span className="text-gray-500 italic">Anonymous</span>}
                  </div>
                  {sub.realtorEmail && (
                    <div className="text-xs text-gray-500 break-all">{sub.realtorEmail}</div>
                  )}
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-gray-500 uppercase tracking-wider">Device</dt>
                  <dd className="text-gray-800 text-right break-words">
                    {deviceLabel(sub.userAgent)}
                    {sub.endpointHost && (
                      <div className="text-gray-400">{sub.endpointHost}</div>
                    )}
                  </dd>
                  <dt className="text-gray-500 uppercase tracking-wider">Subscribed</dt>
                  <dd className="text-gray-800 text-right">{formatDate(sub.createdAt)}</dd>
                  <dt className="text-gray-500 uppercase tracking-wider">Last seen</dt>
                  <dd className="text-gray-800 text-right">{formatDate(sub.lastSeenAt)}</dd>
                </dl>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <select
                    value={sub.market || ''}
                    onChange={(e) => updateMarket(sub, e.target.value as Market)}
                    disabled={!sub.active || busy === sub.id}
                    className="text-xs border border-gray-300 rounded px-2 py-1 bg-white disabled:opacity-50"
                  >
                    <option value="" disabled>Unset</option>
                    {(Object.keys(MARKET_LABELS) as Market[]).map((m) => (
                      <option key={m} value={m}>{MARKET_LABELS[m]}</option>
                    ))}
                  </select>
                  {sub.active ? (
                    <div className="inline-flex gap-3">
                      <button
                        type="button"
                        onClick={() => sendTest(sub)}
                        disabled={busy === sub.id}
                        className="text-xs font-medium text-brand-700 hover:underline disabled:opacity-50"
                      >
                        {busy === sub.id ? 'Sending…' : 'Send test'}
                      </button>
                      <button
                        type="button"
                        onClick={() => revoke(sub)}
                        disabled={busy === sub.id}
                        className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">Revoked</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          </>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm px-4 py-2 rounded-md shadow-lg">
          {toast}
        </div>
      )}
    </section>
  );
}
