'use client';

import { useState } from 'react';
import { AD_CHANNEL_LABEL } from '@/lib/ad-channels';
import type { AdInquiryRow, AdInquiryStatus } from '@/lib/server/ad-inquiries-store';
import QuoteBuilder from './QuoteBuilder';
import BookingBuilder from './BookingBuilder';

interface Props {
  inquiry: AdInquiryRow;
  onUpdated: (next: AdInquiryRow) => void;
  onClose: () => void;
}

const STATUSES: readonly AdInquiryStatus[] = [
  'new',
  'replied',
  'quoted',
  'won',
  'lost',
  'spam',
] as const;

const STATUS_LABEL: Record<AdInquiryStatus, string> = {
  new: 'New',
  replied: 'Replied',
  quoted: 'Quoted',
  won: 'Won',
  lost: 'Lost',
  spam: 'Spam',
};

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function InquiryDetail({ inquiry, onUpdated, onClose }: Props) {
  const [notes, setNotes] = useState<string>(inquiry.notes ?? '');
  const [assignee, setAssignee] = useState<string>(inquiry.assignee ?? '');
  const [saving, setSaving] = useState<boolean>(false);
  const [savedFlag, setSavedFlag] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>, label: string) {
    setSaving(true);
    setError(null);
    setSavedFlag(null);
    try {
      const res = await fetch(`/api/admin/ads/inquiries/${inquiry.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error || `Save failed (${res.status})`);
      }
      const json = (await res.json()) as { inquiry: AdInquiryRow };
      onUpdated(json.inquiry);
      setSavedFlag(label);
      window.setTimeout(() => setSavedFlag(null), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const replyHref = (() => {
    const subject = encodeURIComponent(
      `Re: ${AD_CHANNEL_LABEL[inquiry.channel]} inquiry${
        inquiry.slot_label ? ` — ${inquiry.slot_label}` : ''
      }`,
    );
    return `mailto:${encodeURIComponent(inquiry.email)}?subject=${subject}`;
  })();

  return (
    <div>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-500 font-medium">
            {AD_CHANNEL_LABEL[inquiry.channel]} inquiry
          </p>
          <h2 className="text-lg font-semibold text-gray-900">{inquiry.name}</h2>
          {inquiry.company && (
            <p className="text-sm text-gray-700">{inquiry.company}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-500 hover:text-gray-800 text-sm"
          aria-label="Close detail"
        >
          ✕
        </button>
      </div>

      <dl className="text-sm text-gray-700 space-y-1 mb-4">
        <div className="flex gap-2">
          <dt className="w-20 text-gray-500">Email</dt>
          <dd className="font-mono text-xs break-all">
            <a href={`mailto:${inquiry.email}`} className="text-blue-700 hover:underline">
              {inquiry.email}
            </a>
          </dd>
        </div>
        {inquiry.phone && (
          <div className="flex gap-2">
            <dt className="w-20 text-gray-500">Phone</dt>
            <dd>
              <a href={`tel:${inquiry.phone}`} className="text-blue-700 hover:underline">
                {inquiry.phone}
              </a>
            </dd>
          </div>
        )}
        {inquiry.publication && (
          <div className="flex gap-2">
            <dt className="w-20 text-gray-500">Pub</dt>
            <dd className="capitalize">{inquiry.publication}</dd>
          </div>
        )}
        {(inquiry.slot_label || inquiry.slot_slug) && (
          <div className="flex gap-2">
            <dt className="w-20 text-gray-500">Slot</dt>
            <dd>
              {inquiry.slot_label || inquiry.slot_slug}
              {inquiry.slot_slug && inquiry.slot_label && (
                <span className="text-xs text-gray-500 ml-1">
                  ({inquiry.slot_slug})
                </span>
              )}
            </dd>
          </div>
        )}
        {inquiry.package_id && (
          <div className="flex gap-2">
            <dt className="w-20 text-gray-500">Package</dt>
            <dd className="font-mono text-xs">{inquiry.package_id}</dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="w-20 text-gray-500">Received</dt>
          <dd>{formatTimestamp(inquiry.created_at)}</dd>
        </div>
        {inquiry.replied_at && (
          <div className="flex gap-2">
            <dt className="w-20 text-gray-500">Replied</dt>
            <dd>{formatTimestamp(inquiry.replied_at)}</dd>
          </div>
        )}
        {inquiry.converted_at && (
          <div className="flex gap-2">
            <dt className="w-20 text-gray-500">Won</dt>
            <dd>{formatTimestamp(inquiry.converted_at)}</dd>
          </div>
        )}
        {inquiry.lost_at && (
          <div className="flex gap-2">
            <dt className="w-20 text-gray-500">Lost</dt>
            <dd>{formatTimestamp(inquiry.lost_at)}</dd>
          </div>
        )}
      </dl>

      <div className="mb-4">
        <p className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-1">
          Message
        </p>
        <p className="text-sm text-gray-900 whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded p-3">
          {inquiry.message}
        </p>
      </div>

      {/* Status pipeline */}
      <div className="mb-4">
        <p className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-1.5">
          Status
        </p>
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => {
            const active = inquiry.status === s;
            return (
              <button
                key={s}
                type="button"
                disabled={saving || active}
                onClick={() => patch({ status: s }, 'Status updated')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                  active
                    ? 'bg-gray-900 text-white border-gray-900 cursor-default'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                }`}
              >
                {STATUS_LABEL[s]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Takeover toggle — flags this lead for admin-assisted manual booking
          instead of self-serve. PR G wires the actual order creation flow. */}
      <div className="mb-4">
        <label className="inline-flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={inquiry.takeover}
            disabled={saving}
            onChange={(e) =>
              patch({ takeover: e.target.checked }, 'Takeover updated')
            }
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm">
            <span className="font-medium text-gray-900">Take over manually</span>
            <span className="block text-xs text-gray-600">
              Admin will create the order. Self-serve checkout is paused for this lead.
            </span>
          </span>
        </label>
      </div>

      {/* Assignee */}
      <div className="mb-4">
        <label
          htmlFor="assignee"
          className="block text-xs uppercase tracking-wider text-gray-500 font-medium mb-1"
        >
          Assignee
        </label>
        <div className="flex gap-2">
          <input
            id="assignee"
            type="text"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            placeholder="e.g. tawanna@newslinesa.com"
            className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="button"
            disabled={saving || (assignee || '') === (inquiry.assignee ?? '')}
            onClick={() =>
              patch({ assignee: assignee.trim() || null }, 'Assignee saved')
            }
            className="px-3 py-1.5 rounded text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>

      {/* Notes */}
      <div className="mb-4">
        <label
          htmlFor="notes"
          className="block text-xs uppercase tracking-wider text-gray-500 font-medium mb-1"
        >
          Internal notes
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="Context for the team — left blank by default."
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <div className="flex justify-end mt-2">
          <button
            type="button"
            disabled={saving || notes === (inquiry.notes ?? '')}
            onClick={() => patch({ notes: notes.trim() || null }, 'Notes saved')}
            className="px-3 py-1.5 rounded text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Save notes
          </button>
        </div>
      </div>

      {/* Quote builder + Booking builder — Print / Email only. Digital
          uses self-serve checkout. Quote drafts an invoice for review;
          Book it creates an agreement + invoice directly. */}
      {(inquiry.channel === 'print' || inquiry.channel === 'email') && (
        <>
          <QuoteBuilder inquiry={inquiry} onQuoted={onUpdated} />
          <BookingBuilder inquiry={inquiry} onBooked={onUpdated} />
        </>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-3 mt-4 border-t border-gray-100">
        <a
          href={replyHref}
          className="inline-flex items-center px-3 py-1.5 rounded text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
        >
          Reply by email
        </a>
        {inquiry.status === 'new' && (
          <button
            type="button"
            disabled={saving}
            onClick={() => patch({ status: 'replied' }, 'Marked replied')}
            className="inline-flex items-center px-3 py-1.5 rounded text-sm font-medium border border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
          >
            Mark replied
          </button>
        )}
        {savedFlag && (
          <span className="text-xs text-green-700 font-medium">{savedFlag}</span>
        )}
        {error && (
          <span className="text-xs text-red-700 font-medium">{error}</span>
        )}
      </div>
    </div>
  );
}
