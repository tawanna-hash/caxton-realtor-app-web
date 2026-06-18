'use client';

// app/admin/notifications/NotificationsClient.tsx
//
// Notifications admin client. Renders the list of past notifications and
// the "New notification" CTA that opens the compose modal. The modal
// collects title/body/link/category/market/schedule, shows a live preview,
// and POSTs to /api/admin/notifications.

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import NewNotificationModal from '@/components/admin/NewNotificationModal';

type Status = 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled';

interface Notification {
  id: string;
  category: string;
  title: string;
  body: string;
  deep_link_url: string | null;
  target_audience: { market?: string; channels?: string[] } | null;
  scheduled_for: string | null;
  sent_at: string | null;
  status: string;
  created_at: string;
  delivered_count: number;
  clicked_count: number;
}

interface SubStats {
  total: number;
  austin: number;
  san_antonio: number;
  unspecified: number;
}

type Props = {
  initialNotifications: Notification[];
  initialStats: SubStats;
};

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    draft:     { bg: '#e5e7eb', fg: '#374151', label: 'Draft' },
    scheduled: { bg: '#fef3c7', fg: '#92400e', label: 'Scheduled' },
    sending:   { bg: '#dbeafe', fg: '#1e40af', label: 'Sending' },
    sent:      { bg: '#dcfce7', fg: '#166534', label: 'Sent' },
    cancelled: { bg: '#fee2e2', fg: '#991b1b', label: 'Cancelled' },
  };
  const s = map[status] || map.draft;
  return (
    <span
      className="inline-block text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

function formatCategory(c: string): string {
  return c.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function NotificationsClient({ initialNotifications, initialStats }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications] = useState(initialNotifications);

  const subscriberSummary = useMemo(() => {
    const parts: string[] = [];
    parts.push(`${initialStats.total.toLocaleString()} active subscribers`);
    if (initialStats.austin) parts.push(`${initialStats.austin.toLocaleString()} Austin`);
    if (initialStats.san_antonio) parts.push(`${initialStats.san_antonio.toLocaleString()} San Antonio`);
    return parts.join(' · ');
  }, [initialStats]);

  const onSent = useCallback(() => {
    setOpen(false);
    router.refresh();
  }, [router]);

  return (
    <>
      <section className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="text-sm text-gray-600">{subscriberSummary}</div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center justify-center px-4 py-2 rounded-md text-white font-medium text-sm bg-[#021D40] hover:bg-[#03285a] transition-colors"
        >
          New notification
        </button>
      </section>

      <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {notifications.length === 0 ? (
          <div className="p-10 text-center text-gray-500">
            No notifications yet. Click <span className="font-medium">New notification</span> to send the first one.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Title</th>
                <th className="text-left px-4 py-3 font-medium">Category</th>
                <th className="text-left px-4 py-3 font-medium">Market</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Delivered</th>
                <th className="text-left px-4 py-3 font-medium">Clicks</th>
                <th className="text-left px-4 py-3 font-medium">Sent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {notifications.map((n) => (
                <tr key={n.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 line-clamp-1">{n.title}</div>
                    <div className="text-gray-500 text-xs line-clamp-1">{n.body}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{formatCategory(n.category)}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {n.target_audience?.market === 'all'
                      ? 'All'
                      : n.target_audience?.market === 'austin'
                      ? 'Austin'
                      : n.target_audience?.market === 'san_antonio'
                      ? 'San Antonio'
                      : '—'}
                  </td>
                  <td className="px-4 py-3"><StatusPill status={n.status} /></td>
                  <td className="px-4 py-3 text-gray-700">{n.delivered_count}</td>
                  <td className="px-4 py-3 text-gray-700">{n.clicked_count}</td>
                  <td className="px-4 py-3 text-gray-700 text-xs">{formatDate(n.sent_at || n.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {open && (
        <NewNotificationModal
          onClose={() => setOpen(false)}
          onSent={onSent}
          stats={initialStats}
        />
      )}
    </>
  );
}
