'use client';

import { useEffect, useRef, useState } from 'react';

type Party = { name: string; email: string; page: number; x: number; y: number; signedAt?: string };
type Envelope = { id: string; status: string; step: number; parties: Party[] };

export default function ClosingSigningSetup({ originalId }: { originalId: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(1);
  const [parties, setParties] = useState<Party[]>([{ name: '', email: '', page: 0, x: 0, y: 0 }]);
  const [selected, setSelected] = useState(0);
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const url = `/api/agent-command-center/contracts/original?id=${encodeURIComponent(originalId)}`;

  const refresh = async () => {
    const response = await fetch(`/api/agent-command-center/contracts/signing?originalId=${encodeURIComponent(originalId)}`, { cache: 'no-store' });
    if (response.ok) {
      const data = await response.json() as { envelopes: Envelope[] };
      setEnvelopes(data.envelopes);
    }
  };
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/agent-command-center/contracts/signing?originalId=${encodeURIComponent(originalId)}`, { cache: 'no-store' })
      .then(async response => response.ok ? response.json() as Promise<{ envelopes: Envelope[] }> : null)
      .then(data => { if (!cancelled && data) setEnvelopes(data.envelopes); });
    return () => { cancelled = true; };
  }, [originalId]);
  useEffect(() => {
    let cancelled = false;
    let task: { destroy: () => Promise<void> } | undefined;
    void (async () => {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error('Original PDF unavailable.');
      task = pdfjs.getDocument({ data: await response.arrayBuffer() });
      const pdf = await (task as ReturnType<typeof pdfjs.getDocument>).promise;
      if (cancelled) return;
      setTotal(pdf.numPages);
      const pdfPage = await pdf.getPage(page);
      const viewport = pdfPage.getViewport({ scale: 1 });
      const scale = Math.min(1.5, 740 / viewport.width);
      const view = pdfPage.getViewport({ scale });
      const element = canvas.current;
      const context = element?.getContext('2d');
      if (!element || !context || cancelled) return;
      element.width = view.width;
      element.height = view.height;
      await pdfPage.render({ canvasContext: context, viewport: view }).promise;
    })().catch(() => { if (!cancelled) setMessage('Could not preview this PDF.'); });
    return () => { cancelled = true; if (task) void task.destroy(); };
  }, [url, page]);
  const updateParty = (index: number, update: Partial<Party>) =>
    setParties(previous => previous.map((party, i) => i === index ? { ...party, ...update } : party));
  const act = async (payload: Record<string, unknown>) => {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/agent-command-center/contracts/signing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const result = await response.json() as { error?: string; message?: string; sent?: boolean };
      if (!response.ok) throw new Error(result.error || 'Could not send invitation.');
      setMessage(result.message || 'Invitation sent.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send invitation.');
    } finally { setBusy(false); }
  };
  const active = envelopes.find(envelope => envelope.status === 'active' || envelope.status === 'processing');
  return (
    <section className="mx-auto mb-4 max-w-[1020px] rounded-md border border-slate-300 bg-white p-4">
      <h3 className="text-base font-bold text-slate-900">Sign this original PDF</h3>
      <p className="mt-1 text-sm text-slate-600">Add every party in signing order. Select a party, then click their signature spot on the page. The original is never overwritten.</p>
      {envelopes.map(envelope => (
        <div key={envelope.id} className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
          <span className="font-semibold">{envelope.status === 'complete' ? 'Completed' : `Waiting for ${envelope.parties[envelope.step]?.name ?? 'signer'}`}</span>
          <span className="ml-2 text-slate-600">{envelope.parties.filter(p => p.signedAt).length}/{envelope.parties.length} signed</span>
          {envelope.status === 'complete'
            ? <>
                <a className="ml-3 font-semibold text-[#301D5D] underline" target="_blank" rel="noreferrer"
                  href={`/api/agent-command-center/contracts/signing?signedId=${encodeURIComponent(envelope.id)}`}>View signed PDF</a>
                <a className="ml-3 font-semibold text-[#301D5D] underline" target="_blank" rel="noreferrer"
                  href={`/api/agent-command-center/contracts/signing?auditId=${encodeURIComponent(envelope.id)}`}>Audit record</a>
              </>
            : <button className="ml-3 font-semibold text-[#301D5D] underline" disabled={busy}
                onClick={() => void act({ action: 'resend', envelopeId: envelope.id })}>Resend invitation</button>}
        </div>
      ))}
      {!active && (
        <>
          <div className="mt-4 grid gap-2">
            {parties.map((party, index) => (
              <div key={index} className={`grid gap-2 rounded border p-2 sm:grid-cols-[1fr_1fr_auto] ${selected === index ? 'border-[#301D5D]' : 'border-slate-200'}`}>
                <input aria-label={`Signer ${index + 1} name`} placeholder={`Party ${index + 1} full name`} value={party.name}
                  onFocus={() => setSelected(index)} onChange={event => updateParty(index, { name: event.target.value })}
                  className="rounded border border-slate-300 px-2 py-2 text-sm" />
                <input aria-label={`Signer ${index + 1} email`} type="email" placeholder="Email address" value={party.email}
                  onFocus={() => setSelected(index)} onChange={event => updateParty(index, { email: event.target.value })}
                  className="rounded border border-slate-300 px-2 py-2 text-sm" />
                <button onClick={() => setSelected(index)} className="text-sm font-semibold text-[#301D5D]">
                  {party.page ? `Page ${party.page} placed` : 'Place signature'}
                </button>
              </div>
            ))}
            <button type="button" onClick={() => { setParties(old => [...old, { name: '', email: '', page: 0, x: 0, y: 0 }]); setSelected(parties.length); }}
              disabled={parties.length >= 8} className="justify-self-start text-sm font-semibold text-[#301D5D] underline">Add another party</button>
            {parties.length > 1 && <button type="button" onClick={() => setParties(old => old.filter((_, i) => i !== selected))}
              className="justify-self-start text-sm text-slate-600 underline">Remove selected party</button>}
          </div>
          <div className="my-3 flex items-center justify-center gap-4 text-sm">
            <button disabled={page <= 1} onClick={() => setPage(n => n - 1)}>Previous</button>
            <span>Page {page} of {total}, placing {parties[selected]?.name || `party ${selected + 1}`}</span>
            <button disabled={page >= total} onClick={() => setPage(n => n + 1)}>Next</button>
          </div>
          <div className="mx-auto w-fit max-w-full overflow-auto border border-slate-300">
            <div className="relative w-fit">
            <canvas ref={canvas} role="button" tabIndex={0} aria-label="Click the spot for this party’s signature"
              onClick={event => {
                const rect = event.currentTarget.getBoundingClientRect();
                const x = (event.clientX - rect.left) / rect.width;
                const y = (event.clientY - rect.top) / rect.height;
                updateParty(selected, { page, x: Math.min(.7, x), y: Math.min(.93, y) });
              }} />
            {parties.filter(p => p.page === page).map((party, i) => (
              <span key={`${party.email}-${i}`} className="pointer-events-none absolute border border-[#301D5D] bg-violet-100/70 px-1 text-xs font-bold text-[#301D5D]"
                style={{ left: `${party.x * 100}%`, top: `${party.y * 100}%`, width: '28%', height: 32 }}>
                {party.name || 'Signature'}
              </span>
            ))}
            </div>
          </div>
          <button type="button" disabled={busy || parties.some(p => !p.name.trim() || !p.email.trim() || !p.page)}
            onClick={() => void act({ action: 'create', originalId, parties })}
            className="mt-4 rounded bg-[#301D5D] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">
            {busy ? 'Preparing…' : 'Send first signing invitation'}
          </button>
        </>
      )}
      {message && <p role="status" className="mt-3 text-sm text-slate-700">{message}</p>}
    </section>
  );
}
