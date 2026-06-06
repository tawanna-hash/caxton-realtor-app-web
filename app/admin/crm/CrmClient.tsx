'use client';

// app/admin/crm/CrmClient.tsx
//
// CRM workspace: searchable + filterable list of advertisers (which
// double as CRM contacts) with a side drawer for editing PressBook
// fields (phone, address, status, notes, tags, additional contacts).
//
// Design language matches Caxton admin:
//   • serif Georgia titles, eyebrow text-sm uppercase tracking-[0.2em]
//   • rounded-xl cards, gray-200 borders, blue-600 primary buttons
//
// Existing transactional `/admin/advertisers` page is unchanged; this
// page reads + writes the same row.

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type {
  AdvertiserCrmRow,
  AdvertiserStatus,
  AdvertiserType,
} from '@/lib/advertisers';
import { PUBLICATION_OPTIONS } from '@/lib/publication-theme';

type Props = { initialRows: AdvertiserCrmRow[] };

const STATUS_OPTIONS: { value: AdvertiserStatus; label: string; tone: string }[] = [
  { value: 'active',   label: 'Active',   tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'prospect', label: 'Prospect', tone: 'bg-sky-50 text-sky-700 border-sky-200' },
  { value: 'paused',   label: 'Paused',   tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'archived', label: 'Archived', tone: 'bg-gray-100 text-gray-600 border-gray-200' },
];

const TYPE_OPTIONS: { value: AdvertiserType; label: string }[] = [
  { value: 'advertiser', label: 'Advertiser' },
  { value: 'client',     label: 'Client' },
  { value: 'prospect',   label: 'Prospect' },
  { value: 'mailing',    label: 'Mailing only' },
];

