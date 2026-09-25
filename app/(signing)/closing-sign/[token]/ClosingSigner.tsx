'use client';
/* eslint-disable @next/next/no-img-element -- Local data URL preview; it is never fetched from a remote image host. */

import { useEffect, useRef, useState } from 'react';

type Invitation = { name: string; page: number; position: number; total: number };
type Method = 'type' | 'draw' | 'upload';

export default function ClosingSigner({ token }: { token: string }) {
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [error, setError] = useState('');
  const [method, setMethod] = useState<Method>('type');
  const [name, setName] = useState('');
  const [signature, setSignature] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const url = `/api/closing-sign/${encodeURIComponent(token)}`;
  useEffect(() => {
    void fetch(url, { cache: 'no-store' }).then(async response => {
      const data = await response.json() as Invitation & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Invitation unavailable.');
      setInvitation(data);
    }).catch(reason => setError(reason instanceof Error ? reason.message : 'Invitation unavailable.'));
  }, [url]);
  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const element = event.currentTarget;
    const bounds = element.getBoundingClientRect();
    const context = element.getContext('2d');
    if (!context) return;
    context.strokeStyle = '#17213d';
    context.lineWidth = 2.5;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.lineTo((event.clientX - bounds.left) * element.width / bounds.width, (event.clientY - bounds.top) * element.height / bounds.height);
    context.stroke();
    setSignature(element.toDataURL('image/png'));
  };
  const submit = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, agreed, method, signature: method === 'type' ? name : signature }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Signature could not be saved.');
      setDone(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Signature could not be saved.');
    } finally { setBusy(false); }
  };
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 text-slate-900">
      <h1 className="text-2xl font-bold">Review and sign contract</h1>
      {done ? <p role="status" className="mt-6 rounded border border-emerald-300 bg-emerald-50 p-5">
        Your signature was recorded. The agent retains the signed contract and will share the completed copy.
      </p> : invitation ? (
        <>
          <p className="mt-2 text-sm text-slate-600">Invitation for {invitation.name}. Signer {invitation.position} of {invitation.total}. Your signature will appear on page {invitation.page}.</p>
          <p className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm">Review every page before signing. This invitation is private; do not forward it.</p>
          <iframe title="Full contract PDF to review" src={`${url}?pdf=1`} className="mt-4 h-[60vh] w-full border border-slate-300" />
          <a href={`${url}?pdf=1`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-[#301D5D] underline">Open or save full PDF before signing</a>
          <section className="mt-6 rounded border border-slate-300 p-5">
            <h2 className="text-lg font-bold">Your electronic signature</h2>
            <p className="mt-1 text-sm text-slate-600">Enter your full name exactly as invited: {invitation.name}.</p>
            <input value={name} onChange={event => setName(event.target.value)} placeholder="Full legal name"
              aria-label="Full legal name" className="mt-3 w-full rounded border border-slate-300 p-3 sm:max-w-md" />
            <div className="mt-4 flex gap-2">
              {(['type', 'draw', 'upload'] as Method[]).map(option => (
                <button key={option} type="button" onClick={() => { setMethod(option); setSignature(''); }}
                  className={`rounded border px-3 py-2 text-sm font-semibold ${method === option ? 'border-[#301D5D] bg-[#301D5D] text-white' : 'border-slate-300'}`}>
                  {option === 'type' ? 'Type' : option === 'draw' ? 'Draw' : 'Upload'}
                </button>
              ))}
            </div>
            {method === 'type' && <p className="mt-3 rounded border border-slate-200 bg-slate-50 p-4 font-serif text-2xl italic">{name || 'Your name'}</p>}
            {method === 'draw' && <div className="mt-3">
              <canvas ref={canvas} width={600} height={140} className="w-full max-w-[600px] touch-none border border-slate-300 bg-white"
                onPointerDown={event => {
                  drawing.current = true;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  const context = event.currentTarget.getContext('2d');
                  const rect = event.currentTarget.getBoundingClientRect();
                  context?.beginPath();
                  context?.moveTo((event.clientX - rect.left) * 600 / rect.width, (event.clientY - rect.top) * 140 / rect.height);
                }}
                onPointerMove={draw} onPointerUp={() => { drawing.current = false; }} />
              <button type="button" className="block text-sm text-[#301D5D] underline" onClick={() => {
                canvas.current?.getContext('2d')?.clearRect(0, 0, 600, 140); setSignature('');
              }}>Clear drawing</button>
            </div>}
            {method === 'upload' && <input type="file" accept="image/png,image/jpeg" className="mt-4 block text-sm"
              onChange={event => {
                const file = event.target.files?.[0];
                if (!file || !['image/png', 'image/jpeg'].includes(file.type) || file.size > 1_000_000) {
                  setError('Choose a PNG or JPEG under 1 MB.'); return;
                }
                const reader = new FileReader();
                reader.onload = () => setSignature(String(reader.result));
                reader.readAsDataURL(file);
              }} />}
            {method === 'upload' && signature && <img alt="Uploaded signature preview" src={signature} className="mt-3 max-h-20 max-w-xs border" />}
            <label className="mt-5 flex items-start gap-2 text-sm">
              <input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} className="mt-1" />
              <span>I have reviewed the contract, consent to use electronic records and signatures, and intend my signature to sign this contract.</span>
            </label>
            <button type="button" disabled={busy || !agreed || name.trim().toLowerCase() !== invitation.name.toLowerCase() || (method !== 'type' && !signature)}
              onClick={() => void submit()} className="mt-5 rounded bg-[#301D5D] px-5 py-3 font-bold text-white disabled:opacity-40">
              {busy ? 'Signing…' : 'Sign contract'}
            </button>
          </section>
        </>
      ) : <p className="mt-6">Loading your private invitation…</p>}
      {error && <p role="alert" className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
    </main>
  );
}
