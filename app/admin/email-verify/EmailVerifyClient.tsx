// app/admin/email-verify/EmailVerifyClient.tsx
//
// Client UI for the standalone admin email-verifier tool.
//
// Two tabs:
//   • Single  — type one address, hit Check, see verdict + signals + MX/SMTP
//   • Bulk    — paste a list or upload a CSV (max 100), see results table
//
// All verification calls go through /api/admin/email-verify[/bulk] which
// is admin-gated and runs the same lib/email-verify.ts pipeline used by
// the mailing-list flows. Nothing is written to the database here.

'use client';

import { useMemo, useRef, useState } from 'react';
import PageTitle from '@/components/ui/PageTitle';
import MailingBreadcrumb from '@/components/admin/MailingBreadcrumb';

// ─────────────────────────────────────────────────────────────────
// Types — mirror the API response shapes
// ─────────────────────────────────────────────────────────────────

type Verdict = 'Valid' | 'Invalid' | 'Pending';

type Signals = {
  syntaxOk: boolean;
  disposable: boolean;
  roleAccount: boolean;
  freeProvider: boolean;
  hasMx: boolean;
  smtpConnected: boolean;
  mailboxExists: boolean | null;
  catchAll: boolean | null;
  smtpTimedOut: boolean;
  mxAttempts: number;
  managedMailProvider: 'microsoft365-eop' | 'google-workspace' | 'proofpoint' | null;
};

type SingleResponse = {
  ok: true;
  verdict: Verdict;
  detail: string;
  mx: string | null;
  smtpCode: number | null;
  risk: number;
  signals: Signals;
  suggestion: string | null;
  normalized: string | null;
};

type BulkRow = {
  input: string;
  verdict: Verdict;
  detail: string;
  mx: string | null;
  smtpCode: number | null;
  risk: number;
  signals: Signals;
  suggestion: string | null;
  normalized: string | null;
};

type BulkResponse = {
  ok: true;
  total: number;
  summary: { valid: number; invalid: number; pending: number };
  results: BulkRow[];
};

const MAX_BULK = 100;

// ─────────────────────────────────────────────────────────────────
// Verdict + signal presentation helpers
// ─────────────────────────────────────────────────────────────────

function verdictClasses(v: Verdict): string {
  switch (v) {
    case 'Valid':
      return 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200';
    case 'Invalid':
      return 'bg-rose-50 text-rose-800 ring-1 ring-rose-200';
    case 'Pending':
      return 'bg-amber-50 text-amber-800 ring-1 ring-amber-200';
  }
}