export default function CrmClient({ initialRows }: Props) {
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<AdvertiserStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<AdvertiserType | 'all'>('all');
  const [pubFilter, setPubFilter] = useState<string>('all');
  const [editing, setEditing] = useState<AdvertiserCrmRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // ── filtering ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (pubFilter !== 'all' && (r.publication ?? 'austin') !== pubFilter) return false;
      if (!q) return true;
      const hay = [
        r.name, r.company, r.first_name, r.last_name,
        r.contact_email, r.portal_email, r.phone, r.office_phone,
        r.city, r.state, r.notes,
        ...(r.tags ?? []),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, statusFilter, typeFilter, pubFilter]);

  // ── counts for filter chips ─────────────────────────────────────
  const statusCounts = useMemo(() => {
    const c: Record<AdvertiserStatus, number> = { active: 0, prospect: 0, paused: 0, archived: 0 };
    for (const r of rows) c[r.status ?? 'active'] = (c[r.status ?? 'active'] ?? 0) + 1;
    return c;
  }, [rows]);

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/advertisers', { cache: 'no-store' });
      if (res.status === 401) { router.push('/admin/login'); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // The list endpoint already returns advertisers; we re-derive
      // last_click_at from rows[*].last_click_at if present, otherwise
      // null. Detailed reload is fine; full-page refresh path:
      if (Array.isArray(data.advertisers)) {
        setRows((prev) => {
          // Merge: keep prior last_click_at since list endpoint may
          // not include it yet.
          const byId = new Map(prev.map((p) => [p.id, p.last_click_at]));
          return data.advertisers.map((a: AdvertiserCrmRow) => ({
            ...a,
            last_click_at: byId.get(a.id) ?? a.last_click_at ?? null,
          }));
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'reload failed');
    }
  }, [router]);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-5">
      {/* Header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
            Admin · CRM
          </div>
          <h1 className="text-3xl text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>
            Advertisers &amp; contacts
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            CRM workspace for advertiser relationships. Search, filter, and edit contact details, status, notes, and tags.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/advertisers"
            className="px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            Ad management →
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Filters ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, phone, city, tags…"
            className="flex-1 min-w-[240px] px-3 py-2 rounded border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as AdvertiserType | 'all')}
            className="px-3 py-2 rounded border border-gray-300 text-sm"
          >
            <option value="all">All types</option>
            {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select
            value={pubFilter}
            onChange={(e) => setPubFilter(e.target.value)}
            className="px-3 py-2 rounded border border-gray-300 text-sm"
          >
            <option value="all">All publications</option>
            {PUBLICATION_OPTIONS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <StatusChip label="All" active={statusFilter === 'all'} count={rows.length} onClick={() => setStatusFilter('all')} />
          {STATUS_OPTIONS.map((s) => (
            <StatusChip
              key={s.value}
              label={s.label}
              tone={s.tone}
              active={statusFilter === s.value}
              count={statusCounts[s.value] ?? 0}
              onClick={() => setStatusFilter(s.value)}
            />
          ))}
        </div>
      </div>

      {/* List ───────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="grid grid-cols-12 gap-3 px-4 py-2 text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200 bg-gray-50">
          <div className="col-span-4">Contact</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Publication</div>
          <div className="col-span-2">Hotspots / 30d</div>
          <div className="col-span-2">Last touch</div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-500">
            No contacts match your filters.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((r) => (
              <button
                key={r.id}
                onClick={() => setEditing(r)}
                className="w-full grid grid-cols-12 gap-3 px-4 py-3 text-left hover:bg-blue-50/40 transition"
              >
                <div className="col-span-4 min-w-0">
                  <div className="font-medium text-gray-900 truncate">{r.name}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {[r.contact_email, r.phone].filter(Boolean).join(' · ') || r.slug}
                  </div>
                </div>
                <div className="col-span-2">
                  <StatusBadge status={r.status ?? 'active'} />
                </div>
                <div className="col-span-2 text-sm text-gray-700">
                  {r.publication ?? 'austin'}
                </div>
                <div className="col-span-2 text-sm text-gray-700">
                  {r.hotspot_count} <span className="text-gray-400">·</span>{' '}
                  <span className="text-gray-500">{r.clicks_30d} clicks</span>
                </div>
                <div className="col-span-2 text-sm text-gray-500">
                  {r.last_click_at ? relativeTime(r.last_click_at) : '—'}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Edit drawer ─────────────────────────────────────────────── */}
      {editing && (
        <EditDrawer
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
          onError={(msg) => setError(msg)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Filter chip
// ─────────────────────────────────────────────────────────────────
function StatusChip({
  label, active, count, tone, onClick,
}: {
  label: string; active: boolean; count: number; tone?: string; onClick: () => void;
}) {
  const base = active
    ? 'bg-blue-600 text-white border-blue-600'
    : tone || 'bg-white text-gray-700 border-gray-300';
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full border text-xs font-medium ${base}`}
    >
      {label} <span className="opacity-70">({count})</span>
    </button>
  );
}

function StatusBadge({ status }: { status: AdvertiserStatus }) {
  const opt = STATUS_OPTIONS.find((s) => s.value === status) ?? STATUS_OPTIONS[0];
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${opt.tone}`}>
      {opt.label}
    </span>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const day = 1000 * 60 * 60 * 24;
  if (diff < day) return 'today';
  if (diff < 2 * day) return 'yesterday';
  if (diff < 30 * day) return `${Math.floor(diff / day)}d ago`;
  if (diff < 365 * day) return `${Math.floor(diff / (30 * day))}mo ago`;
  return `${Math.floor(diff / (365 * day))}y ago`;
}

// ─────────────────────────────────────────────────────────────────
// Edit drawer
// ─────────────────────────────────────────────────────────────────
function EditDrawer({
  row, onClose, onSaved, onError,
}: {
  row: AdvertiserCrmRow;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  // Portal magic-link state — separate from the form so it doesn't bleed
  // into the PATCH payload. Result holds the consume URL + email status
  // returned by /api/admin/portal-links.
  const [sendingLink, setSendingLink] = useState(false);
  const [linkResult, setLinkResult] = useState<{ url?: string; status?: string; error?: string } | null>(null);

  // Submission-token state. We mirror row.submission_token in local state
  // so the drawer reflects the new token immediately after Generate without
  // a full page reload.
  const [submissionToken, setSubmissionToken] = useState<string | null>(
    row.submission_token ?? null,
  );
  const [tokenBusy, setTokenBusy] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const regenerateSubmissionToken = async () => {
    if (
      submissionToken &&
      !window.confirm(
        'A submission link already exists. Generating a new one will invalidate the old link. Continue?',
      )
    ) {
      return;
    }
    setTokenBusy(true);
    setTokenError(null);
    try {
      const res = await fetch(
        `/api/admin/advertisers/${row.id}/regenerate-submission-token`,
        { method: 'POST' },
      );
      const data = await res.json();
      if (!res.ok) {
        setTokenError(data?.error ?? `HTTP ${res.status}`);
        return;
      }
      setSubmissionToken(data.submission_token);
    } catch (err) {
      setTokenError(err instanceof Error ? err.message : 'failed');
    } finally {
      setTokenBusy(false);
    }
  };

  const submissionUrl = submissionToken
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/submit-event/${submissionToken}`
    : null;

  const copySubmissionUrl = async () => {
    if (!submissionUrl) return;
    try {
      await navigator.clipboard.writeText(submissionUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Fall back to a manual select if clipboard API is blocked.
    }
  };

  const sendPortalLink = async (
    purpose: 'login' | 'sign_agreement' | 'pay_invoice' | 'form' = 'login',
  ) => {
    setSendingLink(true);
    setLinkResult(null);
    try {
      const res = await fetch('/api/admin/portal-links', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ advertiser_id: row.id, purpose }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLinkResult({ error: data?.error ?? `HTTP ${res.status}` });
        return;
      }
      setLinkResult({ url: data.consume_url, status: data.email_status });
    } catch (err) {
      setLinkResult({ error: err instanceof Error ? err.message : 'send failed' });
    } finally {
      setSendingLink(false);
    }
  };

  const [form, setForm] = useState({
    type:           row.type           ?? 'advertiser',
    status:         row.status         ?? 'active',
    first_name:     row.first_name     ?? '',
    last_name:      row.last_name      ?? '',
    company:        row.company        ?? '',
    title:          row.title          ?? '',
    industry:       row.industry       ?? '',
    license_number: row.license_number ?? '',
    phone:          row.phone          ?? '',
    office_phone:   row.office_phone   ?? '',
    website:        row.website        ?? '',
    address:        row.address        ?? '',
    address_2:      row.address_2      ?? '',
    city:           row.city           ?? '',
    state:          row.state          ?? '',
    zip:            row.zip            ?? '',
    notes:          row.notes          ?? '',
    tags:           (row.tags ?? []).join(', '),
  });
  const [saving, setSaving] = useState(false);

  const update = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      };
      const res = await fetch(`/api/admin/advertisers/${row.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* backdrop */}
      <div className="flex-1 bg-black/30" onClick={onClose} />
      {/* drawer */}
      <div className="w-full max-w-xl bg-white shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium">CRM contact</div>
            <h2 className="text-xl text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>{row.name}</h2>
            <div className="text-xs text-gray-500 mt-0.5">{row.slug}</div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-6">
          <Section title="Classification">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <select value={form.type} onChange={(e) => update('type', e.target.value as AdvertiserType)} className={INPUT}>
                  {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select value={form.status} onChange={(e) => update('status', e.target.value as AdvertiserStatus)} className={INPUT}>
                  {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>
            </div>
          </Section>

          <Section title="Person">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name"><input value={form.first_name} onChange={(e) => update('first_name', e.target.value)} className={INPUT} /></Field>
              <Field label="Last name"><input value={form.last_name} onChange={(e) => update('last_name', e.target.value)} className={INPUT} /></Field>
              <Field label="Title"><input value={form.title} onChange={(e) => update('title', e.target.value)} className={INPUT} /></Field>
              <Field label="Company"><input value={form.company} onChange={(e) => update('company', e.target.value)} className={INPUT} /></Field>
              <Field label="Industry"><input value={form.industry} onChange={(e) => update('industry', e.target.value)} className={INPUT} /></Field>
              <Field label="License #"><input value={form.license_number} onChange={(e) => update('license_number', e.target.value)} className={INPUT} /></Field>
            </div>
          </Section>

          <Section title="Contact">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mobile phone"><input value={form.phone} onChange={(e) => update('phone', e.target.value)} className={INPUT} /></Field>
              <Field label="Office phone"><input value={form.office_phone} onChange={(e) => update('office_phone', e.target.value)} className={INPUT} /></Field>
              <Field label="Website" className="col-span-2"><input value={form.website} onChange={(e) => update('website', e.target.value)} className={INPUT} placeholder="https://" /></Field>
            </div>
          </Section>

          <Section title="Portal access">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-gray-900">Magic link</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Single-use, valid 24h. Sends to{' '}
                    <span className="font-mono text-gray-700">
                      {row.portal_email || row.contact_email || '— no email on file'}
                    </span>.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => sendPortalLink('login')}
                  disabled={sendingLink || (!row.portal_email && !row.contact_email)}
                  className="shrink-0 rounded-lg bg-gray-900 text-white px-3 py-1.5 text-sm hover:bg-gray-800 disabled:opacity-50"
                >
                  {sendingLink ? 'Sending…' : 'Send portal link'}
                </button>
              </div>
              {linkResult?.error && (
                <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 px-3 py-2 text-xs">
                  {linkResult.error}
                </div>
              )}
              {linkResult?.url && (
                <div className="space-y-1">
                  <div className="text-xs text-gray-600">
                    {linkResult.status === 'sent'
                      ? '✓ Email sent.'
                      : linkResult.status === 'failed'
                      ? '✕ Email failed — copy URL below:'
                      : 'Email skipped — copy URL below:'}
                  </div>
                  <input
                    readOnly
                    value={linkResult.url}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs font-mono"
                  />
                </div>
              )}
            </div>
          </Section>

          <Section title="Event submission link">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-gray-900">Public submission form</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Share this URL with the advertiser so they can submit
                    events directly into the review queue. Each submission
                    lands in the Events queue for your approval.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={regenerateSubmissionToken}
                  disabled={tokenBusy}
                  className="shrink-0 rounded-lg bg-gray-900 text-white px-3 py-1.5 text-sm hover:bg-gray-800 disabled:opacity-50"
                >
                  {tokenBusy
                    ? 'Working…'
                    : submissionToken
                    ? 'Regenerate'
                    : 'Generate link'}
                </button>
              </div>
              {tokenError && (
                <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 px-3 py-2 text-xs">
                  {tokenError}
                </div>
              )}
              {submissionUrl ? (
                <div className="space-y-1">
                  <div className="flex gap-2 items-center">
                    <input
                      readOnly
                      value={submissionUrl}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                      className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={copySubmissionUrl}
                      className="shrink-0 rounded border border-gray-300 px-2 py-1 text-xs bg-white hover:bg-gray-50"
                    >
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <a
                    href={submissionUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 underline"
                  >
                    Open form in new tab ↗
                  </a>
                </div>
              ) : (
                <div className="text-xs text-gray-500">
                  No link yet — click Generate to issue one.
                </div>
              )}
            </div>
          </Section>

          <Section title="Mailing address">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Street" className="col-span-2"><input value={form.address} onChange={(e) => update('address', e.target.value)} className={INPUT} /></Field>
              <Field label="Apt / Suite" className="col-span-2"><input value={form.address_2} onChange={(e) => update('address_2', e.target.value)} className={INPUT} /></Field>
              <Field label="City"><input value={form.city} onChange={(e) => update('city', e.target.value)} className={INPUT} /></Field>
              <Field label="State"><input value={form.state} onChange={(e) => update('state', e.target.value)} className={INPUT} /></Field>
              <Field label="ZIP"><input value={form.zip} onChange={(e) => update('zip', e.target.value)} className={INPUT} /></Field>
            </div>
          </Section>

          <Section title="Tags & notes">
            <Field label="Tags (comma-separated)">
              <input value={form.tags} onChange={(e) => update('tags', e.target.value)} className={INPUT} placeholder="vip, repeat, annual-contract" />
            </Field>
            <Field label="Notes">
              <textarea
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                rows={4}
                className={`${INPUT} resize-y`}
              />
            </Field>
          </Section>

          <div className="sticky bottom-0 -mx-6 px-6 py-4 bg-white border-t border-gray-200 flex items-center justify-between">
            <div className="text-xs text-gray-500">
              Last updated {row.updated_at ? new Date(row.updated_at).toLocaleString() : '—'}
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={saving}
                className="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const INPUT = 'w-full px-3 py-2 rounded border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium">{title}</div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <div className="text-xs text-gray-600 mb-1">{label}</div>
      {children}
    </label>
  );
}
