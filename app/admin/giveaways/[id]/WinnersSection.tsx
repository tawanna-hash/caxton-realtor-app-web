'use client';

import { useCallback, useEffect, useState } from 'react';

type Winner = {
  realtor_id: string; email: string; first_name: string; last_name: string;
  drawn_at: string; email_status: 'sent' | 'failed' | 'pending'; email_sent_at: string | null; email_error: string | null;
};

async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method, credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

export default function WinnersSection({ giveawayId, endsAtPassed, onChange }: {
  giveawayId: string; endsAtPassed: boolean; onChange: () => void | Promise<void>;
}) {
  const [winners, setWinners] = useState<Winner[]>([]);
  const [announcedAt, setAnnouncedAt] = useState<string | null>(null);
  const [count, setCount] = useState(3);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ winners: Winner[]; announcedAt: string | null }>(`/admin/giveaways/${giveawayId}/winners`);
      setWinners(d.winners); setAnnouncedAt(d.announcedAt);
    } catch (e) { setErr((e as Error).message); }
  }, [giveawayId]);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key); setErr(null); setMsg(null);
    try { setMsg(await fn()); await load(); await onChange(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  };

  const drawMore = () => {
    if (!confirm(`Draw ${count} additional winner${count === 1 ? '' : 's'}? Each will be emailed, and you will get a summary.`)) return;
    void run('draw', async () => {
      const d = await api<{ drawn: number; requested: number }>(`/admin/giveaways/${giveawayId}/draw`, 'POST', { count, additional: true });
      return d.drawn < d.requested ? `Drew ${d.drawn} of ${d.requested} (no more eligible entrants).` : `Drew ${d.drawn} winner${d.drawn === 1 ? '' : 's'}.`;
    });
  };
  const resend = (w: Winner) => void run(`r-${w.realtor_id}`, async () => {
    await api(`/admin/giveaways/${giveawayId}/winners/resend`, 'POST', { realtorId: w.realtor_id });
    return `Email resent to ${w.email}.`;
  });
  const announce = () => {
    if (!confirm('Email every non-winning entrant that winners were announced? This can only be sent once.')) return;
    void run('announce', async () => {
      const d = await api<{ sent: number; failed: number }>(`/admin/giveaways/${giveawayId}/winners/announce`, 'POST');
      return `Announcement sent to ${d.sent} entrants (${d.failed} failed).`;
    });
  };

  if (winners.length === 0) return null;
  const badge = (w: Winner) =>
    w.email_status === 'sent' ? 'bg-[#E0FBE0] text-[#005A00]' : w.email_status === 'failed' ? 'bg-[#FFEAE6] text-[#661102]' : 'bg-gray-100 text-gray-600';
  const label = (w: Winner) => (w.email_status === 'sent' ? 'Email sent' : w.email_status === 'failed' ? 'Email failed' : 'Not recorded');

  return (
    <section className="bg-white border border-gray-200 p-6 rounded-md space-y-4">
      <h2 className="text-sm uppercase tracking-wider text-gray-500">Winners ({winners.length})</h2>
      <ul className="divide-y divide-gray-100">
        {winners.map((w) => (
          <li key={w.realtor_id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
            <div>
              <div className="font-medium text-gray-900">{`${w.first_name} ${w.last_name}`.trim() || w.email}</div>
              <div className="text-xs text-gray-500">{w.email}</div>
              {w.email_error && <div className="text-xs text-[#661102]">{w.email_error}</div>}
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2 py-0.5 rounded ${badge(w)}`}>{label(w)}</span>
              <button onClick={() => resend(w)} disabled={busy !== null}
                className="text-xs text-brand-700 hover:underline disabled:opacity-40">
                {busy === `r-${w.realtor_id}` ? 'Sending...' : 'Resend email'}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100">
        <label className="text-xs text-gray-500">Draw additional</label>
        <input type="number" min={1} max={20} value={count}
          onChange={(e) => setCount(Math.min(20, Math.max(1, parseInt(e.target.value, 10) || 1)))}
          className="w-16 border border-gray-300 px-2 py-1 text-sm rounded-md" />
        <button onClick={drawMore} disabled={!endsAtPassed || busy !== null}
          className="bg-brand-700 text-white px-3 py-1.5 text-sm rounded-md disabled:opacity-40">
          {busy === 'draw' ? 'Drawing...' : 'Draw winners'}
        </button>
        <button onClick={announce} disabled={!!announcedAt || busy !== null}
          className="border border-gray-300 text-gray-800 px-3 py-1.5 text-sm rounded-md disabled:opacity-40">
          {announcedAt ? `Announced ${new Date(announcedAt).toLocaleDateString()}` : busy === 'announce' ? 'Sending...' : 'Notify other entrants'}
        </button>
      </div>
      {msg && <div className="text-sm text-[#005A00]">{msg}</div>}
      {err && <div className="text-sm text-[#661102]">{err}</div>}
    </section>
  );
}
