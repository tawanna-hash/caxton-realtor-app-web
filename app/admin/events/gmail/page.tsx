'use client';

// Gmail event review queue.
//
// The scanner (lib/server/gmail-event-scanner.ts) drops Gemini detections here
// as hidden events; approving one flips hidden=false and it appears on the
// public calendar for its publication. Rejecting deletes the row.
//
// Styling and data-loading follow app/admin/events/page.tsx so the two review
// surfaces stay visually consistent.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAdmin } from '@/hooks/use-admin';
import { adminApi } from '@/lib/admin-api';
import PageTitle from '@/components/ui/PageTitle';
import { PUBLICATION_FILTER_LABELS, type PublicationId } from '@/lib/publications';

type GmailEvent = {
  id: number;
  externalId: string;
  publication: PublicationId;
  title: string;
  description: string;
  link: string;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  organizer: string | null;
  organizerEmail: string | null;
  confidence: number | null;
};

type Mailbox = { emailAddress: string; scope: string; updatedAt: string | null } | null;

type SourceEmail = {
  messageId: string;
  subject: string;
  from: string;
  receivedAt: string | null;
  body: string;
};

type ScanCounts = {
  scanned: number;
  detected: number;
  inserted: number;
  skippedDuplicate: number;
  skippedNoDate: number;
  errors: number;
};

const PUB_OPTIONS: PublicationId[] = ['austin', 'san_antonio'];

// Google's error codes are terse; map the ones an admin can actually act on.
const OAUTH_ERRORS: Record<string, string> = {
  access_denied: 'Google sign-in was cancelled. Nothing was connected.',
  missing_code: 'Google did not return an authorization code. Try connecting again.',
  exchange_failed:
    'Could not exchange the Google authorization code for a token. Check the ' +
    'OAuth client configuration and redirect URI, then try again.',
};

function formatWhen(start: string | null, end: string | null): string {
  if (!start) return 'Date TBD';
  const opts: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago',
  };
  const s = new Date(start).toLocaleString('en-US', opts);
  if (!end) return s;
  const e = new Date(end).toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago',
  });
  return `${s} – ${e}`;
}

/** Strip the display name off `Name <user@host>` for the table cell. */
function senderAddress(from: string | null): string {
  if (!from) return '—';
  const m = /<([^>]+)>/.exec(from);
  return (m ? m[1] : from).trim();
}

function confidenceStyle(c: number): string {
  if (c >= 0.75) return 'bg-green-100 text-green-800';
  if (c >= 0.5) return 'bg-amber-100 text-amber-800';
  return 'bg-gray-100 text-gray-700';
}

