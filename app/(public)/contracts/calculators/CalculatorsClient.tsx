'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CALCULATORS, defaults, runCalculator,
  type Calculator, type Field, type Output, type Values,
} from '@/lib/closing-time-calculators';

type ContractOption = { id: string; address: string; closingDate: string };

const control = 'mt-1 w-full rounded-md border border-[#D9D2E9] bg-white px-3 py-2 text-sm text-[#1B1726] focus:border-[#301D5D] focus:outline-none focus:ring-2 focus:ring-[#301D5D]/20';
const heading = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5B5470]';

export default function CalculatorsClient({ contracts, initialId }: { contracts: ContractOption[]; initialId?: string }) {
  const [id, setId] = useState(CALCULATORS.some((c) => c.id === initialId) ? initialId! : CALCULATORS[0]!.id);
  const current = CALCULATORS.find((c) => c.id === id) ?? CALCULATORS[0]!;
  return (
    <div>
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label="Calculators">
          <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {CALCULATORS.map((c) => (
              <li key={c.id} className="shrink-0">
                <button
                  type="button"
                  aria-current={c.id === current.id ? 'true' : undefined}
                  onClick={() => setId(c.id)}
                  className={`min-h-[44px] w-full rounded-md border px-3 text-left text-sm font-semibold transition ${
                    c.id === current.id ? 'border-[#301D5D] bg-[#301D5D] text-white' : 'border-[#D9D2E9] bg-white text-[#301D5D] hover:bg-[#F4F0FA]'
                  }`}
                >{c.title}</button>
              </li>
            ))}
          </ul>
        </nav>
        <CalcCard key={current.id} calc={current} contracts={contracts} />
      </div>
    </div>
  );
}

function CalcCard({ calc, contracts }: { calc: Calculator; contracts: ContractOption[] }) {
  const [v, setV] = useState<Values>(() => defaults(calc));
  const [contractId, setContractId] = useState('');
  const set = (k: string, x: string | boolean) => setV((o) => ({ ...o, [k]: x }));
  const hasDate = calc.fields.some((f) => f.key === 'date');
  const groups = useMemo(() => [...new Set(calc.fields.map((f) => f.group ?? ''))], [calc]);
  const [out, setOut] = useState<Output | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setOut(runCalculator(calc.id, v)), 150);
    return () => clearTimeout(t);
  }, [calc.id, v]);

  return (
    <section className="rounded-lg border border-[#D9D2E9] bg-white p-5" aria-label={calc.title}>
      <h2 className="text-xl font-semibold text-[#301D5D]">{calc.title}</h2>
      <p className="mt-1 text-sm text-[#5B5470]">{calc.blurb}</p>
      <div className="mt-5 grid gap-6 xl:grid-cols-2">
        <form className="grid content-start gap-4" onSubmit={(e) => e.preventDefault()} aria-label={`${calc.title} inputs`}>
          {hasDate && (
            <label className="block text-sm font-medium">Use a saved contract&apos;s closing date
              <select className={control} value={contractId} onChange={(e) => {
                const c = contracts.find((x) => x.id === e.target.value);
                setContractId(e.target.value);
                if (c?.closingDate) set('date', c.closingDate);
              }}>
                <option value="">None, enter it by hand</option>
                {contracts.map((c) => <option key={c.id} value={c.id}>{c.address}</option>)}
              </select>
            </label>
          )}
          {groups.map((g) => (
            <fieldset key={g} className="m-0 min-w-0 border-0 p-0">
              {g && <legend className={`${heading} mb-2 p-0`}>{g}</legend>}
              <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] items-end gap-4">
                {calc.fields.filter((f) => (f.group ?? '') === g).map((f) => (
                  <Input key={f.key} f={f} value={v[f.key] ?? ''} onChange={(x) => set(f.key, x)} />
                ))}
              </div>
            </fieldset>
          ))}
        </form>
        <div className="grid min-w-0 content-start gap-4" aria-live="polite">
          {out ? <Results out={out} /> : <p className="text-sm text-[#5B5470]">Check the numbers entered.</p>}
        </div>
      </div>
    </section>
  );
}

function Input({ f, value, onChange }: { f: Field; value: string | boolean; onChange: (v: string | boolean) => void }) {
  if (f.type === 'check') {
    return (
      <label className="flex min-h-[44px] items-center gap-3 text-sm font-medium">
        <input type="checkbox" className="h-5 w-5" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />{f.label}
      </label>
    );
  }
  return (
    <label className="block text-sm font-medium">{f.label}
      {f.type === 'select' ? (
        <select className={control} value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {f.options?.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      ) : (
        <span className="relative mt-1 block">
          {f.type === 'money' && <i aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 not-italic text-[#5B5470]">$</i>}
          <input
            type={f.type === 'date' ? 'date' : 'text'}
            inputMode={f.type === 'date' ? undefined : 'decimal'}
            className={`${control} !mt-0 ${f.type === 'money' ? 'pl-7' : ''} ${f.type === 'pct' ? 'pr-8' : ''}`}
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
          />
          {f.type === 'pct' && <i aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 not-italic text-[#5B5470]">%</i>}
        </span>
      )}
      {f.hint && <small className="mt-1 block text-xs font-normal text-[#5B5470]">{f.hint}</small>}
    </label>
  );
}

function Results({ out }: { out: Output }) {
  return (
    <>
      {out.hero && (
        <div className="grid gap-1 rounded-xl border border-[#D9D2E9] border-l-4 border-l-[#301D5D] p-4">
          <span className={heading}>{out.hero.label}</span>
          <span className="text-3xl font-semibold text-[#1B1726]">{out.hero.value}</span>
          {out.hero.note && <span className="text-sm text-[#5B5470]">{out.hero.note}</span>}
        </div>
      )}
      {out.sections.map((s) => (
        <section key={s.heading} className="grid gap-2">
          <h3 className={heading}>{s.heading}</h3>
          <dl className="m-0 grid">
            {s.rows.map(([l, val, tone], i) => (
              <div key={`${l}-${i}`} className={`flex justify-between gap-4 border-b border-[#EEE9F6] py-2 text-sm ${tone ? 'font-semibold' : ''} ${tone === 'neg' ? 'text-red-700' : ''}`}>
                <dt className={tone ? '' : 'text-[#5B5470]'}>{l}</dt>
                <dd className="m-0 text-right tabular-nums">{val}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      {out.table && (
        <section className="grid gap-2">
          <h3 className={heading}>{out.table.heading}</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px] tabular-nums">
              <thead><tr>{out.table.cols.map((c) => <th key={c} scope="col" className="border-b border-[#EEE9F6] px-3 py-2 text-right font-semibold text-[#5B5470] first:text-left">{c}</th>)}</tr></thead>
              <tbody>{out.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="whitespace-nowrap border-b border-[#EEE9F6] px-3 py-2 text-right first:text-left">{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </section>
      )}
      {out.note && <p className="text-[13px] text-[#5B5470]">{out.note}</p>}
    </>
  );
}
