// app/admin/marketing/_components/MarketingEmailModal.tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MarketingCampaign, AudienceFilter, OutreachAudienceSource } from '@/lib/marketing-campaigns';
import RichTextEditor from './RichTextEditor';
import { upload } from '@vercel/blob/client';
import { previewFireTimes } from '@/lib/recurrence';

// Default reply-to fan-out for advertiser sales replies.
const DEFAULT_REPLY_TO = ['tawanna@myrealtyline.com', 'caroline@myrealtyline.com', 'doren@myrealtyline.com'];

// ── Types ────────────────────────────────────────────────────────────
type SubscriberFilter = {
  publication?: 'realtyline' | 'newsline';
  status?: 'active' | 'unsubscribed';
  verified?: 'valid' | 'invalid' | 'risky' | 'unknown' | 'pending' | 'unverified';
};

type SampleRow = {
  source: 'advertiser' | 'subscriber' | 'manual';
  id: number | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  publication: string | null;
};

type PreviewResponse = {
  count: number;
  sample: SampleRow[];
  by_source: { advertiser: number; subscriber: number; manual: number };
};

type Props = {
  open: boolean;
  onClose: () => void;
  campaign: MarketingCampaign;
  adminEmail: string | null;
  onSent?: () => void;
};

// ── Token reference for the helper menu ─────────────────────────────
const TOKENS = [
  { key: '{{first_name}}', label: 'Recipient first name', sample: 'Sam' },
  { key: '{{last_name}}',  label: 'Recipient last name',  sample: 'Sample' },
  { key: '{{full_name}}',  label: 'Recipient full name',  sample: 'Sam Sample' },
  { key: '{{company}}',    label: 'Recipient company',    sample: 'Acme Realty' },
  { key: '{{email}}',      label: 'Recipient email',      sample: 'sam@acme.test' },
  { key: '{{rep_name}}',   label: 'Sender (you)',         sample: 'Your name' },
  { key: '{{print_subscribers}}', label: 'Print subscribers (live)', sample: '12,500' },
  { key: '{{email_subscribers}}', label: 'Email subscribers (live)', sample: '8,200' },
];


// Map campaign publication -> brand display info. Mirrors the server-side
// brand mapping in the send + test routes so the composer preview and the
// eventual email agree.
function brandForPublication(pub: string | null | undefined): {
  key: 'realtyline' | 'newsline' | 'caxton';
  name: string;
  tagline: string;
  badgeTone: string;
} {
  switch (pub) {
    case 'san_antonio':
      return { key: 'newsline', name: 'Newsline San Antonio', tagline: 'San Antonio real estate news', badgeTone: 'bg-amber-100 text-amber-900 border-amber-300' };
    case 'both':
      return { key: 'caxton', name: 'Caxton Publications', tagline: 'RealtyLine \u00b7 Newsline San Antonio', badgeTone: 'bg-purple-100 text-purple-900 border-purple-300' };
    default:
      return { key: 'realtyline', name: 'RealtyLine', tagline: 'Advertise Where REALTORS\u00ae Flip The Pages', badgeTone: 'bg-blue-100 text-blue-900 border-blue-300' };
  }
}

// ── Token substitution (mirrors lib/marketing-email.ts) ─────────────
function substituteTokens(input: string, ctx: Record<string, string>): string {
  return input.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, key: string) => {
    const k = key.toLowerCase();
    const v = ctx[k];
    if (v && v.trim() !== '') return v;
    if (k === 'first_name') return 'there';
    if (k === 'full_name')  return 'there';
    return '';
  });
}

function bodyToHtml(body: string): string {
  if (/<[a-z][^>]*>/i.test(body)) return body;
  const escaped = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.split(/\n{2,}/).map((p) =>
    `<p style="margin:0 0 14px 0; line-height:1.55; color:#1f2937;">${p.replace(/\n/g, '<br>')}</p>`,
  ).join('\n');
}

