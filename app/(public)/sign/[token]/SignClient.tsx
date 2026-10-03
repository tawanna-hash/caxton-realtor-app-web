'use client';

import { useEffect, useRef, useState } from 'react';
import SignPdfPages from '@/components/SignPdfPages';

type Field = { id: string; signer: number; type: 'signature' | 'date'; page: number; x: number; y: number; w: number; h: number };
type View = { state: 'ready' | 'waiting' | 'completed' | 'declined' | 'cancelled' | 'expired'; document: string; property: string; agentName: string; signerName: string; fields: Field[]; signedBy: number; total: number; fingerprint: string };
type Mark = { kind: 'typed' | 'drawn'; value: string };

function SigImg({ src }: { src: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="Your signature" className="max-h-full max-w-full object-contain" />;
}

const btn = 'min-h-[44px] rounded-md px-5 text-sm font-bold disabled:opacity-45';

function DrawPad({ onDone, onCancel }: { onDone: (png: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * e.currentTarget.width, y: ((e.clientY - r.top) / r.height) * e.currentTarget.height }; };
  return (
    <div>
      <canvas ref={ref} width={600} height={200} className="w-full touch-none rounded-md border border-slate-300 bg-white" aria-label="Draw your signature"
        onPointerDown={(e) => { drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); const c = e.currentTarget.getContext('2d'); if (!c) return; const p = pos(e); c.lineWidth = 3; c.lineCap = 'round'; c.strokeStyle = '#0d1a59'; c.beginPath(); c.moveTo(p.x, p.y); }}
        onPointerMove={(e) => { if (!drawing.current) return; const c = e.currentTarget.getContext('2d'); if (!c) return; const p = pos(e); c.lineTo(p.x, p.y); c.stroke(); setDirty(true); }}
        onPointerUp={() => { drawing.current = false; }} />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={`${btn} border border-slate-300 text-slate-700`} onClick={() => { const c = ref.current; c?.getContext('2d')?.clearRect(0, 0, c.width, c.height); setDirty(false); }}>Clear</button>
        <button type="button" className={`${btn} border border-slate-300 text-slate-700`} onClick={onCancel}>Cancel</button>
        <button type="button" disabled={!dirty} className={`${btn} bg-[#301D5D] text-white`} onClick={() => ref.current && onDone(ref.current.toDataURL('image/png'))}>Use This Signature</button>
      </div>
    </div>
  );
}

