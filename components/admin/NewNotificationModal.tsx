'use client';

// components/admin/NewNotificationModal.tsx
//
// Compose modal for sending a web push notification. Fields:
//   - Title (≤60 chars recommended)
//   - Body (≤140 chars recommended)
//   - Category (issue_release / advertiser_incentive / breaking_news /
//                event_reminder / weekly_digest)
//   - Deep link URL (optional, prefilled with /dashboard)
//   - Market (All / Austin / San Antonio)
//   - Schedule (Send now / Schedule for later)
//   - Live phone-style preview of how the push will look
//
// POSTs to /api/admin/notifications. On send-now success, the parent
// refreshes the list via router.refresh().

import { useEffect, useMemo, useRef, useState } from 'react';

type Category =
  | 'issue_release'
  | 'advertiser_incentive'
  | 'breaking_news'
  | 'event_reminder'
  | 'weekly_digest';

type Market = 'all' | 'austin' | 'san_antonio' | 'houston' | 'dallas';

interface SubStats {
  total: number;
  austin: number;
  san_antonio: number;
  houston: number;
  dallas: number;
  unspecified: number;
}

export type EditableNotification = {
  id: string;
  title: string;
  body: string;
  category: Category;
  deep_link_url: string | null;
  target_audience: { market?: string; channels?: string[] } | null;
  scheduled_for: string | null;
  status: string;
};

type Props = {
  onClose: () => void;
  onSent: () => void;
  stats: SubStats;
  existing?: EditableNotification | null;
};

const CATEGORIES: Array<{ value: Category; label: string }> = [
  { value: 'breaking_news', label: 'Breaking news' },
  { value: 'issue_release', label: 'Issue release' },
  { value: 'event_reminder', label: 'Event reminder' },
  { value: 'advertiser_incentive', label: 'Advertiser incentive' },
  { value: 'weekly_digest', label: 'Weekly digest' },
];

function toLocalInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