function Pill({
  children,
  tone = 'gray',
}: {
  children: React.ReactNode;
  tone?: 'gray' | 'red' | 'amber' | 'emerald' | 'indigo';
}) {
  const tones: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-700 ring-gray-200',
    red: 'bg-rose-50 text-rose-700 ring-rose-200',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function SignalBadges({ signals }: { signals: Signals }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {signals.disposable && <Pill tone="red">disposable</Pill>}
      {signals.roleAccount && <Pill tone="amber">role account</Pill>}
      {signals.freeProvider && <Pill tone="indigo">free provider</Pill>}
      {signals.catchAll === true && <Pill tone="amber">catch-all</Pill>}
      {signals.managedMailProvider && (
        <Pill tone="indigo">{signals.managedMailProvider}</Pill>
      )}
      {signals.smtpTimedOut && !signals.smtpConnected && (
        <Pill tone="amber">smtp timeout</Pill>
      )}
      {signals.hasMx && <Pill tone="gray">mx</Pill>}
      {signals.smtpConnected && <Pill tone="emerald">smtp ok</Pill>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// CSV helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Pull email-shaped tokens out of free-form input — newlines, commas,
 * semicolons, tabs, spaces. Dedupes case-insensitively while preserving
 * the first-seen original casing.
 */
function extractEmails(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tok of raw.split(/[\s,;]+/)) {
    const trimmed = tok.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/** Minimal CSV escape — quote if the cell contains a delimiter or quote. */
function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows: BulkRow[]): string {
  const header = [
    'input',
    'normalized',
    'verdict',
    'detail',
    'risk',
    'mx',
    'smtp_code',
    'syntax_ok',
    'disposable',
    'role_account',
    'free_provider',
    'has_mx',
    'smtp_connected',
    'mailbox_exists',
    'catch_all',
    'managed_mail_provider',
    'suggestion',
  ];
  const body = rows.map((r) =>
    [
      r.input,
      r.normalized,
      r.verdict,
      r.detail,
      r.risk,
      r.mx,
      r.smtpCode,
      r.signals.syntaxOk,
      r.signals.disposable,
      r.signals.roleAccount,
      r.signals.freeProvider,
      r.signals.hasMx,
      r.signals.smtpConnected,
      r.signals.mailboxExists,
      r.signals.catchAll,
      r.signals.managedMailProvider,
      r.suggestion,
    ]
      .map(csvCell)
      .join(','),
  );
  return [header.join(','), ...body].join('\n');
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────

type Tab = 'single' | 'bulk';

export default function EmailVerifyClient() {
  const [tab, setTab] = useState<Tab>('single');

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <MailingBreadcrumb
        trail={[
          { label: 'Mailing', href: '/admin/mailing' },
          { label: 'Verify Emails' },
        ]}
      />

      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
          Tools
        </p>
        <PageTitle size="md">Verify Emails</PageTitle>
        <p className="mt-2 text-sm text-gray-600 max-w-2xl">
          Ad-hoc check for any address — syntax, disposable detection, MX
          resolution, and an SMTP probe. Same verifier the mailing list uses,
          but results are not written anywhere. Use the verify button inside a
          mailing segment when you want a verdict persisted on the contact.
        </p>
      </div>

      {/* Tabs */}
      <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
        <button
          type="button"
          onClick={() => setTab('single')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${
            tab === 'single'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Single
        </button>
        <button
          type="button"
          onClick={() => setTab('bulk')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${
            tab === 'bulk'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Bulk ({MAX_BULK} max)
        </button>
      </div>

      {tab === 'single' ? <SinglePanel /> : <BulkPanel />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Single panel
// ─────────────────────────────────────────────────────────────────

function SinglePanel() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SingleResponse | null>(null);

  async function onCheck(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/admin/email-verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = await res.json();
      if (!res.ok || !body?.ok) {
        setError(body?.error || `Request failed (${res.status})`);
      } else {
        setResult(body as SingleResponse);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={onCheck}
        className="flex flex-col sm:flex-row gap-3 sm:items-center"
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="someone@example.com"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800 disabled:opacity-50 whitespace-nowrap"
        >
          {loading ? 'Checking…' : 'Check email'}
        </button>
      </form>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}

      {result && <SingleResultCard result={result} />}
    </div>
  );
}

function SingleResultCard({ result }: { result: SingleResponse }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${verdictClasses(result.verdict)}`}
        >
          {result.verdict}
        </span>
        <span className="text-sm text-gray-700">{result.detail}</span>
        <span className="ml-auto text-xs text-gray-500">
          Risk {result.risk}/100
        </span>
      </div>

      {result.suggestion && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Did you mean <span className="font-mono">{result.suggestion}</span>?
        </div>
      )}

      <SignalBadges signals={result.signals} />

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <Detail label="Normalized" value={result.normalized || '—'} mono />
        <Detail label="MX" value={result.mx || '—'} mono />
        <Detail
          label="SMTP code"
          value={result.smtpCode !== null ? String(result.smtpCode) : '—'}
          mono
        />
        <Detail
          label="MX attempts"
          value={String(result.signals.mxAttempts)}
          mono
        />
        <Detail
          label="Mailbox exists"
          value={
            result.signals.mailboxExists === null
              ? 'unknown'
              : result.signals.mailboxExists
                ? 'yes'
                : 'no'
          }
        />
        <Detail
          label="Catch-all"
          value={
            result.signals.catchAll === null
              ? 'unknown'
              : result.signals.catchAll
                ? 'yes'
                : 'no'
          }
        />
      </dl>
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 border-b border-gray-100 pb-1.5">
      <dt className="text-gray-500">{label}</dt>
      <dd
        className={`text-gray-900 text-right ${mono ? 'font-mono text-xs' : ''}`}
      >
        {value}
      </dd>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Bulk panel
// ─────────────────────────────────────────────────────────────────

function BulkPanel() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<BulkResponse | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parsedEmails = useMemo(() => extractEmails(text), [text]);
  const overLimit = parsedEmails.length > MAX_BULK;

  async function onUploadCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const raw = await f.text();
    setText((prev) => (prev ? prev + '\n' : '') + raw);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function onVerify() {
    if (parsedEmails.length === 0 || overLimit) return;
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const res = await fetch('/api/admin/email-verify/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emails: parsedEmails }),
      });
      const body = await res.json();
      if (!res.ok || !body?.ok) {
        setError(body?.error || `Request failed (${res.status})`);
      } else {
        setResponse(body as BulkResponse);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }

  function onExport() {
    if (!response) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadCsv(`email-verify-${stamp}.csv`, rowsToCsv(response.results));
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={`Paste emails separated by newlines, commas, or spaces.\nUp to ${MAX_BULK} addresses per batch.`}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          spellCheck={false}
        />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span
            className={`${overLimit ? 'text-rose-700' : 'text-gray-600'}`}
          >
            {parsedEmails.length} unique address
            {parsedEmails.length === 1 ? '' : 'es'} detected
            {overLimit && ` — over ${MAX_BULK} limit`}
          </span>
          <label className="ml-auto inline-flex items-center gap-2 cursor-pointer text-gray-700 hover:text-gray-900">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={onUploadCsv}
              className="hidden"
            />
            <span className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50">
              Upload CSV / TXT
            </span>
          </label>
          <button
            type="button"
            onClick={() => {
              setText('');
              setResponse(null);
              setError(null);
            }}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onVerify}
            disabled={loading || parsedEmails.length === 0 || overLimit}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800 disabled:opacity-50 whitespace-nowrap"
          >
            {loading ? 'Verifying…' : `Verify ${parsedEmails.length || ''}`.trim()}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}

      {response && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <BulkKpi label="Valid" value={response.summary.valid} tone="emerald" />
            <BulkKpi label="Pending" value={response.summary.pending} tone="amber" />
            <BulkKpi label="Invalid" value={response.summary.invalid} tone="red" />
          </div>

          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-900">
              Results · {response.total}
            </h2>
            <button
              type="button"
              onClick={onExport}
              className="ml-auto rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Export CSV
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Verdict</th>
                  <th className="px-3 py-2 font-medium">Detail</th>
                  <th className="px-3 py-2 font-medium">Signals</th>
                  <th className="px-3 py-2 font-medium text-right">Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {response.results.map((r, i) => (
                  <tr key={`${r.input}-${i}`} className="align-top">
                    <td className="px-3 py-2 font-mono text-xs text-gray-900 break-all">
                      {r.input}
                      {r.suggestion && (
                        <div className="text-[11px] text-amber-700 mt-0.5">
                          → {r.suggestion}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${verdictClasses(r.verdict)}`}
                      >
                        {r.verdict}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{r.detail}</td>
                    <td className="px-3 py-2">
                      <SignalBadges signals={r.signals} />
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600 tabular-nums">
                      {r.risk}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function BulkKpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'emerald' | 'amber' | 'red';
}) {
  const tones: Record<typeof tone, string> = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    red: 'border-rose-200 bg-rose-50 text-rose-900',
  };
  return (
    <div className={`rounded-lg border px-4 py-3 ${tones[tone]}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