export default function SignClient({ token }: { token: string }) {
  const [view, setView] = useState<View | null>(null);
  const [missing, setMissing] = useState(false);
  const [consent, setConsent] = useState(false);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [mode, setMode] = useState<'type' | 'draw'>('type');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<'signed' | 'declined' | null>(null);
  const [width, setWidth] = useState(720);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    const fit = () => setWidth(Math.max(280, Math.min(760, window.innerWidth - 32)));
    fit(); window.addEventListener('resize', fit);
    void (async () => {
      const res = await fetch(`/api/sign/${token}`, { cache: 'no-store' });
      if (!res.ok) { setMissing(true); return; }
      const v = (await res.json()) as View; setView(v); setTyped(v.signerName);
    })();
    return () => window.removeEventListener('resize', fit);
  }, [token]);

  const post = async (payload: Record<string, unknown>) => {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/sign/${token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? 'Something went wrong.'); return null; }
      return body;
    } finally { setBusy(false); }
  };

  if (missing) return <main className="mx-auto max-w-xl px-4 py-16"><h1 className="text-2xl font-bold text-[#301D5D]">This link is not valid</h1><p className="mt-2 text-slate-600">Ask the sender for a new signing link.</p></main>;
  if (!view) return <main className="mx-auto max-w-xl px-4 py-16 text-slate-500">Loading.</main>;

  const message: Record<string, string> = {
    waiting: `Thank you. You have signed. Waiting for the others (${view.signedBy} of ${view.total} done). You will get the signed copy by email.`,
    completed: 'Everyone has signed. Download the completed copy below.',
    declined: 'This document was declined.', cancelled: 'The sender cancelled this request.', expired: 'This signing link has expired. Ask the sender for a new one.',
  };
  const sigFields = view.fields.filter((f) => f.type === 'signature');
  const allSigned = sigFields.every((f) => marks[f.id]);
  const today = new Date().toLocaleDateString('en-US');

  if (done || view.state !== 'ready') {
    const text = done === 'signed' ? 'Thank you. You have signed. You will get the completed copy by email once everyone has signed.' : done === 'declined' ? 'You declined to sign. The sender has been told.' : message[view.state];
    return (
      <main className="mx-auto max-w-xl px-4 py-12">
        <h1 className="text-2xl font-bold text-[#301D5D]">{view.document}</h1>
        <p className="mt-1 text-sm text-slate-600">{view.property}</p>
        <p className="mt-6 border border-slate-200 bg-white p-4 text-slate-900" role="status">{text}</p>
        {view.state === 'completed' && <a className={`${btn} mt-4 inline-flex items-center bg-[#301D5D] text-white`} href={`/api/sign/${token}/pdf?download=1`}>Download Signed Copy</a>}
      </main>
    );
  }

  const apply = (m: Mark) => { if (editing) setMarks({ ...marks, [editing]: m }); setEditing(null); };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7059A8]">Closing Time SecureSign</p>
      <h1 className="mt-1 text-2xl font-bold text-[#301D5D]">{view.document}</h1>
      <p className="mt-1 text-sm text-slate-600">{view.property} · sent by {view.agentName} · for {view.signerName}</p>

      <section className="mt-5 border border-slate-200 bg-white p-4 text-sm text-slate-800">
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 h-5 w-5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>I agree to use electronic records and signatures for this document. I understand my electronic signature has the same legal effect as a handwritten one, that I can ask the sender for a paper copy, and that I can stop at any time by declining.</span>
        </label>
      </section>

      <div className="mt-6">
        <SignPdfPages url={`/api/sign/${token}/pdf`} width={width} overlay={(page) => view.fields.filter((f) => f.page === page).map((f) => {
          const style = { left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` };
          if (f.type === 'date') return <div key={f.id} style={style} className="absolute flex items-center border border-dashed border-[#7059A8]/60 bg-[#F8F5FF]/70 px-1 text-xs text-slate-700">{today}</div>;
          const m = marks[f.id];
          return (
            <button key={f.id} type="button" style={style} disabled={!consent} onClick={() => { setEditing(f.id); setMode('type'); }}
              className={`absolute flex items-center justify-center overflow-hidden border-2 text-xs font-bold ${m ? 'border-emerald-600 bg-white' : 'border-[#9A3D2B] bg-[#FFF5F2] text-[#9A3D2B] animate-pulse'} disabled:animate-none disabled:opacity-60`} aria-label="Signature box">
              {m ? (m.kind === 'drawn' ? <SigImg src={m.value} /> : <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 'clamp(12px,3.2vw,22px)', color: '#0d1a59' }}>{m.value}</span>) : 'Sign here'}
            </button>
          );
        })} />
      </div>

      {error && <p className="mt-3 text-sm font-semibold text-[#9A3D2B]" role="alert">{error}</p>}
      {!consent && <p className="mt-3 text-sm text-slate-600">Check the box above to start signing.</p>}

      <div className="sticky bottom-0 mt-6 flex flex-wrap items-center gap-3 border-t border-slate-200 bg-white/95 py-3">
        <button type="button" disabled={busy || !consent || !allSigned} className={`${btn} bg-[#301D5D] text-white`} onClick={async () => { const r = await post({ action: 'sign', consent, marks }); if (r) { setDone('signed'); window.scrollTo(0, 0); } }}>Finish And Sign</button>
        <button type="button" disabled={busy} className={`${btn} border border-slate-300 text-slate-700`} onClick={() => setDeclining(true)}>Decline To Sign</button>
        <span className="text-xs text-slate-500">{sigFields.filter((f) => marks[f.id]).length} of {sigFields.length} signature boxes done</span>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-label="Add your signature">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-950">Add your signature</h2>
            <div className="mt-3 flex gap-2">
              <button type="button" className={`${btn} ${mode === 'type' ? 'bg-[#301D5D] text-white' : 'border border-slate-300 text-slate-700'}`} onClick={() => setMode('type')}>Type</button>
              <button type="button" className={`${btn} ${mode === 'draw' ? 'bg-[#301D5D] text-white' : 'border border-slate-300 text-slate-700'}`} onClick={() => setMode('draw')}>Draw</button>
            </div>
            {mode === 'type' ? (
              <div className="mt-4">
                <input value={typed} onChange={(e) => setTyped(e.target.value)} maxLength={80} aria-label="Type your full name" className="min-h-[44px] w-full rounded-md border border-slate-300 px-3" />
                <p className="mt-3 rounded-md border border-slate-200 p-4 text-center text-3xl text-[#0d1a59]" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>{typed || ' '}</p>
                <div className="mt-3 flex gap-2"><button type="button" className={`${btn} border border-slate-300 text-slate-700`} onClick={() => setEditing(null)}>Cancel</button><button type="button" disabled={typed.trim().length < 2} className={`${btn} bg-[#301D5D] text-white`} onClick={() => apply({ kind: 'typed', value: typed.trim() })}>Use This Signature</button></div>
              </div>
            ) : <div className="mt-4"><DrawPad onCancel={() => setEditing(null)} onDone={(png) => apply({ kind: 'drawn', value: png })} /></div>}
          </div>
        </div>
      )}

      {declining && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-label="Decline to sign">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-950">Decline to sign</h2>
            <p className="mt-2 text-sm text-slate-600">This stops the request for everyone. You can tell the sender why (optional).</p>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} className="mt-3 w-full rounded-md border border-slate-300 p-2 text-sm" aria-label="Reason" />
            <div className="mt-3 flex gap-2"><button type="button" className={`${btn} border border-slate-300 text-slate-700`} onClick={() => setDeclining(false)}>Go Back</button><button type="button" disabled={busy} className={`${btn} bg-[#9A3D2B] text-white`} onClick={async () => { const r = await post({ action: 'decline', reason }); if (r) { setDeclining(false); setDone('declined'); } }}>Decline</button></div>
          </div>
        </div>
      )}
    </main>
  );
}
