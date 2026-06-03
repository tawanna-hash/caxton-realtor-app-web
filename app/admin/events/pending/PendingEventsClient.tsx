'use client';

/**
 * Review queue UI.
 *
 * Two sources feed the queue:
 *   - 'submission'   → advertiser self-submission via /submit-event/[token]
 *   - 'facebook-llm' → Gemini auto-extracted from a RealtyLine FB Page post
 *
 * Workflow per row:
 *   - Edit inline (title, dates, location, organizer, description)
 *   - Approve → PATCH any edits first, then POST /approve (event goes live)
 *   - Reject  → DELETE the row (gone forever; FB-LLM rows will NOT be
 *               re-detected because the unique source_post_id index blocks it)
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { adminApi } from '@/lib/admin-api';

interface PendingEvent {
  id: number;
  externalSource: 'submission' | 'facebook-llm' | string;
  externalId: string;
  publication: 'austin' | 'san_antonio';
  title: string;
  description: string | null;
  link: string | null;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  organizer: string | null;
  organizerEmail: string | null;
  website: string | null;
  imageUrl: string | null;
  confidence: number | null;
  submittedByAdvertiserId: number | null;
}

interface EditDraft {
  title: string;
  startDate: string;
  endDate: string;
  location: string;
  organizer: string;
  description: string;
  publication: 'austin' | 'san_antonio';
}

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  submission: {
    label: 'Advertiser submitted',
    cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  'facebook-llm': {
    label: 'Facebook (AI)',
    cls: 'bg-violet-50 text-violet-800 border-violet-200',
  },
};

const PUB_LABEL: Record<string, string> = {
  austin: 'RealtyLine Austin',
  san_antonio: 'Newsline San Antonio',
};

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // datetime-local wants YYYY-MM-DDTHH:mm with no timezone suffix.
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function fmtDisplay(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function PendingEventsClient() {
  const { admin, loading: authLoading } = useAdmin();
  const [items, setItems] = useState<PendingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    adminApi
      .listPendingEvents()
      .then((data) => {
        setItems((data?.events as PendingEvent[]) || []);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!admin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load-on-mount; mirrors /admin/events/page.tsx
    reload();
  }, [admin, reload]);

  const startEdit = (ev: PendingEvent) => {
    setEditingId(ev.id);
    setDraft({
      title: ev.title,
      startDate: toDatetimeLocalValue(ev.startDate),
      endDate: toDatetimeLocalValue(ev.endDate),
      location: ev.location ?? '',
      organizer: ev.organizer ?? '',
      description: ev.description ?? '',
      publication: ev.publication,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  // Save inline edits without approving. Useful when an admin wants to
  // clean up a row but isn't ready to publish yet.
  const saveEdit = async (id: number): Promise<boolean> => {
    if (!draft) return false;
    setBusyId(id);
    try {
      await adminApi.updateEvent(id, {
        title: draft.title.trim(),
        // Local datetime → ISO. Empty string = null.
        startDate: draft.startDate ? new Date(draft.startDate).toISOString() : null,
        endDate: draft.endDate ? new Date(draft.endDate).toISOString() : null,
        location: draft.location.trim() || null,
        organizer: draft.organizer.trim() || null,
        description: draft.description,
        publication: draft.publication,
      });
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveOnly = async (id: number) => {
    const ok = await saveEdit(id);
    if (ok) {
      setFlash('Saved');
      setTimeout(() => setFlash(null), 1800);
      cancelEdit();
      reload();
    }
  };

  const handleApprove = async (id: number) => {
    setBusyId(id);
    try {
      // If currently editing this row, persist the edits first.
      if (editingId === id && draft) {
        const ok = await saveEdit(id);
        if (!ok) return;
      }
      await adminApi.approvePendingEvent(id);
      setFlash('Approved — published to Calendar');
      setTimeout(() => setFlash(null), 2200);
      cancelEdit();
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id: number) => {
    if (!window.confirm('Reject and delete this submission? This cannot be undone.')) {
      return;
    }
    setBusyId(id);
    try {
      await adminApi.deleteEvent(id);
      setFlash('Rejected');
      setTimeout(() => setFlash(null), 1800);
      cancelEdit();
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  if (authLoading) {
    return <div className="p-8 text-gray-500">Loading…</div>;
  }
  if (!admin) {
    return (
      <div className="p-8">
        <Link href="/admin/login" className="text-[#021D40] underline">
          Sign in
        </Link>{' '}
        to review pending events.
      </div>
    );
  }

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
          Review queue
        </div>
        <h1
          className="text-3xl text-[#021D40]"
          style={{ fontFamily: 'Georgia, serif' }}
        >
          Pending Events
        </h1>
        <p className="text-gray-600 text-sm mt-2 max-w-2xl">
          Advertiser self-submissions and Gemini-detected events from the
          RealtyLine Facebook Page. Approve to publish to the Calendar,
          or reject to delete.
        </p>
      </div>

      {flash && (
        <div className="mb-4 px-4 py-3 rounded border border-emerald-200 bg-emerald-50 text-emerald-900 text-sm">
          {flash}
        </div>
      )}
      {error && (
        <div className="mb-4 px-4 py-3 rounded border border-red-200 bg-red-50 text-red-900 text-sm">
          {error}{' '}
          <button
            type="button"
            className="underline ml-2"
            onClick={() => setError(null)}
          >
            dismiss
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-gray-500 py-8">Loading queue…</div>
      ) : items.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-lg py-16 text-center text-gray-500">
          Nothing waiting for review. New advertiser submissions and
          Facebook auto-detections will appear here.
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((ev) => {
            const badge =
              SOURCE_BADGE[ev.externalSource] ?? {
                label: ev.externalSource,
                cls: 'bg-gray-100 text-gray-800 border-gray-200',
              };
            const isEditing = editingId === ev.id;
            const isBusy = busyId === ev.id;

            return (
              <li
                key={ev.id}
                className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden"
              >
                <div className="px-5 py-4 flex flex-wrap items-start gap-3 border-b border-gray-100">
                  <div className="flex-1 min-w-[260px]">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span
                        className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded border ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded border bg-gray-50 text-gray-700 border-gray-200">
                        {PUB_LABEL[ev.publication] ?? ev.publication}
                      </span>
                      {typeof ev.confidence === 'number' && (
                        <span
                          className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded border ${
                            ev.confidence >= 0.8
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : ev.confidence >= 0.6
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-gray-50 text-gray-700 border-gray-200'
                          }`}
                        >
                          {Math.round(ev.confidence * 100)}% conf.
                        </span>
                      )}
                    </div>
                    <div
                      className="text-lg text-[#021D40]"
                      style={{ fontFamily: 'Georgia, serif' }}
                    >
                      {ev.title}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {fmtDisplay(ev.startDate)}
                      {ev.endDate ? ` → ${fmtDisplay(ev.endDate)}` : ''}
                      {ev.location ? ` · ${ev.location}` : ''}
                    </div>
                    {ev.organizer && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        Organizer: {ev.organizer}
                      </div>
                    )}
                    {ev.link && (
                      <a
                        href={ev.link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[#021D40] underline mt-1 inline-block"
                      >
                        Source link ↗
                      </a>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {!isEditing && (
                      <button
                        type="button"
                        onClick={() => startEdit(ev)}
                        disabled={isBusy}
                        className="px-3 py-1.5 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleApprove(ev.id)}
                      disabled={isBusy}
                      className="px-3 py-1.5 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {isBusy ? 'Working…' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReject(ev.id)}
                      disabled={isBusy}
                      className="px-3 py-1.5 text-sm rounded border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>

                {ev.description && !isEditing && (
                  <div className="px-5 py-3 text-sm text-gray-700 whitespace-pre-wrap bg-gray-50/50 border-b border-gray-100">
                    {ev.description}
                  </div>
                )}

                {isEditing && draft && (
                  <div className="px-5 py-4 bg-gray-50 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <label className="text-xs text-gray-600 block">
                        Title
                        <input
                          className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded"
                          value={draft.title}
                          onChange={(e) =>
                            setDraft({ ...draft, title: e.target.value })
                          }
                        />
                      </label>
                      <label className="text-xs text-gray-600 block">
                        Publication
                        <select
                          className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded bg-white"
                          value={draft.publication}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              publication: e.target.value as 'austin' | 'san_antonio',
                            })
                          }
                        >
                          <option value="austin">RealtyLine Austin</option>
                          <option value="san_antonio">Newsline San Antonio</option>
                        </select>
                      </label>
                      <label className="text-xs text-gray-600 block">
                        Start
                        <input
                          type="datetime-local"
                          className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded"
                          value={draft.startDate}
                          onChange={(e) =>
                            setDraft({ ...draft, startDate: e.target.value })
                          }
                        />
                      </label>
                      <label className="text-xs text-gray-600 block">
                        End (optional)
                        <input
                          type="datetime-local"
                          className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded"
                          value={draft.endDate}
                          onChange={(e) =>
                            setDraft({ ...draft, endDate: e.target.value })
                          }
                        />
                      </label>
                      <label className="text-xs text-gray-600 block md:col-span-2">
                        Location
                        <input
                          className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded"
                          value={draft.location}
                          onChange={(e) =>
                            setDraft({ ...draft, location: e.target.value })
                          }
                        />
                      </label>
                      <label className="text-xs text-gray-600 block md:col-span-2">
                        Organizer
                        <input
                          className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded"
                          value={draft.organizer}
                          onChange={(e) =>
                            setDraft({ ...draft, organizer: e.target.value })
                          }
                        />
                      </label>
                      <label className="text-xs text-gray-600 block md:col-span-2">
                        Description
                        <textarea
                          rows={4}
                          className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded"
                          value={draft.description}
                          onChange={(e) =>
                            setDraft({ ...draft, description: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="px-3 py-1.5 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveOnly(ev.id)}
                        disabled={isBusy}
                        className="px-3 py-1.5 text-sm rounded border border-[#021D40] text-[#021D40] hover:bg-[#021D40]/5 disabled:opacity-50"
                      >
                        {isBusy ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApprove(ev.id)}
                        disabled={isBusy}
                        className="px-3 py-1.5 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {isBusy ? 'Working…' : 'Save & approve'}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