// ── Autosave draft ───────────────────────────────────────────────────
// Global draft — one shared composer state across all campaigns. Rehydrated
// on mount when `open` flips true. Cleared after a successful real send.
const DRAFT_KEY = 'marketing-composer-draft';
const DRAFT_VERSION = 1;

interface ComposerDraft {
  v: number;
  subject: string;
  body: string;
  previewText: string;
  fromName: string;
  replyTo: string;
  replyToExtra: string;
  testTo: string;
  sources: OutreachAudienceSource[];
  advertiserFilter: AudienceFilter;
  subscriberFilter: SubscriberFilter;
  manualText: string;
  mode: 'send_now' | 'schedule';
  scheduledFor: string;
  recurring: boolean;
  recurEveryDays: number;
  recurUntil: string;
  attachments: Array<{ filename: string; url: string; content_type: string; size: number }>;
  savedAt: number;
}

function loadDraft(): ComposerDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ComposerDraft;
    if (parsed.v !== DRAFT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveDraft(draft: Omit<ComposerDraft, 'v' | 'savedAt'>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ ...draft, v: DRAFT_VERSION, savedAt: Date.now() }),
    );
  } catch {
    // quota / disabled storage — silently skip
  }
}

function clearDraft() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

// ── Component ────────────────────────────────────────────────────────
export default function MarketingEmailModal({ open, onClose, campaign, adminEmail, onSent }: Props) {
  // Audience source toggles
  const [sources, setSources] = useState<OutreachAudienceSource[]>(['advertisers']);
  const [advertiserFilter, setAdvertiserFilter] = useState<AudienceFilter>(campaign.audience_filter ?? {});
  const [subscriberFilter, setSubscriberFilter] = useState<SubscriberFilter>({ status: 'active' });
  const [manualText, setManualText] = useState('');

  // Compose
  const [fromName, setFromName] = useState(() => brandForPublication(campaign.publication).name);
  const [attachments, setAttachments] = useState<Array<{ filename: string; url: string; content_type: string; size: number }>>([]);
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState<boolean>(false);
  const didHydrateRef = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setAttaching(true);
    setAttachError(null);
    try {
      const arr = Array.from(files);
      const uploaded = await Promise.all(arr.map(async (f) => {
        // Upload direct to Vercel Blob (bypasses the 4.5MB route ingress cap).
        const blob = await upload(`marketing-attachments/${Date.now()}-${f.name}`, f, {
          access: 'public',
          handleUploadUrl: '/api/admin/marketing-attachments/upload-url',
          contentType: f.type || 'application/octet-stream',
        });
        return {
          filename: f.name,
          url: blob.url,
          content_type: f.type || 'application/octet-stream',
          size: f.size,
        };
      }));
      setAttachments((prev) => [...prev, ...uploaded]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'upload failed';
      setAttachError(msg);
    } finally {
      setAttaching(false);
    }
  }

  function removeAttachment(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  const attachmentsTotalBytes = attachments.reduce((sum, a) => sum + a.size, 0);
  const attachmentsPayload = attachments.map((a) => ({
    filename: a.filename,
    url: a.url,
    content_type: a.content_type,
  }));
  const [replyTo, setReplyTo]   = useState<string>(adminEmail ?? '');
  // Additional reply-to addresses (comma/newline separated). Replies fan out
  // to every address. Seeded with the sales team defaults.
  const [replyToExtra, setReplyToExtra] = useState<string>(DEFAULT_REPLY_TO.join(', '));
  const [subject, setSubject]   = useState('');
  const [previewText, setPreviewText] = useState('');
  // Body is rich text — stored as HTML. Default seeds a friendly greeting.
  const [body, setBody] = useState<string>(
    '<p>Hi {{first_name}},</p><p><br></p><p>— {{rep_name}}</p>',
  );

  // Scheduling
  const [mode, setMode] = useState<'send_now' | 'schedule'>('send_now');
  const [scheduledFor, setScheduledFor] = useState<string>('');

  // Recurrence
  const [recurring, setRecurring] = useState<boolean>(false);
  const [recurEveryDays, setRecurEveryDays] = useState<number>(4);
  const [recurUntil, setRecurUntil] = useState<string>('');

  // Live media-kit stats for token preview (fetched once on open).
  const [mediaKitStats, setMediaKitStats] = useState<{ print_subscribers: number; email_subscribers: number } | null>(null);

  // Audience preview + sending state
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState<'idle' | 'sending' | 'testing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testTo, setTestTo] = useState<string>(adminEmail ?? '');

  // ── Autosave: hydrate on first open ────────────────────────────
  // Batch-restore all fields from localStorage. Wrapped in a callback
  // so the setState calls happen inside a handler-style function, not
  // directly within the effect body (satisfies set-state-in-effect).
  const hydrateFromDraft = useCallback(() => {
    const draft = loadDraft();
    if (!draft) return;
    setSubject(draft.subject);
    setBody(draft.body);
    setPreviewText(draft.previewText);
    setFromName(draft.fromName);
    setReplyTo(draft.replyTo);
    setReplyToExtra(draft.replyToExtra ?? DEFAULT_REPLY_TO.join(', '));
    setTestTo(draft.testTo);
    setSources(draft.sources);
    setAdvertiserFilter(draft.advertiserFilter);
    setSubscriberFilter(draft.subscriberFilter);
    setManualText(draft.manualText);
    setMode(draft.mode);
    setScheduledFor(draft.scheduledFor);
    setRecurring(draft.recurring ?? false);
    setRecurEveryDays(draft.recurEveryDays ?? 4);
    setRecurUntil(draft.recurUntil ?? '');
    setAttachments(draft.attachments);
    setDraftRestored(true);
  }, []);

  useEffect(() => {
    if (!open || didHydrateRef.current) return;
    didHydrateRef.current = true;
    hydrateFromDraft();
  }, [open, hydrateFromDraft]);

  // ── Autosave: debounced write on every change ──────────────────
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      saveDraft({
        subject, body, previewText, fromName, replyTo, replyToExtra, testTo,
        sources, advertiserFilter, subscriberFilter, manualText,
        mode, scheduledFor, recurring, recurEveryDays, recurUntil, attachments,
      });
    }, 300);
    return () => window.clearTimeout(t);
  }, [
    open, subject, body, previewText, fromName, replyTo, replyToExtra, testTo,
    sources, advertiserFilter, subscriberFilter, manualText,
    mode, scheduledFor, recurring, recurEveryDays, recurUntil, attachments,
  ]);

  function discardDraft() {
    if (!window.confirm('Discard the current draft? This cannot be undone.')) return;
    clearDraft();
    setSubject('');
    setBody('');
    setPreviewText('');
    setFromName(brandForPublication(campaign.publication).name);
    setReplyTo(adminEmail ?? '');
    setReplyToExtra(DEFAULT_REPLY_TO.join(', '));
    setTestTo(adminEmail ?? '');
    setSources(['advertisers']);
    setAdvertiserFilter(campaign.audience_filter ?? {});
    setSubscriberFilter({ status: 'active' });
    setManualText('');
    setMode('send_now');
    setScheduledFor('');
    setRecurring(false);
    setRecurEveryDays(4);
    setRecurUntil('');
    setAttachments([]);
    setDraftRestored(false);
  }

  // Parse manual emails (one per line or comma-separated).
  const manualEmails = useMemo(() => {
    return manualText
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
  }, [manualText]);

  // Live audience preview (debounced).
  const refreshPreview = useCallback(async () => {
    if (sources.length === 0) {
      setPreview({ count: 0, sample: [], by_source: { advertiser: 0, subscriber: 0, manual: 0 } });
      return;
    }
    setPreviewing(true);
    try {
      const res = await fetch('/api/admin/marketing-audience', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sources,
          advertiser_filter: sources.includes('advertisers') ? advertiserFilter : undefined,
          subscriber_filter: sources.includes('subscribers') ? subscriberFilter : undefined,
          manual_emails: sources.includes('manual') ? manualEmails : undefined,
        }),
      });
      if (res.ok) {
        setPreview(await res.json() as PreviewResponse);
      } else {
        setPreview({ count: 0, sample: [], by_source: { advertiser: 0, subscriber: 0, manual: 0 } });
      }
    } finally {
      setPreviewing(false);
    }
  }, [sources, advertiserFilter, subscriberFilter, manualEmails]);

  // Refresh preview on inputs (debounced 300ms). External fetch -> state.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => { void refreshPreview(); }, 300);
    return () => clearTimeout(t);
  }, [open, refreshPreview]);

  // Reset transient state when reopening. queueMicrotask defers the setState
  // out of the effect body to satisfy react-hooks/set-state-in-effect.
  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        setError(null);
        setSuccess(null);
      });
    }
  }, [open]);

  // Fetch live media-kit stats once per open for the {{print_subscribers}} /
  // {{email_subscribers}} token preview. Best-effort — preview falls back to
  // the raw token if unavailable.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/media-kit-stats');
        if (!res.ok) return;
        const j = await res.json() as { print_subscribers: number; email_subscribers: number };
        if (!cancelled) setMediaKitStats(j);
      } catch {
        // ignore — preview will show the raw token
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Combined reply-to list: primary reply-to first, then the extra addresses,
  // deduped (case-insensitive). Sent as reply_to_addresses.
  const replyToAddresses = useMemo(() => {
    const parts = [replyTo, ...replyToExtra.split(/[,\n]/)]
      .map((s) => s.trim())
      .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of parts) {
      const k = p.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(p);
    }
    return out;
  }, [replyTo, replyToExtra]);

  // Next fire times for the recurrence preview (America/Chicago).
  const recurrencePreview = useMemo(() => {
    if (!recurring || mode !== 'schedule' || !scheduledFor) return [];
    const first = new Date(scheduledFor);
    if (Number.isNaN(first.getTime())) return [];
    const until = recurUntil ? new Date(recurUntil) : null;
    return previewFireTimes(first, recurEveryDays, until, 5);
  }, [recurring, mode, scheduledFor, recurEveryDays, recurUntil]);

  // Inline validation: stop date must not precede the first fire.
  const recurUntilError = useMemo(() => {
    if (!recurring || !recurUntil || !scheduledFor) return null;
    return new Date(recurUntil).getTime() < new Date(scheduledFor).getTime()
      ? 'Stop date is before the first send.'
      : null;
  }, [recurring, recurUntil, scheduledFor]);

  if (!open) return null;

  // Build the rendered preview HTML (client-side, mirrors server renderer).
  const sample = preview?.sample[0];
  const tokenCtx: Record<string, string> = {
    first_name: sample?.first_name ?? 'Sam',
    last_name:  sample?.last_name  ?? 'Sample',
    full_name:  [sample?.first_name, sample?.last_name].filter(Boolean).join(' ') || 'Sam Sample',
    company:    sample?.company ?? 'Acme Realty',
    email:      sample?.email ?? 'sam@acme.test',
    rep_name:   adminEmail ?? `The ${brandForPublication(campaign.publication).name} Team`,
    print_subscribers: mediaKitStats ? mediaKitStats.print_subscribers.toLocaleString('en-US') : '',
    email_subscribers: mediaKitStats ? mediaKitStats.email_subscribers.toLocaleString('en-US') : '',
  };
  const renderedSubject = substituteTokens(subject || '(no subject)', tokenCtx);
  const renderedBody    = bodyToHtml(substituteTokens(body, tokenCtx));

  // ── Actions ──────────────────────────────────────────────────────
  async function sendTest() {
    setError(null); setSuccess(null);
    if (!subject.trim() || !body.trim()) { setError('Subject and body are required.'); return; }
    if (!testTo.trim()) { setError('Test recipient required.'); return; }
    setBusy('testing');
    try {
      const res = await fetch(`/api/admin/marketing-campaigns/${campaign.id}/test`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subject, body, from_name: fromName, reply_to: replyTo || undefined,
          reply_to_addresses: replyToAddresses.length > 0 ? replyToAddresses : undefined,
          preview_text: previewText || undefined, to: testTo,
          attachments: attachmentsPayload.length > 0 ? attachmentsPayload : undefined,
        }),
      });
      if (res.ok) {
        setSuccess(`Test sent to ${testTo}.`);
      } else {
        const j = await res.json().catch(() => ({}));
        setError(j.error || 'Test send failed.');
      }
    } finally {
      setBusy('idle');
    }
  }

  async function sendOrSchedule() {
    setError(null); setSuccess(null);
    if (!subject.trim() || !body.trim()) { setError('Subject and body are required.'); return; }
    if (!preview || preview.count === 0) { setError('No recipients match the audience.'); return; }
    if (mode === 'schedule' && !scheduledFor) { setError('Pick a date and time to schedule.'); return; }
    if (recurring && mode !== 'schedule') { setError('Recurring sends must be scheduled — pick "Schedule for later".'); return; }
    if (recurUntilError) { setError(recurUntilError); return; }
    if (mode === 'send_now' && !confirm(`Send to ${preview.count} recipient${preview.count === 1 ? '' : 's'} now?`)) return;
    setBusy('sending');
    try {
      const scheduledIso = scheduledFor ? new Date(scheduledFor).toISOString() : undefined;
      const recurrence = recurring
        ? {
            interval_days: recurEveryDays,
            until: recurUntil ? new Date(recurUntil).toISOString() : null,
          }
        : undefined;
      const res = await fetch(`/api/admin/marketing-campaigns/${campaign.id}/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subject, body,
          from_name: fromName || undefined,
          reply_to:  replyTo || undefined,
          reply_to_addresses: replyToAddresses.length > 0 ? replyToAddresses : undefined,
          preview_text: previewText || undefined,
          sources,
          advertiser_filter: sources.includes('advertisers') ? advertiserFilter : undefined,
          subscriber_filter: sources.includes('subscribers') ? subscriberFilter : undefined,
          manual_emails:     sources.includes('manual') ? manualEmails : undefined,
          mode,
          scheduled_for: scheduledIso,
          recurrence,
          attachments: attachmentsPayload.length > 0 ? attachmentsPayload : undefined,
        }),
      });
      if (res.ok) {
        const j = await res.json();
        if (mode === 'schedule') {
          const when = new Date(scheduledFor).toLocaleString();
          setSuccess(recurring
            ? `Recurring campaign scheduled — first send ${when}, repeating every ${recurEveryDays} day${recurEveryDays === 1 ? '' : 's'}. Audience is re-resolved on each send.`
            : `Scheduled ${j.recipient_count} recipient${j.recipient_count === 1 ? '' : 's'} for ${when}.`);
        } else {
          setSuccess(`Sent ${j.sent} of ${j.total}. ${j.failed > 0 ? `${j.failed} failed.` : ''}`);
        }
        clearDraft();
        setDraftRestored(false);
        onSent?.();
      } else {
        const j = await res.json().catch(() => ({}));
        setError(j.error || 'Send failed.');
      }
    } finally {
      setBusy('idle');
    }
  }

  function toggleSource(s: OutreachAudienceSource) {
    setSources((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[60] flex bg-black/40">
      <div className="ml-auto flex h-full w-full max-w-[1100px] flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Marketing email</div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-serif text-xl text-gray-900">{campaign.name}</h2>
              {(() => { const b = brandForPublication(campaign.publication); return (
                <span className={`text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${b.badgeTone}`} title={`Sends as ${b.name}`}>
                  {b.name}
                </span>
              ); })()}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {draftRestored && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
                Draft restored
              </span>
            )}
            <button
              onClick={discardDraft}
              className="rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              title="Discard the saved draft and reset all fields"
            >
              Discard draft
            </button>
            <button
              onClick={onClose}
              className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="grid flex-1 grid-cols-1 lg:grid-cols-[1fr_1.1fr] divide-x divide-gray-200 overflow-hidden">
          {/* LEFT: form */}
          <div className="space-y-6 overflow-y-auto p-6">
            {/* Audience */}
            <section>
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Audience</h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {(['advertisers', 'subscribers', 'manual'] as const).map((s) => (
                  <label key={s} className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium ${
                    sources.includes(s)
                      ? 'border-brand-700 bg-brand-700 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={sources.includes(s)}
                      onChange={() => toggleSource(s)}
                    />
                    {s === 'advertisers' && 'Advertisers'}
                    {s === 'subscribers' && 'Newsletter subscribers'}
                    {s === 'manual' && 'Manual entries'}
                  </label>
                ))}
              </div>

              {sources.includes('advertisers') && (
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3 mb-3 space-y-2">
                  <div className="text-xs font-medium text-gray-600 uppercase">Advertiser filter</div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={advertiserFilter.status?.[0] ?? ''}
                      onChange={(e) => setAdvertiserFilter({
                        ...advertiserFilter,
                        status: e.target.value ? [e.target.value] : undefined,
                      })}
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">Any status</option>
                      <option value="advertiser">Advertiser</option>
                      <option value="prospect">Prospect</option>
                      <option value="lead">Lead</option>
                      <option value="paused">Paused</option>
                    </select>
                    <select
                      value={advertiserFilter.publication?.[0] ?? ''}
                      onChange={(e) => setAdvertiserFilter({
                        ...advertiserFilter,
                        publication: e.target.value ? [e.target.value] : undefined,
                      })}
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">Any publication</option>
                      <option value="realtyline">RealtyLine Austin</option>
                      <option value="newsline">Newsline (San Antonio)</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={advertiserFilter.has_active_agreement === true}
                      onChange={(e) => setAdvertiserFilter({
                        ...advertiserFilter,
                        has_active_agreement: e.target.checked ? true : undefined,
                      })}
                    />
                    Only with an active agreement
                  </label>
                </div>
              )}

              {sources.includes('subscribers') && (
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3 mb-3 space-y-2">
                  <div className="text-xs font-medium text-gray-600 uppercase">Subscriber filter</div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={subscriberFilter.publication ?? ''}
                      onChange={(e) => setSubscriberFilter({
                        ...subscriberFilter,
                        publication: (e.target.value || undefined) as SubscriberFilter['publication'],
                      })}
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">Both publications</option>
                      <option value="realtyline">RealtyLine</option>
                      <option value="newsline">Newsline</option>
                    </select>
                    <select
                      value={subscriberFilter.status ?? 'active'}
                      onChange={(e) => setSubscriberFilter({
                        ...subscriberFilter,
                        status: e.target.value as SubscriberFilter['status'],
                      })}
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    >
                      <option value="active">Active only</option>
                      <option value="unsubscribed">Unsubscribed</option>
                    </select>
                  </div>
                </div>
              )}

              {sources.includes('manual') && (
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3 mb-3">
                  <div className="text-xs font-medium text-gray-600 uppercase mb-1">Manual emails</div>
                  <textarea
                    value={manualText}
                    onChange={(e) => setManualText(e.target.value)}
                    placeholder="one@example.com, two@example.com (or one per line)"
                    rows={3}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm font-mono"
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    {manualEmails.length} valid email{manualEmails.length === 1 ? '' : 's'} detected
                  </div>
                </div>
              )}

              <div className="rounded-md border border-brand-200 bg-brand-50 p-3 text-sm">
                {previewing ? (
                  <span className="text-gray-600">Resolving audience…</span>
                ) : preview ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-brand-700">{preview.count.toLocaleString()}</span>
                      <span className="text-gray-600"> recipient{preview.count === 1 ? '' : 's'} </span>
                      <span className="text-gray-500 text-xs">
                        ({preview.by_source.advertiser} advertisers · {preview.by_source.subscriber} subscribers · {preview.by_source.manual} manual)
                      </span>
                    </div>
                    <button
                      onClick={() => void refreshPreview()}
                      className="text-xs text-brand-700 underline hover:no-underline"
                    >
                      Refresh
                    </button>
                  </div>
                ) : (
                  <span className="text-gray-500">No audience selected.</span>
                )}
              </div>
            </section>

            {/* Compose */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">Compose</h3>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <div className="text-xs font-medium text-gray-600 mb-1">From name</div>
                  <input
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="block">
                  <div className="text-xs font-medium text-gray-600 mb-1">Reply-to (primary)</div>
                  <input
                    value={replyTo}
                    onChange={(e) => setReplyTo(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </label>
              </div>
              <label className="block">
                <div className="text-xs font-medium text-gray-600 mb-1">Additional reply-to addresses</div>
                <textarea
                  value={replyToExtra}
                  onChange={(e) => setReplyToExtra(e.target.value)}
                  placeholder="one@example.com, two@example.com"
                  rows={2}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm font-mono"
                />
                <div className="text-[11px] text-gray-500 mt-1">
                  Replies fan out to every address below.{' '}
                  {replyToAddresses.length > 0
                    ? `Sending to: ${replyToAddresses.join(', ')}`
                    : 'No valid reply-to addresses — using the sender default.'}
                </div>
              </label>
              <label className="block">
                <div className="text-xs font-medium text-gray-600 mb-1">Subject</div>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Quick update for {{first_name}}"
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block">
                <div className="text-xs font-medium text-gray-600 mb-1">Preview text (inbox preheader)</div>
                <input
                  value={previewText}
                  onChange={(e) => setPreviewText(e.target.value)}
                  placeholder="A quick note about your renewal…"
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                />
              </label>
              <div>
                <div className="text-xs font-medium text-gray-600 mb-1">Body</div>
                <RichTextEditor
                  value={body}
                  onChange={setBody}
                  placeholder="Write your email…"
                  minHeight={260}
                  tokens={TOKENS.map((t) => ({ key: t.key, label: t.label }))}
                />
                <div className="text-[11px] text-gray-500 mt-1">
                  Use the toolbar to format. Insert recipient fields with the
                  <strong> {`{ } Token`}</strong> menu.
                </div>
              </div>
            </section>

            {/* Schedule + test */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-800">Send</h3>
              <div className="flex items-center gap-2 text-sm">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === 'send_now'}
                    onChange={() => setMode('send_now')}
                  />
                  Send now
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === 'schedule'}
                    onChange={() => setMode('schedule')}
                  />
                  Schedule for later
                </label>
              </div>
              {mode === 'schedule' && (
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                />
              )}

              {/* Recurrence */}
              {mode === 'schedule' && (
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
                    <input
                      type="checkbox"
                      checked={recurring}
                      onChange={(e) => setRecurring(e.target.checked)}
                    />
                    Send on a recurring schedule
                  </label>
                  {recurring && (
                    <div className="space-y-2 pl-6">
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <span>Every</span>
                        <input
                          type="number"
                          min={1}
                          max={90}
                          value={recurEveryDays}
                          onChange={(e) => setRecurEveryDays(Math.min(90, Math.max(1, Number(e.target.value) || 1)))}
                          className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm"
                        />
                        <span>days</span>
                      </div>
                      <label className="block text-sm text-gray-700">
                        <div className="text-xs font-medium text-gray-600 mb-1">Stop after (optional)</div>
                        <input
                          type="datetime-local"
                          value={recurUntil}
                          onChange={(e) => setRecurUntil(e.target.value)}
                          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                        />
                      </label>
                      {recurUntilError && (
                        <p className="text-xs text-red-700">{recurUntilError}</p>
                      )}
                      {recurrencePreview.length > 0 && !recurUntilError && (
                        <div className="text-xs text-gray-600">
                          <div className="font-medium text-gray-700 mb-1">Next {recurrencePreview.length} sends (America/Chicago):</div>
                          <ul className="space-y-0.5">
                            {recurrencePreview.map((d, i) => (
                              <li key={i} className="font-mono">
                                {d.toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' })}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 pt-2">
                <input
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="test@example.com"
                  className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                />
                <button
                  onClick={() => void sendTest()}
                  disabled={busy !== 'idle'}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  {busy === 'testing' ? 'Sending…' : 'Send test'}
                </button>
              </div>
            </section>

            {/* Attachments */}
            <section className="border-t border-gray-200 px-6 py-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Attachments</h3>
                <span className="text-xs text-gray-500">
                  {attachments.length} file{attachments.length === 1 ? '' : 's'} · {formatBytes(attachmentsTotalBytes)}
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="*/*"
                onChange={(e) => { void addFiles(e.target.files); if (e.target) e.target.value = ''; }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={attaching}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                {attaching ? 'Reading files…' : 'Add files'}
              </button>
              {attachments.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {attachments.map((a, i) => (
                    <li key={i} className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs">
                      <span className="truncate pr-2 text-gray-800">{a.filename}</span>
                      <span className="flex items-center gap-3 shrink-0">
                        <span className="text-gray-500">{formatBytes(a.size)}</span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(i)}
                          className="text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {attachmentsTotalBytes > 38 * 1024 * 1024 && (
                <p className="mt-2 text-xs text-amber-700">
                  Heads up: Resend caps total attachment payload around 40&nbsp;MB per email. Sends over that limit will fail.
                </p>
              )}
              {attachError && (
                <p className="mt-2 text-xs text-red-700">Upload failed: {attachError}</p>
              )}
            </section>
          </div>

          {/* RIGHT: preview */}
          <div className="flex flex-col overflow-hidden bg-gray-100">
            <div className="border-b border-gray-200 bg-white px-6 py-3 text-xs text-gray-500">
              <div className="flex items-center justify-between">
                <div>Preview as: <strong className="text-gray-900">{sample?.email ?? 'sam@acme.test'}</strong></div>
                <div className="text-gray-400">Tokens substituted with sample recipient</div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mx-auto max-w-[600px] rounded-lg bg-white shadow-sm overflow-hidden">
                <div className="bg-brand-700 px-6 py-4 text-white">
                  <div className="font-serif text-lg">{fromName || brandForPublication(campaign.publication).name}</div>
                  <div className="text-xs opacity-80">
                    {brandForPublication(campaign.publication).tagline}
                  </div>
                </div>
                <div className="px-6 py-3 border-b border-gray-100">
                  <div className="text-xs text-gray-500">Subject</div>
                  <div className="text-sm font-medium text-gray-900">{renderedSubject}</div>
                </div>
                <div
                  className="px-6 py-5 text-sm text-gray-800"
                  dangerouslySetInnerHTML={{ __html: renderedBody }}
                />
                <div className="border-t border-gray-100 px-6 py-3 text-[11px] text-gray-500">
                  You&apos;re receiving this because you&apos;re connected with {fromName || brandForPublication(campaign.publication).name}.
                  {' '}<u>Unsubscribe</u> · Caxton Publications, Austin, TX
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 bg-white px-6 py-3 flex items-center justify-between gap-3">
          <div className="text-sm">
            {error && <span className="text-red-600">{error}</span>}
            {success && <span className="text-emerald-700">{success}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
            >
              Close
            </button>
            <button
              onClick={() => void sendOrSchedule()}
              disabled={busy !== 'idle' || !preview || preview.count === 0}
              className="rounded-md bg-brand-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
            >
              {busy === 'sending'
                ? (mode === 'schedule' ? 'Scheduling…' : 'Sending…')
                : (mode === 'schedule' ? `Schedule for ${preview?.count ?? 0}` : `Send to ${preview?.count ?? 0}`)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
