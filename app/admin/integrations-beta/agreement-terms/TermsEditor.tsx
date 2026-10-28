'use client';

import { useEffect, useState } from 'react';
import { A } from '@/components/anchor/ui';

type Version = { id: number; body: string; effective_at: string; note: string; created_by: string; created_at: string };

const fmt = (iso: string) => (new Date(iso).getFullYear() < 1980 ? 'Original' : new Date(iso).toLocaleString());

export default function TermsEditor() {
  const [versions, setVersions] = useState<Version[]>([]);
  const [body, setBody] = useState('');
  const [note, setNote] = useState('');
  const [eff, setEff] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    fetch('/api/admin/agreement-terms')
      .then((r) => r.json())
      .then((d: { versions?: Version[]; error?: string }) => {
        if (d.versions) {
          setVersions(d.versions);
          const cur = d.versions.find((v) => new Date(v.effective_at).getTime() <= Date.now()) ?? d.versions[0];
          if (cur) setBody(cur.body);
        } else setMsg({ ok: false, text: d.error ?? 'Could not load terms.' });
      })
      .catch(() => setMsg({ ok: false, text: 'Could not load terms.' }));
  }, []);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/admin/agreement-terms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body, note, effective_at: eff ? new Date(eff).toISOString() : undefined }),
      });
      const d = (await r.json()) as { versions?: Version[]; error?: string };
      if (d.versions) {
        setVersions(d.versions);
        setNote('');
        setMsg({ ok: true, text: 'Saved as a new version.' });
      } else setMsg({ ok: false, text: d.error ?? 'Save failed.' });
    } finally {
      setBusy(false);
    }
  }

  const currentId = versions.find((v) => new Date(v.effective_at).getTime() <= now)?.id;

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6" data-anchor-ui="true" data-no-auto-open>
      <div>
        <h1 className={A.title}>Agreement terms</h1>
        <p className="mt-1 text-sm text-[color:var(--ds-body)]">
          Each save creates a dated version. Agreements signed earlier keep the terms in effect when they were signed. Unsigned agreements and the public terms page use the version in effect now.
        </p>
      </div>
      {msg && <div className={msg.ok ? A.notice : A.error}>{msg.text}</div>}
      <div className="space-y-3 rounded-[10px] bg-white p-4">
        <label className="block text-sm font-medium">Terms text</label>
        <textarea className={`${A.input} font-mono`} rows={22} value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium">Effective date and time</label>
            <input type="datetime-local" className={A.input} value={eff} onChange={(e) => setEff(e.target.value)} />
            <p className="mt-1 text-xs text-[color:var(--ds-body)]">Leave blank to take effect now.</p>
          </div>
          <div>
            <label className="block text-sm font-medium">Note</label>
            <input className={A.input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed" />
          </div>
        </div>
        <button className={A.primary} disabled={busy || body.trim().length < 200} onClick={save}>
          {busy ? 'Saving' : 'Save new version'}
        </button>
      </div>
      <div className="space-y-2 rounded-[10px] bg-white p-4">
        <h2 className="text-base font-semibold">Version history</h2>
        {versions.map((v) => (
          <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--ds-line)] pt-2 text-sm">
            <div>
              <div className="font-medium">
                {fmt(v.effective_at)} {v.id === currentId && <span className="ml-2 text-xs text-green-700">In effect</span>}
                {new Date(v.effective_at).getTime() > now && <span className="ml-2 text-xs text-amber-700">Scheduled</span>}
              </div>
              <div className="text-xs text-[color:var(--ds-body)]">{v.note || 'No note'} · {v.created_by}</div>
            </div>
            <button className={A.small} onClick={() => setBody(v.body)}>Load into editor</button>
          </div>
        ))}
      </div>
    </div>
  );
}
