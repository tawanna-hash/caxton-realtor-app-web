// app/admin/crm/_components/CrmComposer.tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import RichTextEditor from './RichTextEditor';
import type { AdvertiserCrmRow, AdvertiserStatus } from '@/lib/advertisers';
import {
  PUBLICATION_KEYS,
  parsePublications,
  type PublicationKey,
} from '@/lib/publication-theme';

// ── Types ────────────────────────────────────────────────────────
type SampleRow = {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  publication: string | null;
  status: string | null;
  type: string | null;
};

type PreviewResponse = {
  count: number;
  sample: SampleRow[];
  ids: number[];
};

type Attachment = {
  filename: string;
  url: string;
  content_type?: string;
  size?: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  rows: AdvertiserCrmRow[];
  adminEmail: string | null;
  onSent?: () => void;
  prefillOutreachId?: string | null;
  onPrefilled?: () => void;
  // Optional filter pre-seed — CrmClient passes its current chip state
  // so the composer opens with the same audience the user is viewing.
  initialFilter?: {
    statuses?: AdvertiserStatus[];
    publications?: PublicationKey[];
    query?: string;
  };
};

// ── Tokens shown in the "Insert token" helper menu ──────────────
const TOKENS = [
  { key: '{{first_name}}', label: 'Recipient first name', sample: 'Sam' },
  { key: '{{last_name}}',  label: 'Recipient last name',  sample: 'Sample' },
  { key: '{{full_name}}',  label: 'Recipient full name',  sample: 'Sam Sample' },
  { key: '{{company}}',    label: 'Recipient company',    sample: 'Acme Realty' },
  { key: '{{email}}',      label: 'Recipient email',      sample: 'sam@acme.test' },
  { key: '{{rep_name}}',   label: 'Sender (you)',         sample: 'Your name' },
];

const STATUS_OPTIONS: Array<{ value: AdvertiserStatus; label: string }> = [
  { value: 'prospect',   label: 'Prospect' },
  { value: 'advertiser', label: 'Partner' },
  { value: 'archived',   label: 'Archived' },
];

const PUB_OPTIONS: PublicationKey[] = [...PUBLICATION_KEYS];

const DRAFT_KEY = 'crm-composer-draft-v1';

// ── LocalStorage draft ──────────────────────────────────────────
type Draft = {
  subject: string;
  body: string;
  fromName: string;
  replyTo: string;
  replyToList: string;
  previewText: string;
  attachmentLinkUrl: string;
  attachmentLinkLabel: string;
  recurrenceIntervalDays: string;
  recurrenceUntil: string;
  scheduledFor: string;
  publicationScope: string;
  statuses: AdvertiserStatus[];
  publications: PublicationKey[];
  query: string;
  tag: string;
  includeSignature: boolean;
  manualEmails: string;
  selectedRecipientIds: number[] | null;
};

function loadDraft(): Partial<Draft> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) as Partial<Draft> : {};
  } catch {
    return {};
  }
}

function saveDraft(d: Draft) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* quota exceeded — ignore */
  }
}

