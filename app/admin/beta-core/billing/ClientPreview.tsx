'use client';

import { useEffect, useState } from 'react';

// Live preview of what the client sees on their sign page. Updates as the form changes.
const STEPS = ['Introduction', 'Review Services', 'Terms Of Service', 'Additional Terms', 'Payment', 'Sign & Approve'];
export type PreviewData = {
  company: string; rep: string; email: string; phone: string;
  address: string; city: string; state: string; zip: string; billingEmail: string;
  askAddress: boolean; renewal: boolean; market: string; timing: string[]; lines: Array<[string, string]>; totalCents: number; methods: string[];
};
const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className={`min-h-[30px] rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs ${value ? 'text-gray-900' : 'text-gray-300'}`}>{value || '—'}</div>
    </div>
  );
}

export default function ClientPreview({ d }: { d: PreviewData }) {
  const [step, setStep] = useState(1);
  const [terms, setTerms] = useState<string | null>(null);
  const [sigTab, setSigTab] = useState<'type' | 'draw' | 'upload'>('type');
  const [intros, setIntros] = useState<{ n: string; r: string } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/admin/agreements-v2/defaults', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => { if (alive && j.defaults) setIntros({ n: String(j.defaults.intro_new ?? ''), r: String(j.defaults.intro_renewal ?? '') }); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    let alive = true;
    fetch('/api/admin/agreement-terms', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        const now = Date.now();
        const v = ((j.versions ?? []) as Array<{ body: string; effective_at: string }>)
          .filter((x) => new Date(x.effective_at).getTime() <= now)
          .sort((a, b) => new Date(b.effective_at).getTime() - new Date(a.effective_at).getTime())[0];
        if (alive) setTerms(v?.body ?? '');
      })
      .catch(() => { if (alive) setTerms(''); });
    return () => { alive = false; };
  }, []);
  const first = d.rep.trim().split(/\s+/)[0] || 'there';
  const introText = ((d.renewal ? intros?.r : intros?.n) ?? 'Loading...').replace(/\{first_name\}/g, first).replace(/\{company\}/g, d.company || 'your company').replace(/\{market\}/g, d.market || 'RealtyLine');
  return (
    <div className="flex h-full flex-col bg-[#F3F4F7]">
      <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] text-gray-500">Client view, live</div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-sm">
          <div className="text-sm font-semibold text-[#1B1740]">{d.market || 'Select a market'}</div>
          <ol className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
            {STEPS.map((s, i) => <li key={s}><button type="button" onClick={() => setStep(i)} className={i === step ? 'font-semibold text-[#5B2BE0]' : 'hover:text-gray-800'}>{s}</button></li>)}
          </ol>
          {step === 0 && (<div className="mt-3 rounded-xl bg-white p-4 text-xs shadow-sm"><div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">{d.renewal ? 'Renewal' : 'New partner'}</div><div className="mt-1 font-semibold text-[#1B1740]">Introduction</div><p className="mt-1 whitespace-pre-line text-gray-700">{introText}</p></div>)}
          {step === 1 && (
          <div className="mt-3 rounded-xl bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-[#1B1740]">Review Your Details</div>
            <div className="text-[11px] text-gray-500">We filled in what we have. Fix anything that is out of date.</div>
            <div className="mt-3 space-y-2">
              <Row label="Company name" value={d.company} />
              <Row label="Contact name" value={d.rep} />
              <Row label="Email" value={d.email} />
              <Row label="Phone" value={d.phone} />
              <Row label="Billing address" value={d.askAddress ? '' : d.address} />
              <div className="grid grid-cols-5 gap-2">
                <div className="col-span-3"><Row label="City" value={d.askAddress ? '' : d.city} /></div>
                <div className="col-span-1"><Row label="State" value={d.askAddress ? '' : d.state} /></div>
                <div className="col-span-1"><Row label="ZIP" value={d.askAddress ? '' : d.zip} /></div>
              </div>
              {d.askAddress && <div className="rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">The client will be asked to complete their billing address.</div>}
              <Row label="Billing email (if different)" value={d.billingEmail} />
            </div>
            <div className="mt-4 text-xs font-semibold text-[#1B1740]">Your Order</div>
            <div className="mt-1 space-y-1 rounded-lg bg-[#EBE6FA] p-3 text-xs">
              {d.lines.length === 0 && <div className="text-gray-500">Choose a product to see the order.</div>}
              {d.lines.map(([k, v]) => <div key={k} className="flex justify-between gap-3"><span className="text-gray-600">{k}</span><span className="text-right text-gray-900">{v}</span></div>)}
              <div className="mt-1 flex justify-between border-t border-[#D6CCF3] pt-1.5 font-semibold"><span>Agreement total</span><span>{usd(d.totalCents)}</span></div>
            </div>
            {d.timing.length > 0 && (<><div className="mt-4 text-xs font-semibold text-[#1B1740]">Ad timing</div><div className="mt-1 flex flex-wrap gap-1">{d.timing.map((t) => <span key={t} className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">{t}</span>)}</div></>)}
            <button type="button" onClick={() => setStep(4)} className="mt-3 w-full rounded-md bg-[#5B2BE0] py-2 text-center text-xs text-white">Continue To Payment</button>
          </div>
          )}
          {step === 2 && (<div className="mt-3 rounded-xl bg-white p-4 text-xs shadow-sm"><div className="font-semibold text-[#1B1740]">Review Terms of Service</div><pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-gray-700" style={{ fontFamily: 'inherit' }}>{terms === null ? 'Loading...' : terms || 'No terms of service are on file yet. Add them under Agreement terms.'}</pre></div>)}
          {step === 3 && (<div className="mt-3 space-y-3 rounded-xl bg-white p-4 text-xs shadow-sm"><div className="font-semibold text-[#1B1740]">Review Additional Terms</div><div><div className="font-semibold text-[#1B1740]">Effective Date of Agreement</div><div className="text-gray-700">On acceptance</div></div><div><div className="font-semibold text-[#1B1740]">Payment Terms</div><div className="text-gray-700">Payment is due as shown on your agreement.</div></div><div><div className="font-semibold text-[#1B1740]">Amendments</div><div className="text-gray-700">Any change to the agreement will require your approval.</div></div></div>)}
          {step === 4 && (
          <div className="mt-3 rounded-xl bg-white p-4 text-xs shadow-sm">
            <div className="font-semibold text-[#1B1740]">How would you like to pay?</div>
            <ul className="mt-1 list-disc pl-4 text-gray-700">{d.methods.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
          )}
          {step === 5 && (<div className="mt-3 rounded-xl bg-white p-4 text-xs shadow-sm"><div className="font-semibold text-[#1B1740]">Sign &amp; Approve</div><div className="mt-2 flex justify-between border-t border-gray-100 pt-2"><span className="text-gray-600">Agreement total</span><span className="font-semibold">{usd(d.totalCents)}</span></div><div className="mt-3 flex gap-1">{(['type', 'draw', 'upload'] as const).map((t) => (<button key={t} type="button" onClick={() => setSigTab(t)} className={`rounded-md border px-3 py-1 capitalize ${sigTab === t ? 'border-[#5B2BE0] bg-[#F1ECFF] font-semibold text-[#5B2BE0]' : 'border-gray-200 text-gray-600'}`}>{t}</button>))}</div><div className="mt-2 flex h-20 items-center justify-center rounded-md border border-gray-200 px-2 text-gray-400">{sigTab === 'type' ? <span style={{ fontFamily: 'cursive', fontSize: 20 }}>{d.rep || 'Type your full name'}</span> : sigTab === 'draw' ? 'Draw your signature here' : 'Upload a signature image or signed PDF'}</div><label className="mt-2 flex items-center gap-2 text-gray-600"><input type="checkbox" disabled /> I accept the agreement terms</label><div className="mt-3 rounded-md bg-[#5B2BE0] py-2 text-center text-white">Sign &amp; Approve</div></div>)}
        </div>
      </div>
    </div>
  );
}