export default function GmailEventsPage() {
  const { admin, loading: authLoading } = useAdmin();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<GmailEvent[]>([]);
  const [mailbox, setMailbox] = useState<Mailbox>(null);
  const [oauthConfigured, setOauthConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);

  const [drawerFor, setDrawerFor] = useState<GmailEvent | null>(null);
  const [source, setSource] = useState<SourceEmail | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);

  const connectedFlag = searchParams.get('connected') === '1';
  const oauthError = searchParams.get('error');

  const reload = useCallback(() => {
    setLoading(true);
    adminApi
      .listPendingGmailEvents()
      .then((data) => {
        setItems(data?.events || []);
        setMailbox(data?.mailbox ?? null);
        setOauthConfigured(data?.oauthConfigured !== false);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!admin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load-on-mount; mirrors app/admin/events/page.tsx
    reload();
  }, [admin, reload]);

  const handleApprove = async (ev: GmailEvent) => {
    setBusyId(ev.id);
    try {
      await adminApi.approvePendingEvent(ev.id);
      setToast(`Approved "${ev.title}" — now live on the ${PUBLICATION_FILTER_LABELS[ev.publication]} calendar.`);
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (ev: GmailEvent) => {
    if (!window.confirm(`Reject "${ev.title}"? The queued event is deleted.`)) return;
    setBusyId(ev.id);
    try {
      await adminApi.rejectGmailEvent(ev.id);
      setToast(`Rejected "${ev.title}".`);
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const handlePublicationChange = async (ev: GmailEvent, publication: PublicationId) => {
    if (publication === ev.publication) return;
    setBusyId(ev.id);
    try {
      await adminApi.updateEvent(ev.id, { publication });
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleScan = async () => {
    setScanning(true);
    setToast(null);
    try {
      const res = await adminApi.scanGmailNow();
      const c: ScanCounts = res?.result ?? {
        scanned: 0, detected: 0, inserted: 0, skippedDuplicate: 0, skippedNoDate: 0, errors: 0,
      };
      setToast(
        `Scan complete — ${c.scanned} message${c.scanned === 1 ? '' : 's'} read, ` +
        `${c.detected} event${c.detected === 1 ? '' : 's'} detected, ${c.inserted} queued ` +
        `(${c.skippedDuplicate} already seen, ${c.skippedNoDate} without a usable date, ` +
        `${c.errors} error${c.errors === 1 ? '' : 's'}).`,
      );
      reload();
    } catch (err) {
      setToast(null);
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  };

  const openDrawer = async (ev: GmailEvent) => {
    setDrawerFor(ev);
    setSource(null);
    setSourceError(null);
    try {
      setSource(await adminApi.getGmailEventSource(ev.id));
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : String(err));
    }
  };

  if (authLoading || !admin) {
    return <div className="max-w-6xl mx-auto px-6 py-12 text-sm text-gray-500">Loading...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <PageTitle size="md">Gmail Event Review</PageTitle>
          <p className="text-sm text-gray-500 mt-1">
            Events the scanner found in mail from advertisers and curated association
            domains. Approving publishes to the public calendar for the selected publication.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {mailbox && (
            <button
              type="button"
              onClick={handleScan}
              disabled={scanning}
              className="px-4 py-2 bg-brand-700 text-white text-sm font-medium rounded-md hover:bg-brand-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {scanning ? 'Scanning…' : 'Scan now'}
            </button>
          )}
          <a
            href="/api/admin/gmail-auth/start"
            className={
              mailbox
                ? 'px-4 py-2 bg-white text-brand-700 text-sm font-medium rounded-md border border-brand-700 hover:bg-gray-50 transition-colors whitespace-nowrap'
                : 'px-4 py-2 bg-brand-700 text-white text-sm font-medium rounded-md hover:bg-brand-700 transition-colors whitespace-nowrap'
            }
          >
            {mailbox ? 'Reconnect' : 'Connect Gmail'}
          </a>
        </div>
      </div>

      <div className="mb-4 text-sm">
        {mailbox ? (
          <span className="inline-flex items-center gap-2 text-gray-700">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
            Connected as <span className="font-medium">{mailbox.emailAddress}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 text-gray-700">
            <span className="inline-block w-2 h-2 rounded-full bg-gray-400" />
            No mailbox connected — the daily scan has nothing to read.
          </span>
        )}
      </div>

      {!oauthConfigured && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-md mb-4">
          Google OAuth is not configured on this deployment. Set{' '}
          <code>GOOGLE_OAUTH_CLIENT_ID</code> and <code>GOOGLE_OAUTH_CLIENT_SECRET</code>,
          then redeploy. See <code>docs/GMAIL_EVENT_SCANNER.md</code>.
        </div>
      )}

      {connectedFlag && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3 rounded-md mb-4">
          Gmail connected. Run &ldquo;Scan now&rdquo; to pull the last 30 days of event mail.
        </div>
      )}

      {oauthError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-md mb-4">
          {OAUTH_ERRORS[oauthError] ?? `Gmail connection failed (${oauthError}).`}
        </div>
      )}

      {toast && (
        <div className="bg-brand-700/5 border border-brand-700/20 text-gray-800 text-sm px-4 py-3 rounded-md mb-4 flex items-start justify-between gap-4">
          <span>{toast}</span>
          <button type="button" onClick={() => setToast(null)} className="text-gray-500 hover:text-gray-800">
            ×
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-md mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500 py-12 text-center">Loading queue...</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-gray-500 py-12 text-center bg-white border border-gray-200 rounded-md">
          Nothing awaiting review. The scanner runs daily; use &ldquo;Scan now&rdquo; to check immediately.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Event</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">When</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Location</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Host</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Publication</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Source Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Confidence</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((ev) => (
                <tr key={ev.id}>
                  <td className="px-4 py-3 max-w-xs">
                    <div className="font-medium text-gray-900">{ev.title}</div>
                    {ev.description && (
                      <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{ev.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                    {ev.startDate ? (
                      formatWhen(ev.startDate, ev.endDate)
                    ) : (
                      <span className="text-amber-700">Date TBD</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700 max-w-[14rem]">{ev.location || '—'}</td>
                  <td className="px-4 py-3 text-gray-700 max-w-[12rem]">{ev.organizer || '—'}</td>
                  <td className="px-4 py-3">
                    <label className="sr-only" htmlFor={`pub-${ev.id}`}>
                      Publication for {ev.title}
                    </label>
                    <select
                      id={`pub-${ev.id}`}
                      value={ev.publication}
                      disabled={busyId === ev.id}
                      onChange={(e) => handlePublicationChange(ev, e.target.value as PublicationId)}
                      className="text-xs font-semibold px-2 py-1 rounded-md border bg-brand-700/10 text-brand-700 border-brand-700/20 disabled:opacity-50"
                    >
                      {PUB_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {PUBLICATION_FILTER_LABELS[p]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => openDrawer(ev)}
                      className="text-xs text-brand-700 hover:underline text-left break-all"
                    >
                      {senderAddress(ev.organizerEmail)}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${confidenceStyle(ev.confidence ?? 0)}`}
                    >
                      {ev.confidence === null ? '—' : `${Math.round(ev.confidence * 100)}%`}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => handleApprove(ev)}
                      disabled={busyId === ev.id}
                      className="text-xs text-green-700 hover:text-green-900 font-medium mr-3 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <Link
                      href={`/admin/events/${ev.id}`}
                      className="text-xs text-brand-700 hover:underline mr-3"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => handleReject(ev)}
                      disabled={busyId === ev.id}
                      className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {drawerFor && (
        <SourceDrawer
          event={drawerFor}
          source={source}
          error={sourceError}
          onClose={() => setDrawerFor(null)}
        />
      )}
    </div>
  );
}

function SourceDrawer({
  event,
  source,
  error,
  onClose,
}: {
  event: GmailEvent;
  source: SourceEmail | null;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close source email"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <aside className="relative w-full max-w-xl h-full bg-white shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-gray-500">Source email</div>
            <div className="font-medium text-gray-900 truncate">
              {source?.subject ?? event.title}
            </div>
            {source && (
              <div className="text-xs text-gray-500 mt-1 break-all">
                {source.from}
                {source.receivedAt &&
                  ` · ${new Date(source.receivedAt).toLocaleString('en-US', { timeZone: 'America/Chicago' })}`}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-900 text-lg leading-none">
            ×
          </button>
        </div>
        <div className="px-6 py-4">
          {error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-md">
              {error}
            </div>
          ) : !source ? (
            <div className="text-sm text-gray-500">Loading email…</div>
          ) : (
            <pre className="whitespace-pre-wrap break-words text-sm text-gray-800 font-sans">
              {source.body}
            </pre>
          )}
        </div>
      </aside>
    </div>
  );
}
