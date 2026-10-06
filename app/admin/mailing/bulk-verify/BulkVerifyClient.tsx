'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import PageTitle from '@/components/ui/PageTitle';
import MailingBreadcrumb from '@/components/admin/MailingBreadcrumb';

const LISTS = [
  { id: 'realtyline', label: 'RealtyLine (Austin)' },
  { id: 'newsline', label: 'Newsline (San Antonio)' },
  { id: 'realtyline-houston', label: 'RealtyLine (Houston)' },
  { id: 'realtyline-dallas', label: 'RealtyLine (Dallas/Ft. Worth)' },
];

type Job = {
  id: number; label: string; total: number; status: string; percent: number;
  applied_at: string | null; summary: Record<string, number> | null; created_at: string;
};

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as T;
}

export default function BulkVerifyClient() {
  const [list, setList] = useState(LISTS[0].id);
  const [emails, setEmails] = useState<string[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const stopRef = useRef(false);

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/email-verify/bulk-file', { credentials: 'include', cache: 'no-store' });
      if (res.ok) setJobs(((await res.json()) as { jobs: Job[] }).jobs);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { queueMicrotask(() => { void loadJobs(); }); }, [loadJobs]);
  const active = jobs.some((j) => !j.applied_at && j.status !== 'canceled');
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => { void loadJobs(); }, 10000);
    return () => clearInterval(t);
  }, [active, loadJobs]);

  async function load() {
    setLoading(true); setMsg(''); setEmails(null);
    try {
      const res = await fetch(`/api/admin/mailing/publication-list?list=${list}&format=json`, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error(`Could not load list (${res.status})`);
      const j = (await res.json()) as { rows: Array<{ email: string; verification_status: string }> };
      const todo = Array.from(new Set(j.rows.filter((r) => r.verification_status === 'unverified').map((r) => r.email.toLowerCase())));
      setTotal(j.rows.length);
      setEmails(todo);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Load failed');
    }
    setLoading(false);
  }

  async function runBatches() {
    if (!emails || emails.length === 0) return;
    if (!window.confirm(`Verify ${emails.length.toLocaleString()} addresses? This uses up to ${emails.length.toLocaleString()} MillionVerifier credits.`)) return;
    stopRef.current = false; setRunning(true);
    const counts: Record<string, number> = {};
    let done = 0;
    try {
      for (let i = 0; i < emails.length && !stopRef.current; i += 60) {
        const r = await post<{ counts: Record<string, number> }>('/api/admin/email-verify/batch', { emails: emails.slice(i, i + 60) });
        for (const [k, v] of Object.entries(r.counts)) counts[k] = (counts[k] ?? 0) + v;
        done = Math.min(i + 60, emails.length);
        setMsg(`Checked ${done.toLocaleString()} of ${emails.length.toLocaleString()}. ` +
          Object.entries(counts).map(([k, v]) => `${k}: ${v.toLocaleString()}`).join(', '));
      }
      if (stopRef.current) setMsg((m) => `Stopped. ${m}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Stopped on an error');
    }
    setRunning(false);
  }

  async function sendFile() {
    if (!emails || emails.length === 0) return;
    if (!window.confirm(`Send ${emails.length.toLocaleString()} addresses to MillionVerifier as a file? This uses up to ${emails.length.toLocaleString()} credits.`)) return;
    setRunning(true);
    try {
      const label = LISTS.find((l) => l.id === list)?.label ?? list;
      await post('/api/admin/email-verify/bulk-file', { emails, label });
      setMsg('File sent. Progress appears below; results are saved automatically when it finishes.');
      await loadJobs();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Upload failed');
    }
    setRunning(false);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <MailingBreadcrumb trail={[{ label: 'Mailing', href: '/admin/mailing' }, { label: 'Bulk Email Verify' }]} />
      <PageTitle size="md">Bulk Email Verify</PageTitle>
      <p className="text-sm text-gray-600 max-w-3xl">
        Verifies every address on a publication list that has not been checked yet. Each address uses one MillionVerifier credit.
        Results show as badges on the list and the Verify button.
      </p>

      <section className="border border-gray-200 bg-white p-4 space-y-3">
        <label className="block text-sm font-semibold text-gray-900" htmlFor="bv-list">List</label>
        <div className="flex flex-wrap gap-2 items-center">
          <select id="bv-list" value={list} onChange={(e) => { setList(e.target.value); setEmails(null); }}
            className="border border-gray-300 px-2 py-2 text-sm">
            {LISTS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          <button type="button" onClick={load} disabled={loading || running}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-700 disabled:opacity-50">
            {loading ? 'Loading…' : 'Count unchecked'}
          </button>
        </div>
        {emails ? (
          <div className="text-sm text-gray-800">
            <p><strong>{emails.length.toLocaleString()}</strong> of {total.toLocaleString()} addresses not yet checked. Up to {emails.length.toLocaleString()} credits.</p>
            {emails.length > 50000 ? <p className="text-[#645600]">Lists over 50,000 are sent in the first 50,000. Run again for the rest.</p> : null}
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="border border-gray-200 p-3">
                <p className="font-medium">Verify in batches</p>
                <p className="text-xs text-gray-500 mb-2">Checks 60 at a time while this page stays open. Best for up to a few thousand.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={runBatches} disabled={running || emails.length === 0}
                    className="px-3 py-2 text-sm font-medium text-white bg-brand-700 disabled:opacity-50">
                    {running ? 'Working…' : 'Start'}
                  </button>
                  {running ? <button type="button" onClick={() => { stopRef.current = true; }} className="px-3 py-2 text-sm border border-gray-300">Stop</button> : null}
                </div>
              </div>
              <div className="border border-gray-200 p-3">
                <p className="font-medium">Send as a file</p>
                <p className="text-xs text-gray-500 mb-2">MillionVerifier processes it on their side. You can close this page; results are saved when you return.</p>
                <button type="button" onClick={sendFile} disabled={running || emails.length === 0}
                  className="px-3 py-2 text-sm font-medium text-white bg-brand-700 disabled:opacity-50">
                  Send file
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {msg ? <p className="text-sm text-gray-700" aria-live="polite">{msg}</p> : null}
      </section>

      <section className="border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-2">File jobs</h2>
        {jobs.length === 0 ? <p className="text-sm text-gray-500">No file jobs yet.</p> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                <th className="py-1 pr-3">Sent</th><th className="py-1 pr-3">List</th><th className="py-1 pr-3">Emails</th><th className="py-1 pr-3">Status</th><th className="py-1">Results</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-t border-gray-100 align-top">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{new Date(j.created_at).toLocaleString()}</td>
                  <td className="py-1.5 pr-3">{j.label}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{j.total.toLocaleString()}</td>
                  <td className="py-1.5 pr-3">{j.applied_at ? 'Saved' : j.status === 'canceled' ? 'Canceled' : `Processing ${j.percent}%`}</td>
                  <td className="py-1.5 text-gray-700">
                    {j.summary ? ('error' in j.summary ? String((j.summary as Record<string, unknown>).error) :
                      Object.entries(j.summary).map(([k, v]) => `${k}: ${v.toLocaleString()}`).join(', ')) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
