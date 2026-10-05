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

const fieldCls = 'h-9 w-full rounded-md border border-[#E6E5EC] bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#301D5D]';

export default function ContractPage({ deal, onPatch, onParties }: Props) {
  const terms = deal.keyTerms;
  const lines = deal.cashLines;
  const [editing, setEditing] = useState<AgentKeyTerm | null>(null);
  const [isNew, setIsNew] = useState(false);

  const saveTerms = (next: AgentKeyTerm[]) => onPatch({ keyTerms: next, keyTermsCustom: true });
  const saveLines = (next: AgentCashLine[]) => onPatch({ cashLines: next, cashLinesCustom: true });
  const updateLine = (id: string, patch: Partial<AgentCashLine>) => saveLines(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));

  const total = lines.reduce((sum, line) => sum + (line.sign === '-' ? -1 : 1) * parseMoney(line.amount), 0);
  const cells = terms.length + 1;
  const filler = (3 - (cells % 3)) % 3;

  const commit = () => {
    if (!editing || !editing.term.trim() || !editing.value.trim()) return;
    const clean = { ...editing, term: editing.term.trim(), value: editing.value.trim() };
    saveTerms(isNew ? [...terms, clean] : terms.map((t) => (t.id === clean.id ? clean : t)));
    setEditing(null);
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
              <span className="mt-1 block break-words text-sm font-semibold text-slate-900">{t.value}</span>
              {t.note && <span className="mt-0.5 block break-words text-xs text-slate-500">{t.note}</span>}
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
            <input value={deal.earnestInEscrow} onChange={(e) => onPatch({ earnestInEscrow: e.target.value })} inputMode="decimal" aria-label="Earnest money in escrow" className="h-9 min-w-0 flex-1 bg-transparent text-right text-sm text-slate-900 outline-none" />
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
                  <button type="button" aria-label="Delete line" onClick={() => saveLines(lines.filter((l) => l.id !== line.id))} className="!border-0 !bg-transparent !px-2 text-slate-400 hover:!text-[#301D5D]"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                </div>
                <input value={line.note} onChange={(e) => updateLine(line.id, { note: e.target.value })} aria-label="Note shown to client" placeholder="Optional note the client sees under this line" className="mt-1 h-7 w-full bg-transparent text-xs italic text-slate-500 outline-none placeholder:text-slate-300" />
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-[#F1F0F5] pt-3">
            <button type="button" onClick={() => saveLines([...lines, { id: newId('line'), label: '', sign: '+', amount: '', note: '' }])}><Plus className="mr-1 inline h-4 w-4" aria-hidden="true" />Add Line</button>
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
              {isNew ? <span /> : <button type="button" onClick={() => { saveTerms(terms.filter((t) => t.id !== editing.id)); setEditing(null); }}>Delete</button>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditing(null)}>Cancel</button>
                <button type="button" disabled={!editing.term.trim() || !editing.value.trim()} onClick={commit}>{isNew ? 'Add Term' : 'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
