'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import PageTitle from '@/components/ui/PageTitle';
import MailingBreadcrumb from '@/components/admin/MailingBreadcrumb';

type Stats = {
  unified: Record<string, number>;
  subscribers: { total: number; unverified: number };
  holdingPending: number;
  mailing: Record<string, number>;
};

type CheckRow = {
  input: string;
  verdict: 'Valid' | 'Invalid' | 'Pending';
  detail: string;
  suggestion: string | null;
};

const VERDICT_STYLE: Record<string, string> = {
  Valid: 'bg-green-50 text-green-800 border-green-200',
  Invalid: 'bg-red-50 text-red-800 border-red-200',
  Pending: 'bg-amber-50 text-amber-800 border-amber-200',
};

async function api<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as T;
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-gray-500">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 tabular-nums">{value.toLocaleString()}</p>
      {sub ? <p className="text-xs text-gray-500">{sub}</p> : null}
    </div>
  );
}

export default function VerifyHubClient() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<'subs' | 'holding' | null>(null);
  const [log, setLog] = useState<string>('');
  const stopRef = useRef(false);

  const [text, setText] = useState('');
  const [checking, setChecking] = useState(false);
  const [rows, setRows] = useState<CheckRow[]>([]);

  const refresh = useCallback(async () => {
    try {
      const s = await api<Stats & { ok: boolean }>('/api/admin/mailing/verify');
      setStats(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load stats');
    }
  }, []);

  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, [refresh]);

  async function runSubs() {
    stopRef.current = false;
    setRunning('subs');
    let done = 0;
    try {
      for (let i = 0; i < 500 && !stopRef.current; i++) {
        const r = await api<{ processed: number; remaining: number }>('/api/admin/mailing/verify', { batchSize: 40 });
        done += r.processed;
        setLog(`Verified ${done.toLocaleString()} subscriber emails. ${r.remaining.toLocaleString()} remaining.`);
        if (r.processed === 0 || r.remaining === 0) break;
      }
    } catch (e) {
      setLog(e instanceof Error ? e.message : 'Verification stopped');
    }
    setRunning(null);
    void refresh();
  }

  async function runHolding() {
    stopRef.current = false;
    setRunning('holding');
    let done = 0;
    try {
      for (let i = 0; i < 500 && !stopRef.current; i++) {
        const r = await api<{ processed: number; remaining_before: number; remaining_after: number }>(
          '/api/admin/mailing/holding/verify-all-pending',
          { batchSize: 60, concurrency: 10 },
        );
        done += r.processed;
        setLog(`Verified ${done.toLocaleString()} ABOR/SABOR contacts. ${(r.remaining_after ?? 0).toLocaleString()} remaining.`);
        if (r.processed === 0 || (r.remaining_after ?? 0) === 0) break;
      }
    } catch (e) {
      setLog(e instanceof Error ? e.message : 'Verification stopped');
    }
    setRunning(null);
    void refresh();
  }

  async function check() {
    const emails = Array.from(new Set(text.split(/[\s,;]+/).map((s) => s.trim()).filter((s) => s.includes('@')))).slice(0, 100);
    if (emails.length === 0) return;
    setChecking(true);
    try {
      const r = await api<{ results: CheckRow[] }>('/api/admin/email-verify/bulk', { emails });
      setRows(r.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check failed');
    }
    setChecking(false);
  }

  const u = stats?.unified ?? {};
  const m = stats?.mailing ?? {};

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <MailingBreadcrumb trail={[{ label: 'Mailing', href: '/admin/mailing' }, { label: 'Email Verifier' }]} />
      <PageTitle size="md">Email Verifier</PageTitle>
      <p className="text-sm text-gray-600 max-w-3xl">
        Check email deliverability for the lists in this hub. Results are stored with each contact and shown as badges across the admin.
      </p>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <section>
        <h2 className="text-sm font-semibold text-gray-900 mb-2">Status across lists</h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Stat label="Valid" value={(u.valid ?? 0)} sub="app + newsletter" />
          <Stat label="Risky" value={u.risky ?? 0} sub="catch-all / managed mail" />
          <Stat label="Invalid" value={u.invalid ?? 0} />
          <Stat label="Unknown" value={(u.unknown ?? 0) + (u.pending ?? 0)} />
          <Stat label="Not yet checked" value={stats?.subscribers.unverified ?? 0} sub={`of ${(stats?.subscribers.total ?? 0).toLocaleString()} subscribers`} />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-3">
          <Stat label="Mailing: Valid" value={m.Valid ?? 0} />
          <Stat label="Mailing: Invalid" value={m.Invalid ?? 0} />
          <Stat label="Mailing: Pending" value={m.Pending ?? 0} />
          <Stat label="Mailing: Unchecked" value={m.Unchecked ?? 0} />
          <Stat label="ABOR/SABOR pending" value={stats?.holdingPending ?? 0} sub="holding contacts" />
        </div>
      </section>

      <section className="border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Verify lists</h2>
        <p className="text-xs text-gray-500 mb-3">Runs in batches and keeps going until done. Keep this page open; you can stop at any time.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={running !== null} onClick={runSubs}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-700 disabled:opacity-50">
            {running === 'subs' ? 'Verifying…' : 'Verify app and newsletter subscribers'}
          </button>
          <button type="button" disabled={running !== null} onClick={runHolding}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-700 disabled:opacity-50">
            {running === 'holding' ? 'Verifying…' : 'Verify ABOR / SABOR pending'}
          </button>
          {running ? (
            <button type="button" onClick={() => { stopRef.current = true; }}
              className="px-4 py-2 text-sm font-medium border border-gray-300 text-gray-700">
              Stop
            </button>
          ) : null}
        </div>
        {log ? <p className="mt-3 text-sm text-gray-700" aria-live="polite">{log}</p> : null}
      </section>

      <section className="border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Check addresses</h2>
        <p className="text-xs text-gray-500 mb-3">Paste up to 100 emails, separated by lines, spaces, or commas. Nothing is saved.</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
          className="w-full border border-gray-300 p-2 text-sm" placeholder="name@example.com" />
        <button type="button" disabled={checking || !text.trim()} onClick={check}
          className="mt-2 px-4 py-2 text-sm font-medium text-white bg-brand-700 disabled:opacity-50">
          {checking ? 'Checking…' : 'Check'}
        </button>
        {rows.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="py-1 pr-4">Email</th><th className="py-1 pr-4">Result</th><th className="py-1">Detail</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.input} className="border-t border-gray-100">
                    <td className="py-1.5 pr-4 break-all">{r.input}</td>
                    <td className="py-1.5 pr-4">
                      <span className={`inline-block border px-2 py-0.5 text-xs font-medium ${VERDICT_STYLE[r.verdict] ?? ''}`}>{r.verdict}</span>
                    </td>
                    <td className="py-1.5 text-gray-600">
                      {r.detail}{r.suggestion ? ` Did you mean ${r.suggestion}?` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
