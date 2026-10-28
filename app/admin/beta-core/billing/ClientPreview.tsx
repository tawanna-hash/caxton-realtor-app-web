'use client';

// Live preview of what the client sees on their sign page. Updates as the form changes.
const STEPS = ['Introduction', 'Review Services', 'Terms Of Service', 'Additional Terms', 'Payment', 'Sign & Approve'];
export type PreviewData = {
  company: string; rep: string; email: string; phone: string;
  address: string; city: string; state: string; zip: string; billingEmail: string;
  askAddress: boolean; lines: Array<[string, string]>; totalCents: number; methods: string[];
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
  return (
    <div className="flex h-full flex-col bg-[#F3F4F7]">
      <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] text-gray-500">Client view, live</div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-sm">
          <div className="text-sm font-semibold text-[#1B1740]">RealtyLine</div>
          <ol className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
            {STEPS.map((s, i) => <li key={s} className={i === 1 ? 'font-semibold text-[#5B2BE0]' : ''}>{s}</li>)}
          </ol>
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
            <div className="mt-3 rounded-md bg-[#5B2BE0] py-2 text-center text-xs text-white">Continue To Payment</div>
          </div>
          <div className="mt-3 rounded-xl bg-white p-4 text-xs shadow-sm">
            <div className="font-semibold text-[#1B1740]">Payment, what the client can choose</div>
            <ul className="mt-1 list-disc pl-4 text-gray-700">{d.methods.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        </div>
      </div>
    </div>
  );
}
