// app/admin/reports/_components/AdvertiserReportDrawer.tsx
//
// Right-side drawer for previewing and (optionally) editing a single advertiser's
// performance report before sending. Drives the per-row "View" and "Edit" actions
// on AdvertisersReportTab.
//
//   mode="view"  -> read-only preview of the rendered HTML email
//   mode="edit"  -> editable date range + personal message, refresh preview,
//                   then "Send to this advertiser" via /api/admin/advertisers/[id]/send-report
//
// Backed by the existing endpoint: POST /api/admin/advertisers/[id]/send-report
//   - { preview: true, from, to, message? }  -> { html, text, recipient }
//   - { preview: false, from, to, message? } -> { sent: true, recipient }

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  contact_email: string | null;
}

interface Props {
  advertiser: Advertiser;
  mode: 'view' | 'edit';
  initialDays: DaysOption;
  initialMessage?: string;
  onClose: () => void;
  onSent?: (advertiserId: number, recipient: string) => void;
}

function rangeFromDays(days: DaysOption): { from: string; to: string } {
  const to = new Date();
  to.setUTCHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  from.setUTCHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function AdvertiserReportDrawer({
  advertiser,
  mode,
  initialDays,
  initialMessage = '',
  onClose,
  onSent,
}: Props) {
  const [days, setDays] = useState<DaysOption>(initialDays);
  const [message, setMessage] = useState<string>(initialMessage);

  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [recipient, setRecipient] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState<boolean>(true);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [sending, setSending] = useState<boolean>(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentRecipient, setSentRecipient] = useState<string | null>(null);

  const canSend = (advertiser.contact_email || '').trim().length > 0;

  const fetchPreview = useCallback(async () => {
    setLoadingPreview(true);
    setPreviewError(null);
    try {
      const { from, to } = rangeFromDays(days);
      const res = await fetch(`/api/admin/advertisers/${advertiser.id}/send-report`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preview: true,
          from,
          to,
          message: message.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || data?.error || `${res.status}`);
      setPreviewHtml(data.html as string);
      setRecipient((data.recipient as string | null) || null);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'preview failed');
      setPreviewHtml(null);
    } finally {
      setLoadingPreview(false);
    }
  }, [advertiser.id, days, message]);

  // Load preview on open. In view mode, also re-load if days changes (we don't
  // expose the picker in view mode, so this effectively just runs once). In
  // edit mode, the admin clicks "Refresh preview" to re-render.
  useEffect(() => {
    fetchPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advertiser.id]);

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Write the HTML into the iframe via srcdoc; using srcdoc keeps the email's
  // own <style> isolated from the admin UI.
  const srcDoc = useMemo(() => previewHtml || '', [previewHtml]);

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setSendError(null);
    try {
      const { from, to } = rangeFromDays(days);
      const res = await fetch(`/api/admin/advertisers/${advertiser.id}/send-report`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preview: false,
          from,
          to,
          message: message.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.sent) {
        throw new Error(data?.detail || data?.error || `${res.status}`);
      }
      const r = (data.recipient as string) || advertiser.contact_email || '';
      setSentRecipient(r);
      if (onSent) onSent(advertiser.id, r);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'send failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${mode === 'view' ? 'Preview' : 'Edit'} report for ${advertiser.name}`}
        className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[640px] lg:w-[760px] bg-white shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-gray-500">
              {mode === 'view' ? 'Preview report' : 'Edit & send report'}
            </p>
            <h3 className="text-lg font-semibold text-gray-900 truncate">{advertiser.name}</h3>
            <p className="text-xs text-gray-500 truncate">
              {advertiser.contact_email
                ? `Will send to ${advertiser.contact_email}`
                : 'No contact email on file — sending is disabled.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Edit controls (edit mode only) */}
        {mode === 'edit' ? (
          <div className="px-5 py-4 border-b border-gray-200 space-y-3 bg-gray-50">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                Reporting window
              </label>
              <div className="inline-flex rounded-md border border-gray-300 overflow-hidden">
                {DAYS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDays(opt.value)}
                    className={[
                      'px-3 py-1.5 text-sm border-r border-gray-300 last:border-r-0 transition-colors',
                      days === opt.value
                        ? 'bg-[#1a2a44] text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-50',
                    ].join(' ')}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                Personal message (optional)
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="e.g. Thanks for advertising with us this month — here's how your placement performed."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={fetchPreview}
                disabled={loadingPreview}
                className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-40"
              >
                {loadingPreview ? 'Refreshing…' : 'Refresh preview'}
              </button>
              <span className="text-xs text-gray-500">
                Preview updates after each refresh.
              </span>
            </div>
          </div>
        ) : null}

        {/* Preview body */}
        <div className="flex-1 overflow-hidden bg-gray-100">
          {loadingPreview ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-500">
              Loading preview…
            </div>
          ) : previewError ? (
            <div className="p-5">
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                Failed to load preview: {previewError}
              </div>
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              title={`${advertiser.name} report preview`}
              srcDoc={srcDoc}
              sandbox="allow-same-origin"
              className="w-full h-full bg-white"
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 bg-white">
          {sentRecipient ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-center justify-between gap-3">
              <span>Report sent to {sentRecipient}.</span>
              <button
                type="button"
                onClick={onClose}
                className="text-xs font-medium underline"
              >
                Close
              </button>
            </div>
          ) : mode === 'edit' ? (
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-gray-500 min-w-0 truncate">
                {recipient ? `Recipient: ${recipient}` : null}
                {sendError ? (
                  <span className="text-red-700">{sendError}</span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !canSend || loadingPreview}
                  className="bg-[#1a2a44] hover:bg-[#243556] text-white px-5 py-2 rounded-md text-sm font-medium disabled:opacity-40"
                >
                  {sending ? 'Sending…' : 'Send to this advertiser'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
