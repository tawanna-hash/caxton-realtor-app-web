'use client';

import { useState } from 'react';
import SignPdfPages from '@/components/SignPdfPages';

export type PlacedField = { signer: number; type: 'signature' | 'date'; page: number; x: number; y: number; w: number; h: number };
const COLORS = ['#301D5D', '#9A3D2B', '#1B6B5C', '#8A5A00', '#2F5DA8', '#7A2F7A'];
const SIZE = { signature: { w: 0.3, h: 0.055 }, date: { w: 0.18, h: 0.03 } };

export default function SignaturePlacer({ data, signers, fields, onChange, onClose }: { data: Uint8Array; signers: string[]; fields: PlacedField[]; onChange: (f: PlacedField[]) => void; onClose: () => void }) {
  const [who, setWho] = useState(0);
  const [type, setType] = useState<'signature' | 'date'>('signature');
  const missing = signers.filter((_, i) => !fields.some((f) => f.signer === i && f.type === 'signature'));
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="Place signature fields">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-3 text-sm">
        <strong>Place Fields in the Contract</strong>
        <label className="flex items-center gap-1">Signer
          <select className="min-h-[36px] rounded-md border border-slate-300 px-2" value={who} onChange={(e) => setWho(Number(e.target.value))}>{signers.map((s, i) => <option key={s + i} value={i}>{s}</option>)}</select></label>
        <label className="flex items-center gap-1">Field
          <select className="min-h-[36px] rounded-md border border-slate-300 px-2" value={type} onChange={(e) => setType(e.target.value as 'signature' | 'date')}><option value="signature">Signature</option><option value="date">Date</option></select></label>
        <span className="text-slate-600">Click the page to place it. Click a placed field to remove it.</span>
        <button type="button" className="ml-auto min-h-[36px] rounded-md bg-[#301D5D] px-4 font-bold text-white" onClick={onClose}>Done</button>
      </div>
      {missing.length > 0 && <p className="bg-amber-50 px-3 py-2 text-xs text-amber-900">Still needs a signature field: {missing.join(', ')}</p>}
      <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-4">
        <SignPdfPages data={data} width={Math.min(760, typeof window === 'undefined' ? 760 : window.innerWidth - 48)}
          onPageClick={(page, fx, fy) => { const sz = SIZE[type]; onChange([...fields, { signer: who, type, page, x: Math.min(1 - sz.w, Math.max(0, fx - sz.w / 2)), y: Math.min(1 - sz.h, Math.max(0, fy - sz.h / 2)), w: sz.w, h: sz.h }]); }}
          overlay={(page) => fields.map((f, i) => f.page === page ? (
            <button key={i} type="button" onClick={(e) => { e.stopPropagation(); onChange(fields.filter((_, j) => j !== i)); }} aria-label={`Remove ${f.type} for ${signers[f.signer]}`}
              style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%`, borderColor: COLORS[f.signer % 6], color: COLORS[f.signer % 6] }}
              className="absolute flex items-center justify-center overflow-hidden border-2 bg-white/70 text-[10px] font-bold">{f.type === 'date' ? 'Date' : 'Sign'}: {signers[f.signer]}</button>) : null)} />
      </div>
    </div>
  );
}