export default function NewNotificationModal({ onClose, onSent, stats, existing }: Props) {
  const isEdit = !!existing;
  const initialMarket = ((existing?.target_audience?.market as Market | undefined) || 'all') as Market;
  const [title, setTitle] = useState(existing?.title || '');
  const [body, setBody] = useState(existing?.body || '');
  const [category, setCategory] = useState<Category>((existing?.category as Category) || 'breaking_news');
  const [deepLinkUrl, setDeepLinkUrl] = useState(existing?.deep_link_url || '/dashboard');
  const [market, setMarket] = useState<Market>(initialMarket);
  const [schedule, setSchedule] = useState<'now' | 'later'>(
    existing?.scheduled_for ? 'later' : 'now',
  );
  const [scheduledFor, setScheduledFor] = useState(toLocalInputValue(existing?.scheduled_for ?? null));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, sending]);

  const reachCount = useMemo(() => {
    if (market === 'austin') return stats.austin;
    if (market === 'san_antonio') return stats.san_antonio;
    if (market === 'houston') return stats.houston;
    if (market === 'dallas') return stats.dallas;
    return stats.total;
  }, [market, stats]);

  const titleCount = title.length;
  const bodyCount = body.length;
  const titleTooLong = titleCount > 60;
  const bodyTooLong = bodyCount > 140;

  const canSubmit =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    !sending &&
    (schedule === 'now' || (schedule === 'later' && scheduledFor));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSending(true);
    setError(null);

    try {
      const url = isEdit
        ? `/api/admin/notifications/${existing!.id}`
        : '/api/admin/notifications';
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          category,
          deepLinkUrl: deepLinkUrl.trim() || null,
          market: market === 'all' ? null : market,
          channels: ['web_push'],
          sendNow: schedule === 'now',
          scheduledFor: schedule === 'later' ? new Date(scheduledFor).toISOString() : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || 'Send failed');
        setSending(false);
        return;
      }
      onSent();
    } catch (err) {
      setError((err as Error).message || 'Network error');
      setSending(false);
    }
  }

  const sendLabel =
    schedule === 'now'
      ? `Send to ${reachCount.toLocaleString()} ${reachCount === 1 ? 'device' : 'devices'}`
      : isEdit
      ? 'Update schedule'
      : 'Schedule notification';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={() => !sending && onClose()}
    >
      <div
        className="bg-white w-full max-w-3xl rounded-xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{isEdit ? 'Edit push notification' : 'New push notification'}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Sends to {stats.total.toLocaleString()} active web push subscribers
              {stats.austin || stats.san_antonio || stats.houston || stats.dallas
                ? ` (Austin ${stats.austin}, San Antonio ${stats.san_antonio}, Houston ${stats.houston}, Dallas ${stats.dallas})`
                : ''}
              .
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none p-1"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="grid md:grid-cols-2 gap-6 p-6">
            {/* Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  ref={titleRef}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. New issue: October 2026"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#301D5D] focus:border-transparent"
                  disabled={sending}
                />
                <div
                  className={`text-xs mt-1 ${
                    titleTooLong ? 'text-red-600 font-medium' : 'text-gray-500'
                  }`}
                >
                  {titleCount}/60
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Body <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={3}
                  placeholder="e.g. Tap to read this month's San Antonio cover story."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#301D5D] focus:border-transparent resize-none"
                  disabled={sending}
                />
                <div
                  className={`text-xs mt-1 ${
                    bodyTooLong ? 'text-red-600 font-medium' : 'text-gray-500'
                  }`}
                >
                  {bodyCount}/140
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Category)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#301D5D]"
                  disabled={sending}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Deep link
                </label>
                <input
                  type="text"
                  value={deepLinkUrl}
                  onChange={(e) => setDeepLinkUrl(e.target.value)}
                  placeholder="/dashboard"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#301D5D]"
                  disabled={sending}
                />
                <div className="text-xs text-gray-500 mt-1">
                  Where the user lands when they tap. Defaults to the feed.
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Audience</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { v: 'all', label: `All (${stats.total})` },
                    { v: 'austin', label: `Austin (${stats.austin})` },
                    { v: 'san_antonio', label: `San Antonio (${stats.san_antonio})` },
                    { v: 'houston', label: `Houston (${stats.houston})` },
                    { v: 'dallas', label: `Dallas (${stats.dallas})` },
                  ] as Array<{ v: Market; label: string }>).map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setMarket(opt.v)}
                      disabled={sending}
                      className={`px-3 py-2 rounded-md text-sm border transition-colors ${
                        market === opt.v
                          ? 'bg-[#301D5D] text-white border-[#301D5D]'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Timing</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSchedule('now')}
                    disabled={sending}
                    className={`flex-1 px-3 py-2 rounded-md text-sm border transition-colors ${
                      schedule === 'now'
                        ? 'bg-[#301D5D] text-white border-[#301D5D]'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    Send now
                  </button>
                  <button
                    type="button"
                    onClick={() => setSchedule('later')}
                    disabled={sending}
                    className={`flex-1 px-3 py-2 rounded-md text-sm border transition-colors ${
                      schedule === 'later'
                        ? 'bg-[#301D5D] text-white border-[#301D5D]'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    Schedule
                  </button>
                </div>
                {schedule === 'later' && (
                  <input
                    type="datetime-local"
                    value={scheduledFor}
                    onChange={(e) => setScheduledFor(e.target.value)}
                    className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#301D5D]"
                    disabled={sending}
                  />
                )}
              </div>
            </div>

            {/* Preview */}
            <div>
              <div className="text-sm font-medium text-gray-700 mb-2">Preview</div>
              <div className="bg-gray-100 rounded-xl p-4">
                <div className="bg-white rounded-lg shadow-md p-3 flex gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-md bg-[#301D5D] text-white text-xs font-bold flex items-center justify-center">
                    RNN
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="text-xs font-semibold text-gray-900 uppercase tracking-wide truncate">
                        Realty News Now
                      </div>
                      <div className="text-[10px] text-gray-400">now</div>
                    </div>
                    <div className="text-sm font-semibold text-gray-900 line-clamp-2 mt-0.5">
                      {title || 'Notification title appears here'}
                    </div>
                    <div className="text-xs text-gray-600 line-clamp-3 mt-0.5">
                      {body || 'Body copy preview appears here. Keep it under 140 characters for best display.'}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-gray-500 mt-3 text-center">
                  Tapping opens: <span className="font-mono">{deepLinkUrl || '/dashboard'}</span>
                </div>
              </div>

              <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-600 space-y-1">
                <div>
                  <span className="font-semibold">Audience:</span>{' '}
                  {market === 'all'
                    ? 'All markets'
                    : market === 'austin'
                    ? 'Austin only'
                    : market === 'san_antonio'
                    ? 'San Antonio only'
                    : market === 'houston'
                    ? 'Houston only'
                    : 'Dallas only'}
                </div>
                <div>
                  <span className="font-semibold">Reach:</span>{' '}
                  {reachCount.toLocaleString()} {reachCount === 1 ? 'device' : 'devices'}
                </div>
                <div>
                  <span className="font-semibold">Category:</span>{' '}
                  {CATEGORIES.find((c) => c.value === category)?.label}
                </div>
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          </div>

          <footer className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex items-center justify-between gap-3">
            <div className="text-xs text-gray-500">
              {schedule === 'now' && reachCount === 0
                ? 'No active subscribers in this segment yet.'
                : `${reachCount.toLocaleString()} ${reachCount === 1 ? 'device' : 'devices'} will receive this notification.`}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={sending}
                className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit || titleTooLong || bodyTooLong}
                className="px-4 py-2 rounded-md text-sm font-medium text-white bg-[#301D5D] hover:bg-[#493676] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {sending ? 'Sending...' : sendLabel}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}