function clearDraft() {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

// ── Component ───────────────────────────────────────────────────
export default function CrmComposer({ open, onClose, rows, adminEmail, onSent, initialFilter, prefillOutreachId, onPrefilled }: Props) {
  // Filter chip state (independent of CrmClient's chips — but seeded from them)
  const [statuses, setStatuses] = useState<AdvertiserStatus[]>(initialFilter?.statuses ?? []);
  const [publications, setPublications] = useState<PublicationKey[]>(initialFilter?.publications ?? []);
  const [query, setQuery] = useState(initialFilter?.query ?? '');
  const [tag, setTag] = useState('');
  const [manualEmails, setManualEmails] = useState('');
  // null means every recipient matching the current filter is selected.
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<number[] | null>(null);

  // Compose fields
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [fromName, setFromName] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [replyToList, setReplyToList] = useState(''); // comma-separated
  const [previewText, setPreviewText] = useState('');

  // Attachments + link
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentLinkUrl, setAttachmentLinkUrl] = useState('');
  const [attachmentLinkLabel, setAttachmentLinkLabel] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Send mode + schedule + recurrence
  const [mode, setMode] = useState<'send_now' | 'schedule'>('send_now');
  const [scheduledFor, setScheduledFor] = useState('');
  const [recurrenceIntervalDays, setRecurrenceIntervalDays] = useState('');
  const [recurrenceUntil, setRecurrenceUntil] = useState('');
  const [publicationScope, setPublicationScope] = useState('all');
  const [includeSignature, setIncludeSignature] = useState<boolean>(true);

  // UI state
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [testTo, setTestTo] = useState(adminEmail ?? '');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [showTokenMenu, setShowTokenMenu] = useState(false);
  const [restoredDraft, setRestoredDraft] = useState(false);

  // ── Restore draft on open ─────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const d = loadDraft();
    if (!d || (!d.subject && !d.body)) return;
    queueMicrotask(() => {
      setSubject(d.subject ?? '');
      setBody(d.body ?? '');
      setFromName(d.fromName ?? '');
      setReplyTo(d.replyTo ?? '');
      setReplyToList(d.replyToList ?? '');
      setPreviewText(d.previewText ?? '');
      setAttachmentLinkUrl(d.attachmentLinkUrl ?? '');
      setAttachmentLinkLabel(d.attachmentLinkLabel ?? '');
      setRecurrenceIntervalDays(d.recurrenceIntervalDays ?? '');
      setRecurrenceUntil(d.recurrenceUntil ?? '');
      setScheduledFor(d.scheduledFor ?? '');
      setPublicationScope(d.publicationScope ?? 'all');
      if (typeof d.includeSignature === 'boolean') setIncludeSignature(d.includeSignature);
      if (d.statuses) setStatuses(d.statuses);
      if (d.publications) setPublications(d.publications);
      if (typeof d.query === 'string') setQuery(d.query);
      if (typeof d.tag === 'string') setTag(d.tag);
      if (typeof d.manualEmails === 'string') setManualEmails(d.manualEmails);
      if (d.selectedRecipientIds === null || Array.isArray(d.selectedRecipientIds)) {
        setSelectedRecipientIds(d.selectedRecipientIds);
      }
      setRestoredDraft(true);
      setTimeout(() => setRestoredDraft(false), 3500);
    });
  }, [open]);

  // Prefill from a past outreach (Edit & Resend flow).
  useEffect(() => {
    if (!open || !prefillOutreachId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/admin/crm-email/${prefillOutreachId}`, { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        const row = j.row ?? {};
        if (cancelled) return;
        if (typeof row.subject === 'string') setSubject(row.subject);
        if (typeof row.body === 'string') setBody(row.body);
        if (typeof row.from_name === 'string') setFromName(row.from_name);
        if (typeof row.reply_to === 'string') setReplyTo(row.reply_to);
        if (typeof row.preview_text === 'string') setPreviewText(row.preview_text);
        if (typeof row.attachment_link_url === 'string') setAttachmentLinkUrl(row.attachment_link_url);
        if (typeof row.attachment_link_label === 'string') setAttachmentLinkLabel(row.attachment_link_label);
        if (Array.isArray(row.attachments)) setAttachments(row.attachments);
        if (Array.isArray(row.reply_to_list)) setReplyToList(row.reply_to_list.join(', '));
        onPrefilled?.();
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [open, prefillOutreachId, onPrefilled]);

  // ── Autosave draft ───────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      saveDraft({
        subject, body, fromName, replyTo, replyToList, previewText,
        attachmentLinkUrl, attachmentLinkLabel,
        recurrenceIntervalDays, recurrenceUntil, scheduledFor,
        publicationScope, statuses, publications, query, tag,
        includeSignature,
        manualEmails,
        selectedRecipientIds,
      });
    }, 600);
    return () => clearTimeout(t);
  }, [
    open, subject, body, fromName, replyTo, replyToList, previewText,
    attachmentLinkUrl, attachmentLinkLabel,
    recurrenceIntervalDays, recurrenceUntil, scheduledFor,
    publicationScope, statuses, publications, query, tag,
    includeSignature, manualEmails, selectedRecipientIds,
  ]);

  // ── Client-side audience preview (mirrors backend logic) ─────
  const localAudience = useMemo(() => {
    const seen = new Set<string>();
    const out: SampleRow[] = [];
    const qNorm = query.trim().toLowerCase();
    const pubSet = publications.length > 0 ? new Set<string>(publications) : null;
    for (const r of rows) {
      const email = (r.contact_email ?? r.portal_email ?? '').trim();
      if (!email) continue;
      if (statuses.length > 0 && (!r.status || !statuses.includes(r.status as AdvertiserStatus))) continue;
      if (pubSet) {
        const advPubs = parsePublications(r.publication);
        if (!advPubs.some((p) => pubSet.has(p))) continue;
      }
      if (qNorm) {
        const hay = [r.name, r.company, email].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(qNorm)) continue;
      }
      if (tag.trim()) {
        const tags = Array.isArray(r.tags) ? (r.tags as unknown[]).map(String) : [];
        if (!tags.includes(tag.trim())) continue;
      }
      const key = email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: r.id, email,
        first_name: r.first_name ?? null,
        last_name: r.last_name ?? null,
        company: r.company ?? null,
        publication: r.publication ?? null,
        status: r.status ?? null,
        type: r.type ?? null,
      });
    }
    return out;
  }, [rows, statuses, publications, query, tag]);

  // ── Server preview (debounced) — authoritative count ─────────
  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setPreviewLoading(true);
      setPreviewErr(null);
    });
    const controller = new AbortController();
    const t = setTimeout(() => {
      fetch('/api/admin/crm-email/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          filter: {
            query: query || undefined,
            status: statuses.length > 0 ? statuses : undefined,
            publication: publications.length > 0 ? publications : undefined,
            tag: tag || undefined,
          },
        }),
        signal: controller.signal,
      })
        .then(async (r) => {
          if (!r.ok) throw new Error(await r.text());
          return r.json() as Promise<PreviewResponse>;
        })
        .then((data) => { setPreview(data); setPreviewLoading(false); })
        .catch((err) => {
          if ((err as { name?: string }).name === 'AbortError') return;
          setPreviewErr(err instanceof Error ? err.message : 'preview failed');
          setPreviewLoading(false);
        });
    }, 400);
    return () => { clearTimeout(t); controller.abort(); };
  }, [open, query, statuses, publications, tag]);

  // ── Handlers ─────────────────────────────────────────────────
  const toggleFrom = useCallback(
    <T,>(set: React.Dispatch<React.SetStateAction<T[]>>, val: T) => {
      set((prev) => (prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]));
    },
    [],
  );

  const parseReplyToList = useCallback((): string[] => {
    return replyToList.split(',').map((s) => s.trim()).filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
  }, [replyToList]);

  const parsedManualEmails = useMemo(() => {
    const seen = new Set<string>();
    return manualEmails
      .split(/[\s,;]+/)
      .map((value) => value.trim().toLowerCase())
      .filter((value) => {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || seen.has(value)) return false;
        seen.add(value);
        return true;
      });
  }, [manualEmails]);

  const selectedIds = useMemo(
    () => selectedRecipientIds ?? (preview?.ids ?? localAudience.map((row) => row.id)),
    [selectedRecipientIds, preview, localAudience],
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedCrmEmails = useMemo(() => {
    return new Set(
      localAudience
        .filter((row) => selectedIdSet.has(row.id))
        .map((row) => row.email.trim().toLowerCase()),
    );
  }, [localAudience, selectedIdSet]);
  const uniqueManualCount = parsedManualEmails.filter((email) => !selectedCrmEmails.has(email)).length;
  const recipientCount = selectedIds.length + uniqueManualCount;

  const toggleRecipient = useCallback((id: number) => {
    setSelectedRecipientIds((current) => {
      const base = new Set(current ?? (preview?.ids ?? localAudience.map((row) => row.id)));
      if (base.has(id)) base.delete(id);
      else base.add(id);
      return Array.from(base);
    });
  }, [preview, localAudience]);

  const insertToken = useCallback((tok: string) => {
    setBody((prev) => `${prev}${tok}`);
    setShowTokenMenu(false);
  }, []);

  const insertSignatureNow = useCallback(() => {
    setBody((prev) => `${prev}

<!-- signature-here -->`);
  }, []);

  const onUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: Attachment[] = [];
      for (const file of Array.from(files)) {
        const blob = await upload(file.name, file, {
          access: 'public',
          handleUploadUrl: '/api/admin/crm-email/attachments/upload-url',
        });
        uploaded.push({
          filename: file.name,
          url: blob.url,
          content_type: file.type || undefined,
          size: file.size,
        });
      }
      setAttachments((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setSubmitErr(err instanceof Error ? err.message : 'upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

  const removeAttachment = useCallback((idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const onTestSend = useCallback(async () => {
    if (!testTo || !subject || !body) {
      setTestResult('subject, body, and test address are required');
      return;
    }
    setTestSending(true);
    setTestResult(null);
    try {
      const r = await fetch('/api/admin/crm-email/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          to: testTo, subject, body,
          from_name: fromName || undefined,
          reply_to: replyTo || undefined,
          reply_to_list: parseReplyToList().length > 0 ? parseReplyToList() : undefined,
          preview_text: previewText || undefined,
          attachments: attachments.length > 0
            ? attachments.map(({ filename, url, content_type }) => ({ filename, url, content_type }))
            : undefined,
          attachment_link_url: attachmentLinkUrl || undefined,
          attachment_link_label: attachmentLinkLabel || undefined,
          publication_scope: publicationScope,
          include_signature: includeSignature,
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        setTestResult(`failed: ${t}`);
      } else {
        setTestResult(`sent to ${testTo}`);
      }
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : 'error');
    } finally {
      setTestSending(false);
    }
  }, [testTo, subject, body, fromName, replyTo, previewText, attachments, attachmentLinkUrl, attachmentLinkLabel, publicationScope, includeSignature, parseReplyToList]);

  const onSubmit = useCallback(async () => {
    if (!subject || !body) {
      setSubmitErr('subject and body are required');
      return;
    }
    if (mode === 'schedule' && !scheduledFor) {
      setSubmitErr('scheduled_for is required for scheduled sends');
      return;
    }
    if (recipientCount === 0) {
      setSubmitErr('select at least one CRM recipient or add a valid email address');
      return;
    }
    setSubmitting(true);
    setSubmitErr(null);
    try {
      const payload = {
        filter: {
          ids: selectedIds,
        },
        manual_emails: parsedManualEmails.length > 0 ? parsedManualEmails : undefined,
        subject,
        body,
        from_name: fromName || undefined,
        reply_to: replyTo || undefined,
        reply_to_list: parseReplyToList().length > 0 ? parseReplyToList() : undefined,
        preview_text: previewText || undefined,
        attachments: attachments.length > 0 ? attachments.map(({ filename, url, content_type }) => ({ filename, url, content_type })) : undefined,
        attachment_link_url: attachmentLinkUrl || undefined,
        attachment_link_label: attachmentLinkLabel || undefined,
        publication_scope: publicationScope,
        include_signature: includeSignature,
        mode,
        scheduled_for: mode === 'schedule' && scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
        recurrence_interval_days: recurrenceIntervalDays ? Number(recurrenceIntervalDays) : undefined,
        recurrence_until: recurrenceUntil ? new Date(recurrenceUntil).toISOString() : undefined,
      };
      const r = await fetch('/api/admin/crm-email/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t);
      }
      clearDraft();
      onSent?.();
      onClose();
    } catch (err) {
      setSubmitErr(err instanceof Error ? err.message : 'send failed');
    } finally {
      setSubmitting(false);
    }
  }, [
    subject, body, mode, scheduledFor, recipientCount, selectedIds, parsedManualEmails,
    fromName, replyTo, previewText, attachments, attachmentLinkUrl, attachmentLinkLabel,
    publicationScope, includeSignature, recurrenceIntervalDays, recurrenceUntil, parseReplyToList, onSent, onClose,
  ]);

  if (!open) return null;

  const serverCount = preview?.count ?? null;
  const sampleForDisplay = localAudience.length > 0 ? localAudience : (preview?.sample ?? []);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-stretch bg-black/40 backdrop-blur-sm">
      <div className="m-auto flex h-[92vh] w-[96vw] max-w-[1400px] flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-6 py-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-gray-500">CRM outreach</div>
            <h2 className="mt-0.5 font-serif text-2xl text-gray-900">Compose email</h2>
          </div>
          <div className="flex items-center gap-3">
            {restoredDraft && (
              <span className="text-xs text-emerald-700">Draft restored</span>
            )}
            <button
              type="button"
              onClick={() => { clearDraft(); onClose(); }}
              className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 whitespace-nowrap"
            >
              Close
            </button>
          </div>
        </div>

        {/* Body: 2-column */}
        <div className="grid flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* LEFT: form */}
          <div className="flex flex-col overflow-y-auto px-6 py-5">
            {/* Audience filters */}
            <section className="mb-5">
              <h3 className="text-sm font-semibold text-gray-900">Audience</h3>
              <p className="mt-0.5 text-xs text-gray-500">Filters the same CRM list — matches what you see in /admin/crm.</p>

              <div className="mt-3 space-y-3">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Status</div>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {STATUS_OPTIONS.map((opt) => {
                      const on = statuses.includes(opt.value);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setSelectedRecipientIds(null);
                            toggleFrom<AdvertiserStatus>(setStatuses, opt.value);
                          }}
                          className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-purple-600 bg-purple-50 text-purple-700' : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'}`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Publication</div>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {PUB_OPTIONS.map((p) => {
                      const on = publications.includes(p);
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => {
                            setSelectedRecipientIds(null);
                            toggleFrom<PublicationKey>(setPublications, p);
                          }}
                          className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-purple-600 bg-purple-50 text-purple-700' : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'}`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Search</label>
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => {
                        setSelectedRecipientIds(null);
                        setQuery(e.target.value);
                      }}
                      placeholder="name / company / email"
                      className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Tag (exact)</label>
                    <input
                      type="text"
                      value={tag}
                      onChange={(e) => {
                        setSelectedRecipientIds(null);
                        setTag(e.target.value);
                      }}
                      placeholder="optional single tag"
                      className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Add emails manually
                  </label>
                  <textarea
                    value={manualEmails}
                    onChange={(e) => setManualEmails(e.target.value)}
                    rows={2}
                    placeholder="name@example.com, another@example.com"
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                  <div className="mt-1 text-xs text-gray-500">
                    Separate addresses with commas, spaces, semicolons, or new lines. {parsedManualEmails.length} valid.
                  </div>
                </div>
              </div>
            </section>

            {/* Compose */}
            <section className="mb-5 border-t border-gray-200 pt-5">
              <h3 className="text-sm font-semibold text-gray-900">Message</h3>
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Preview text (inbox preview)</label>
                  <input
                    type="text"
                    value={previewText}
                    onChange={(e) => setPreviewText(e.target.value)}
                    maxLength={150}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Body</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={insertSignatureNow}
                        className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                        title="Insert a signature placeholder — server injects the full block on send"
                      >
                        Insert Signature
                      </button>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowTokenMenu((s) => !s)}
                        className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        Insert token ▾
                      </button>
                      {showTokenMenu && (
                        <div className="absolute right-0 z-10 mt-1 w-64 rounded-md border border-gray-200 bg-white p-1 shadow-lg">
                          {TOKENS.map((t) => (
                            <button
                              key={t.key}
                              type="button"
                              onClick={() => insertToken(t.key)}
                              className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-gray-50"
                            >
                              <span className="font-mono text-purple-700">{t.key}</span>
                              <span className="text-gray-500">{t.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    </div>
                  </div>
                  <div className="mt-1">
                    <RichTextEditor value={body} onChange={setBody} />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">From name</label>
                    <input
                      type="text"
                      value={fromName}
                      onChange={(e) => setFromName(e.target.value)}
                      placeholder="e.g. Tawanna at RealtyLine"
                      className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Publication scope</label>
                    <select
                      value={publicationScope}
                      onChange={(e) => setPublicationScope(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    >
                      <option value="all">Default (RealtyLine brand)</option>
                      <option value="realtyline">RealtyLine brand</option>
                      <option value="newsline">Newsline brand</option>
                      <option value="caxton">Caxton brand</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Reply-to (primary)</label>
                    <input
                      type="email"
                      value={replyTo}
                      onChange={(e) => setReplyTo(e.target.value)}
                      placeholder="you@myrealtyline.com"
                      className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Additional reply-to (comma sep.)</label>
                    <input
                      type="text"
                      value={replyToList}
                      onChange={(e) => setReplyToList(e.target.value)}
                      placeholder="a@x.com, b@y.com"
                      className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Attachments */}
            <section className="mb-5 border-t border-gray-200 pt-5">
              <h3 className="text-sm font-semibold text-gray-900">Attachments</h3>
              <p className="mt-0.5 text-xs text-gray-500">Files upload to Vercel Blob and are linked in the email (no 4.5 MB body limit).</p>
              <div className="mt-2 space-y-2">
                {attachments.map((a, i) => (
                  <div key={a.url} className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs">
                    <div className="min-w-0 truncate">
                      <a href={a.url} target="_blank" rel="noreferrer" className="text-purple-700 hover:underline">{a.filename}</a>
                      {a.size ? <span className="ml-2 text-gray-500">{(a.size / 1024).toFixed(0)} KB</span> : null}
                    </div>
                    <button type="button" onClick={() => removeAttachment(i)} className="text-red-600 hover:underline">remove</button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={(e) => onUpload(e.target.files)}
                    className="text-xs"
                  />
                  {uploading && <span className="text-xs text-gray-500">uploading…</span>}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Attachment link URL (button)</label>
                  <input
                    type="url"
                    value={attachmentLinkUrl}
                    onChange={(e) => setAttachmentLinkUrl(e.target.value)}
                    placeholder="https://…"
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Button label</label>
                  <input
                    type="text"
                    value={attachmentLinkLabel}
                    onChange={(e) => setAttachmentLinkLabel(e.target.value)}
                    placeholder="Download media kit"
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>
            </section>

            {/* Schedule + recurrence */}
            <section className="mb-5 border-t border-gray-200 pt-5">
              <h3 className="text-sm font-semibold text-gray-900">Delivery</h3>
              <div className="mt-3 flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="radio" checked={mode === 'send_now'} onChange={() => setMode('send_now')} />
                  Send now
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="radio" checked={mode === 'schedule'} onChange={() => setMode('schedule')} />
                  Schedule
                </label>
                <label className="ml-6 flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={includeSignature}
                    onChange={(e) => setIncludeSignature(e.target.checked)}
                  />
                  Include signature
                </label>
              </div>
              {mode === 'schedule' && (
                <div className="mt-3">
                  <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Scheduled for (your local time)</label>
                  <input
                    type="datetime-local"
                    value={scheduledFor}
                    onChange={(e) => setScheduledFor(e.target.value)}
                    className="mt-1 w-full max-w-xs rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              )}

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Repeat every (days, optional)</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={recurrenceIntervalDays}
                    onChange={(e) => setRecurrenceIntervalDays(e.target.value)}
                    className="mt-1 w-full max-w-xs rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Repeat until (optional)</label>
                  <input
                    type="datetime-local"
                    value={recurrenceUntil}
                    onChange={(e) => setRecurrenceUntil(e.target.value)}
                    className="mt-1 w-full max-w-xs rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>
            </section>

            {/* Test send */}
            <section className="mb-5 border-t border-gray-200 pt-5">
              <h3 className="text-sm font-semibold text-gray-900">Test send</h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="email"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="your@email.com"
                  className="w-72 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                <button
                  type="button"
                  onClick={onTestSend}
                  disabled={testSending}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
                >
                  {testSending ? 'sending…' : 'Send test'}
                </button>
                {testResult && <span className="text-xs text-gray-600">{testResult}</span>}
              </div>
            </section>

            {submitErr && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {submitErr}
              </div>
            )}
          </div>

          {/* RIGHT: preview + submit */}
          <aside className="flex flex-col overflow-y-auto border-l border-gray-200 bg-gray-50 px-5 py-5">
            <h3 className="text-sm font-semibold text-gray-900">Preview</h3>

            <div className="mt-2 rounded-md border border-gray-200 bg-white px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-gray-500">Recipients</div>
              <div className="mt-0.5 font-serif text-3xl text-gray-900">
                {previewLoading && selectedRecipientIds === null ? '…' : recipientCount}
              </div>
              {previewErr && <div className="mt-1 text-xs text-red-600">{previewErr}</div>}
              {!previewErr && serverCount != null && serverCount !== localAudience.length && (
                <div className="mt-1 text-xs text-amber-700">
                  server: {serverCount} · local rows shown: {localAudience.length}
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedRecipientIds(null)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
              >
                Select all ({serverCount ?? localAudience.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedRecipientIds([])}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
              >
                Clear all
              </button>
              <span className="text-xs text-gray-500">{selectedIds.length} CRM selected</span>
            </div>

            <div className="mt-3 flex-1 overflow-y-auto rounded-md border border-gray-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-100 text-gray-600">
                    <tr>
                      <th className="w-9 px-2 py-1 text-left font-medium">
                        <span className="sr-only">Selected</span>
                      </th>
                      <th className="px-2 py-1 text-left font-medium">Email</th>
                      <th className="px-2 py-1 text-left font-medium">Name</th>
                      <th className="px-2 py-1 text-left font-medium">Pub</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sampleForDisplay.length === 0 && !previewLoading && (
                      <tr><td colSpan={4} className="px-2 py-4 text-center text-gray-400">No recipients match this filter.</td></tr>
                    )}
                    {sampleForDisplay.map((r) => (
                      <tr key={r.id} className="border-t border-gray-100">
                        <td className="px-2 py-1">
                          <input
                            type="checkbox"
                            checked={selectedIdSet.has(r.id)}
                            onChange={() => toggleRecipient(r.id)}
                            aria-label={`Select ${r.email}`}
                            className="h-4 w-4 rounded border-gray-300 text-purple-700 focus:ring-purple-500"
                          />
                        </td>
                        <td className="px-2 py-1 font-mono text-gray-800">{r.email}</td>
                        <td className="px-2 py-1 text-gray-700">
                          {[r.first_name, r.last_name].filter(Boolean).join(' ') || r.company || '—'}
                        </td>
                        <td className="px-2 py-1 text-gray-500">{r.publication ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={onSubmit}
                disabled={submitting || recipientCount === 0}
                className="w-full rounded-md bg-purple-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-purple-800 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
              >
                {submitting
                  ? (mode === 'schedule' ? 'Scheduling…' : 'Sending…')
                  : (mode === 'schedule' ? `Schedule (${recipientCount})` : `Send now (${recipientCount})`)}
              </button>
              <p className="text-[11px] text-gray-500">
                Drafts autosave locally. Backend uses the exact same query as /admin/crm.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
