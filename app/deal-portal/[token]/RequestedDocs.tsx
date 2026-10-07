'use client';

import { useRef, useState } from 'react';

type Req = { id: string; label: string; note: string; status: 'pending' | 'uploaded' | 'received' };

const STATUS = { pending: 'Pending', uploaded: 'Uploaded', received: 'Received' } as const;

function Row({ token, req }: { token: string; req: Req }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState(req.status);
  const [busy, setBusy] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  const [error, setError] = useState('');

  async function send(files: File[]) {
    setBusy(true); setError('');
    for (const file of files) {
      const body = new FormData();
      body.set('file', file); body.set('docId', `req:${req.id}`);
      try {
        const res = await fetch(`/api/deal-portal/${token}/upload`, { method: 'POST', body });
        if (!res.ok) { setError((await res.json()).error ?? 'Upload failed.'); continue; }
        setNames((n) => [...n, file.name]);
        setStatus((s) => (s === 'pending' ? 'uploaded' : s));
      } catch { setError('Upload failed. Try again.'); }
    }
    setBusy(false);
  }

  return (
    <li className="border-b border-[#d4d8dd] py-3 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14px] font-medium text-[#292a2d]">{req.label}</div>
          {req.note && <div className="text-[12px] font-medium text-[#51555b]">{req.note}</div>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-medium" style={{ color: status === 'pending' ? '#51555b' : '#005a8f' }}>{STATUS[status]}</span>
          {status !== 'received' && (
            <>
              <button type="button" disabled={busy} onClick={() => input.current?.click()} className="rounded-lg border border-[#d4d8dd] bg-white px-3 py-2 text-[13px] font-medium text-[#292a2d] transition hover:border-[#005a8f] hover:bg-[#005a8f] hover:text-white disabled:opacity-45">
                {busy ? 'Uploading' : status === 'pending' ? 'Upload' : 'Upload More'}
              </button>
              <input ref={input} type="file" multiple accept="application/pdf,image/*" className="sr-only" onChange={(e) => { const list = e.target.files; if (list?.length) void send(Array.from(list)); e.target.value = ''; }} />
            </>
          )}
        </div>
      </div>
      {names.length > 0 && <div className="mt-1 text-[12px] font-medium text-[#51555b]">Sent to your agent: {names.join(', ')}</div>}
      {error && <div role="alert" className="mt-1 text-[12px] font-medium text-[#661102]">{error}</div>}
    </li>
  );
}

export default function RequestedDocs({ token, requests, agentName }: { token: string; requests: Req[]; agentName: string }) {
  if (requests.length === 0) return null;
  return (
    <section className="rounded-[10px] border border-[#005a8f] bg-white">
      <h2 className="border-b border-[#d4d8dd] px-4 py-4 text-[14px] font-semibold text-[#292a2d]">Requested From You</h2>
      <ul className="px-4">{requests.map((r) => <Row key={r.id} token={token} req={r} />)}</ul>
    </section>
  );
}
