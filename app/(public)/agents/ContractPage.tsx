'use client';

import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { AgentCashLine, AgentDeal, AgentKeyTerm } from '@/lib/agent-command-center-workspace';

type Patch = Partial<AgentDeal>;
type Props = { deal: AgentDeal; onPatch: (patch: Patch) => void; onParties: (key: 'buyerNames' | 'sellerNames', value: string) => void };

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function parseMoney(value: string | undefined): number {
  const n = Number.parseFloat((value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

function shortDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const date = new Date(`${iso}T12:00:00`);
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
}

type Auto = { value: string; note: string };
type TermDef = { id: string; term: string; ref: string; auto: (deal: AgentDeal) => Auto; source?: keyof AgentDeal['contractDetails'] };

function plusDays(iso: string, days: string): string {
  const n = Number.parseInt(days, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(n)) return '';
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + n);
  return date.toISOString().slice(0, 10);
}

const dueFrom = (deal: AgentDeal, days: string): string => {
  const due = plusDays(deal.effectiveDate, days);
  return due ? shortDate(due) : days ? `${days} Days` : '';
};

const TERM_DEFS: TermDef[] = [
  { id: 'tpl-purchase-price', term: 'Purchase Price', ref: '§1.2 · p.1', source: 'salesPrice', auto: (d) => ({ value: d.contractDetails.salesPrice, note: '' }) },
  { id: 'tpl-earnest-money', term: 'Earnest Money', ref: '§2.1 · p.2', source: 'earnestMoney', auto: (d) => ({ value: d.contractDetails.earnestMoney, note: d.earnestMoneyDeliveredDate ? `Delivered ${shortDate(d.earnestMoneyDeliveredDate)}` : '' }) },
  { id: 'tpl-financing', term: 'Financing', ref: '§4.1 · p.3', source: 'financingType', auto: (d) => ({ value: d.contractDetails.financingType, note: d.contractDetails.loanAmount ? `Loan ${d.contractDetails.loanAmount}` : '' }) },
  { id: 'tpl-inspection', term: 'Inspection Contingency', ref: '§7.2 · p.5', auto: (d) => ({ value: dueFrom(d, d.optionPeriodDays), note: d.contractDetails.optionFee ? `Option fee ${d.contractDetails.optionFee}` : '' }) },
  { id: 'tpl-appraisal', term: 'Appraisal Contingency', ref: '§7.3 · p.5', auto: (d) => ({ value: dueFrom(d, d.appraisalDeadlineDays), note: '' }) },
  { id: 'tpl-loan', term: 'Loan Contingency', ref: '§7.4 · p.5', auto: (d) => ({ value: dueFrom(d, d.financingDeadlineDays), note: '' }) },
  { id: 'tpl-closing-date', term: 'Closing Date', ref: '§9.1 · p.7', auto: (d) => ({ value: d.closingDate ? shortDate(d.closingDate) : '', note: d.contractDetails.titleCompany }) },
  { id: 'tpl-seller-credit', term: 'Seller Credit', ref: 'Addendum A', auto: () => ({ value: '', note: '' }) },
  { id: 'tpl-inclusions', term: 'Inclusions', ref: '§3.2 · p.2', source: 'improvementsAndAccessories', auto: (d) => ({ value: d.contractDetails.improvementsAndAccessories, note: '' }) },
  { id: 'tpl-possession', term: 'Possession', ref: '§9.4 · p.7', source: 'possessionPlan', auto: (d) => ({ value: d.contractDetails.possessionPlan, note: '' }) },
];

const HIDDEN = '__hidden__';
type LineDef = { id: string; label: (d: AgentDeal) => string; sign: '+' | '-'; amount: (d: AgentDeal) => string };
const asNumber = (v: string): string => (parseMoney(v) ? String(parseMoney(v)) : '');
const LINE_DEFS: LineDef[] = [
  {
    id: 'tpl-down', sign: '+', amount: (d) => asNumber(d.contractDetails.cashPortion),
    label: (d) => {
      const price = parseMoney(d.contractDetails.salesPrice); const cash = parseMoney(d.contractDetails.cashPortion);
      return price && cash ? `Down Payment (${Math.round((cash / price) * 100)}%)` : 'Down Payment';
    },
  },
  { id: 'tpl-closing-costs', sign: '+', amount: () => '', label: () => 'Closing Costs' },
  { id: 'tpl-em', sign: '-', amount: (d) => asNumber(d.contractDetails.earnestMoney), label: () => 'Earnest Money Already In Escrow' },
  { id: 'tpl-seller-credit', sign: '-', amount: () => '', label: () => 'Seller Credit' },
];

const fieldCls = 'h-9 w-full rounded-md border border-[#E6E5EC] bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#301D5D]';

export default function ContractPage({ deal, onPatch, onParties }: Props) {
  const stored = deal.keyTerms;
  const storedLines = deal.cashLines;
  const terms: (AgentKeyTerm & { source?: TermDef['source']; auto?: Auto })[] = [
    ...TERM_DEFS.map((def) => {
      const auto = def.auto(deal);
      const own = stored.find((t) => t.id === def.id);
      const value = def.source ? auto.value : (own?.value || auto.value);
      return { id: def.id, term: def.term, ref: def.ref, value, note: own?.note || auto.note, source: def.source, auto };
    }),
    ...stored.filter((t) => !t.id.startsWith('tpl-')),
  ];
  const lines: AgentCashLine[] = [
    ...LINE_DEFS.flatMap((def) => {
      const own = storedLines.find((l) => l.id === def.id);
      if (own?.label === HIDDEN) return [];
      return [{ id: def.id, label: own?.label || def.label(deal), sign: own ? own.sign : def.sign, amount: own?.amount || def.amount(deal), note: own?.note ?? '' }];
    }),
    ...storedLines.filter((l) => !l.id.startsWith('tpl-')),
  ];
  const [editing, setEditing] = useState<AgentKeyTerm | null>(null);
  const [isNew, setIsNew] = useState(false);

  const putTerm = (next: AgentKeyTerm[]) => onPatch({ keyTerms: next, keyTermsCustom: true });
  const saveCustomTerms = (next: AgentKeyTerm[]) => putTerm([...stored.filter((t) => t.id.startsWith('tpl-')), ...next.filter((t) => !t.id.startsWith('tpl-'))]);
  const saveLine = (line: AgentCashLine) => {
    const exists = storedLines.some((l) => l.id === line.id);
    onPatch({ cashLines: exists ? storedLines.map((l) => (l.id === line.id ? line : l)) : [...storedLines, line], cashLinesCustom: true });
  };
  const updateLine = (id: string, patch: Partial<AgentCashLine>) => {
    const current = lines.find((l) => l.id === id);
    if (current) saveLine({ ...current, ...patch, label: patch.label ?? current.label });
  };
  const removeLine = (id: string) => {
    if (id.startsWith('tpl-')) saveLine({ id, label: HIDDEN, sign: '+', amount: '', note: '' });
    else onPatch({ cashLines: storedLines.filter((l) => l.id !== id), cashLinesCustom: true });
  };
  const addLine = () => onPatch({ cashLines: [...storedLines, { id: newId('line'), label: 'New Line', sign: '+', amount: '', note: '' }], cashLinesCustom: true });

  const total = lines.reduce((sum, line) => sum + (line.sign === '-' ? -1 : 1) * parseMoney(line.amount), 0);
  const cells = terms.length + 1;
  const filler = (3 - (cells % 3)) % 3;

  const commit = () => {
    if (!editing || !editing.term.trim()) return;
    const isTpl = editing.id.startsWith('tpl-');
    if (!isTpl && !editing.value.trim()) return;
    const clean = { ...editing, term: editing.term.trim(), value: editing.value.trim(), note: editing.note.trim() };
    if (!isTpl) {
      saveCustomTerms(isNew ? [...stored.filter((t) => !t.id.startsWith('tpl-')), clean] : stored.filter((t) => !t.id.startsWith('tpl-')).map((t) => (t.id === clean.id ? clean : t)));
    } else {
      const def = TERM_DEFS.find((d) => d.id === clean.id);
      const others = stored.filter((t) => t.id !== clean.id);
      if (def?.source) onPatch({ contractDetails: { ...deal.contractDetails, [def.source]: clean.value }, keyTerms: clean.note ? [...others, clean] : others, keyTermsCustom: true });
      else putTerm(clean.value || clean.note ? [...others, clean] : others);
    }
    setEditing(null);
  };

  const clearTerm = (t: AgentKeyTerm) => {
    if (t.id.startsWith('tpl-')) {
      const def = TERM_DEFS.find((d) => d.id === t.id);
      const others = stored.filter((x) => x.id !== t.id);
      if (def?.source) onPatch({ contractDetails: { ...deal.contractDetails, [def.source]: '' }, keyTerms: others, keyTermsCustom: true });
      else putTerm(others);
    } else {
      saveCustomTerms(stored.filter((x) => x.id !== t.id));
    }
  };

  return (
    <div className="ds-page" data-testid="contract-page">
      <section className="mb-4 rounded-2xl border border-[#E6E5EC] bg-white p-5" aria-label="Deal Details">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {([
            ['Property Address', deal.propertyAddress, (v: string) => onPatch({ propertyAddress: v }), 'sm:col-span-2 lg:col-span-3'],
            ['Buyer Names', deal.buyerNames, (v: string) => onParties('buyerNames', v), ''],
            ['Seller Names', deal.sellerNames, (v: string) => onParties('sellerNames', v), ''],
            ['Lender', deal.lender, (v: string) => onPatch({ lender: v }), ''],
            ['Title Company', deal.contractDetails.titleCompany, (v: string) => onPatch({ contractDetails: { ...deal.contractDetails, titleCompany: v } }), ''],
            ['Other Agent', deal.otherAgent, (v: string) => onPatch({ otherAgent: v }), ''],
            ['Brokerage', deal.otherBrokerage, (v: string) => onPatch({ otherBrokerage: v }), ''],
            ['Contact Information', deal.otherAgentContact, (v: string) => onPatch({ otherAgentContact: v }), 'sm:col-span-2'],
          ] as const).map(([label, value, set, span]) => (
            <label key={label} className={`block min-w-0 ${span}`}>
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">{label}</span>
              <input value={value ?? ''} onChange={(e) => set(e.target.value)} className={`${fieldCls} mt-1`} />
            </label>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#E6E5EC] bg-white" aria-label="Contract Terms">
        {deal.effectiveDate && <p className="border-b border-[#E6E5EC] px-5 py-3 text-xs text-slate-500">Signed {shortDate(deal.effectiveDate)}</p>}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3">
          {terms.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setIsNew(false); setEditing(t); }}
              className="!block !h-auto !rounded-none !border-0 !border-b !border-r !border-[#E6E5EC] !bg-white px-5 py-4 text-left hover:!bg-[#F6F3FB]"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">{t.term}</span>
                {t.ref && <span className="font-mono text-[11px] text-slate-300">{t.ref}</span>}
              </span>
              <span className="mt-1 block min-h-[20px] break-words text-sm font-semibold text-slate-900">{t.value}</span>
              <span className="mt-0.5 block min-h-[16px] break-words text-xs text-slate-500">{t.note}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setIsNew(true); setEditing({ id: newId('term'), term: '', ref: '', value: '', note: '' }); }}
            className="!flex !h-auto min-h-[76px] !items-center !justify-center !gap-1 !rounded-none !border-0 !border-b !border-r !border-[#E6E5EC] !bg-white px-5 py-4 text-sm text-slate-500 hover:!bg-[#F6F3FB]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Add Term
          </button>
          {Array.from({ length: filler }, (_, i) => <div key={`f${i}`} className="hidden border-b border-r border-[#E6E5EC] bg-[#F6F3FB] lg:block" aria-hidden="true" />)}
        </div>
      </section>

      <section className="mt-4 overflow-hidden rounded-2xl border border-[#E6E5EC] bg-white" aria-label="Estimated Cash To Close">
        <p className="border-b border-[#E6E5EC] px-5 py-4 text-base font-semibold text-slate-900">Estimated Cash To Close</p>
        <div className="flex items-center justify-between gap-4 border-b border-[#F1F0F5] px-5 py-3">
          <div>
            <p className="text-sm font-medium text-slate-900">Earnest Money In Escrow</p>
            <p className="text-xs text-slate-500">Shown to the client as the deposit held in escrow</p>
          </div>
          <label className="flex w-36 items-center gap-1 rounded-md border border-[#E6E5EC] px-2 text-sm text-slate-500 focus-within:border-[#301D5D]">$
            <input value={deal.earnestInEscrow || asNumber(deal.contractDetails.earnestMoney)} onChange={(e) => onPatch({ earnestInEscrow: e.target.value })} inputMode="decimal" aria-label="Earnest money in escrow" className="h-9 min-w-0 flex-1 bg-transparent text-right text-sm text-slate-900 outline-none" />
          </label>
        </div>
        <div className="px-5 py-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-900">Estimated Cash To Close</p>
            <p className="text-xs text-slate-500">Shown on the client&apos;s closing page</p>
          </div>
          <ul className="mt-2 divide-y divide-[#F1F0F5]">
            {lines.map((line) => (
              <li key={line.id} className="py-3">
                <div className="flex items-center gap-2">
                  <input value={line.label} onChange={(e) => updateLine(line.id, { label: e.target.value })} aria-label="Line label" placeholder="Line Item" className="h-9 min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none" />
                  <select value={line.sign} onChange={(e) => updateLine(line.id, { sign: e.target.value === '-' ? '-' : '+' })} aria-label="Add or subtract" className="h-9 w-14 rounded-md border border-[#E6E5EC] bg-white px-2 text-sm text-slate-900">
                    <option value="+">+</option>
                    <option value="-">−</option>
                  </select>
                  <label className="flex w-32 items-center gap-1 rounded-md border border-[#E6E5EC] px-2 text-sm text-slate-500 focus-within:border-[#301D5D]">$
                    <input value={line.amount} onChange={(e) => updateLine(line.id, { amount: e.target.value })} inputMode="decimal" aria-label="Amount" className="h-9 min-w-0 flex-1 bg-transparent text-right text-sm text-slate-900 outline-none" />
                  </label>
                  <button type="button" aria-label="Delete line" onClick={() => removeLine(line.id)} className="!border-0 !bg-transparent !px-2 text-slate-400 hover:!text-[#301D5D]"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                </div>
                <input value={line.note} onChange={(e) => updateLine(line.id, { note: e.target.value })} aria-label="Note shown to client" placeholder="Optional note the client sees under this line" className="mt-1 h-7 w-full bg-transparent text-xs italic text-slate-500 outline-none placeholder:text-slate-300" />
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-[#F1F0F5] pt-3">
            <button type="button" onClick={addLine}><Plus className="mr-1 inline h-4 w-4" aria-hidden="true" />Add Line</button>
            <p className="text-sm font-semibold text-slate-900">Cash To Close {money(total)}</p>
          </div>
        </div>
      </section>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label={isNew ? 'Add a term' : 'Edit term'} onClick={() => setEditing(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#E6E5EC] px-6 py-4">
              <p className="text-base font-semibold text-slate-900">{isNew ? 'Add A Term' : 'Edit Term'}</p>
              <button type="button" aria-label="Close" onClick={() => setEditing(null)} className="!border-0 !bg-transparent !px-1"><X className="h-4 w-4" aria-hidden="true" /></button>
            </div>
            <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-900">Term
                <input value={editing.term} onChange={(e) => setEditing({ ...editing, term: e.target.value })} placeholder="Purchase Price" className={`${fieldCls} mt-1 font-normal`} />
              </label>
              <label className="block text-sm font-medium text-slate-900">Where In The Contract
                <input value={editing.ref} onChange={(e) => setEditing({ ...editing, ref: e.target.value })} placeholder="§7.2 · p.5" className={`${fieldCls} mt-1 font-normal`} />
              </label>
              <label className="block text-sm font-medium text-slate-900 sm:col-span-2">Value
                <input value={editing.value} onChange={(e) => setEditing({ ...editing, value: e.target.value })} placeholder="$642,000" className={`${fieldCls} mt-1 font-normal`} />
              </label>
              <label className="block text-sm font-medium text-slate-900 sm:col-span-2">Note
                <textarea value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} rows={3} placeholder="Repair credit added by Addendum B." className="mt-1 w-full rounded-md border border-[#E6E5EC] bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-[#301D5D]" />
              </label>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-[#E6E5EC] px-6 py-4">
              {isNew ? <span /> : <button type="button" onClick={() => { clearTerm(editing); setEditing(null); }}>{editing.id.startsWith('tpl-') ? 'Clear' : 'Delete'}</button>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditing(null)}>Cancel</button>
                <button type="button" disabled={!editing.term.trim() || (!editing.value.trim() && !editing.id.startsWith('tpl-'))} onClick={commit}>{isNew ? 'Add Term' : 'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
