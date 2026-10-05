'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { CONTRACT_MAP_SECTIONS } from '@/lib/trec-20-19-contract-map';
import type { AgentCashLine, AgentDeal, AgentKeyTerm } from '@/lib/agent-command-center-workspace';

type Patch = Partial<AgentDeal>;
type Props = { deal: AgentDeal; onPatch: (patch: Patch) => void; onParties: (key: 'buyerNames' | 'sellerNames' | 'buyer2Name' | 'seller2Name', value: string) => void };

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

const CD_LINKS: Partial<Record<keyof AgentDeal['contractDetails'], string>> = {
  salesPrice: 'p01_f016', cashPortion: 'p01_f011', loanAmount: 'p01_f015', earnestMoney: 'p02_f031', optionFee: 'p02_f032',
  additionalEarnestMoney: 'p02_f033', titleCompany: 'p02_f038', county: 'p01_f007', exclusions: 'p01_f009', specialProvisionsNotes: 'p06_f097',
};
const DEAL_LINKS: Partial<Record<'optionPeriodDays' | 'additionalEarnestMoneyDays' | 'titleObjectionDays' | 'propertyAddress', string>> = {
  optionPeriodDays: 'p02_f035', additionalEarnestMoneyDays: 'p02_f034', titleObjectionDays: 'p03_f057',
  propertyAddress: 'p01_f008',
};

// The 1-4 Residential form is the source of truth: a filled form field wins over the stored deal value.
function effective(deal: AgentDeal): AgentDeal {
  const ff = (id: string) => (deal.formFields[id] ?? '').trim();
  const contractDetails = { ...deal.contractDetails };
  for (const [key, id] of Object.entries(CD_LINKS)) { const v = ff(id as string); if (v) (contractDetails as Record<string, string>)[key] = v; }
  const next: AgentDeal = { ...deal, contractDetails };
  for (const [key, id] of Object.entries(DEAL_LINKS)) { const v = ff(id as string); if (v) (next as Record<string, unknown>)[key] = v; }
  return next;
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

const isMoney = (v: string): boolean => /^\$?\s*[\d,]+(\.\d{1,2})?$/.test((v ?? '').trim());
const TERM_DEFS: TermDef[] = [
  { id: 'tpl-purchase-price', term: 'Purchase Price', ref: '§3 · p.1', source: 'salesPrice', auto: (d) => ({ value: d.contractDetails.salesPrice, note: '' }) },
  { id: 'tpl-earnest-money', term: 'Earnest Money', ref: '§5 · p.2', source: 'earnestMoney', auto: (d) => ({ value: d.contractDetails.earnestMoney, note: d.earnestMoneyDeliveredDate ? `Delivered ${shortDate(d.earnestMoneyDeliveredDate)}` : '' }) },
  { id: 'tpl-financing', term: 'Financing', ref: '§3 · p.1', source: 'financingType', auto: (d) => {
    const picked = [['p01_f012', 'Third Party Financing'], ['p01_f013', 'Loan Assumption'], ['p01_f014', 'Seller Financing']].filter(([id]) => d.formFields[id] === 'true').map(([, name]) => name).join(' · ');
    return { value: picked || d.contractDetails.financingType, note: isMoney(d.contractDetails.loanAmount) ? `Loan ${d.contractDetails.loanAmount}` : '' };
  } },
  { id: 'tpl-inspection', term: 'Inspection Contingency', ref: '§5 · p.2', auto: (d) => ({ value: dueFrom(d, d.optionPeriodDays), note: isMoney(d.contractDetails.optionFee) ? `Option fee ${d.contractDetails.optionFee}` : '' }) },
  { id: 'tpl-appraisal', term: 'Appraisal Contingency', ref: '§7.3 · p.5', auto: (d) => ({ value: dueFrom(d, d.appraisalDeadlineDays), note: '' }) },
  { id: 'tpl-loan', term: 'Loan Contingency', ref: '§7.4 · p.5', auto: (d) => ({ value: dueFrom(d, d.financingDeadlineDays), note: '' }) },
  { id: 'tpl-closing-date', term: 'Closing Date', ref: '§9 · p.6', auto: (d) => {
    const md = (d.formFields['p06_f093'] ?? '').trim(); const yr = (d.formFields['p06_f094'] ?? '').trim();
    return { value: md ? `${md}${yr ? `, 20${yr}` : ''}` : d.closingDate ? shortDate(d.closingDate) : '', note: '' };
  } },
  { id: 'tpl-seller-credit', term: 'Seller Credit', ref: '§12 · p.6', auto: (d) => ({ value: (d.formFields['p06_f100'] ?? '').trim(), note: '' }) },
  { id: 'tpl-inclusions', term: 'Inclusions', ref: '§2 · p.1', source: 'improvementsAndAccessories', auto: (d) => ({ value: d.contractDetails.improvementsAndAccessories, note: '' }) },
  { id: 'tpl-possession', term: 'Possession', ref: '§10 · p.6', source: 'possessionPlan', auto: (d) => ({ value: d.formFields['p06_f095'] === 'true' ? 'Upon Closing And Funding' : d.formFields['p06_f096'] === 'true' ? 'According To Temporary Lease' : d.contractDetails.possessionPlan, note: '' }) },
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

const POS_COL: Record<number, string> = { 1: 'lg:col-start-1', 2: 'lg:col-start-2', 3: 'lg:col-start-3', 4: 'lg:col-start-4' };
const POS_ROW: Record<number, string> = { 1: 'lg:row-start-1', 2: 'lg:row-start-2', 3: 'lg:row-start-3', 4: 'lg:row-start-4', 5: 'lg:row-start-5', 6: 'lg:row-start-6' };

// Starts closed and opens itself the first time it scrolls into view.
function AutoDetails({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let armed = false;
    let done = false;
    const io = new IntersectionObserver((entries) => {
      if (!armed || done) return;
      if (entries.some((entry) => entry.isIntersecting)) { el.open = true; done = true; io.disconnect(); }
    }, { rootMargin: '0px 0px -25% 0px' });
    const arm = () => { armed = true; io.disconnect(); if (!done) io.observe(el); window.removeEventListener('scroll', arm, true); };
    io.observe(el);
    window.addEventListener('scroll', arm, true);
    return () => { io.disconnect(); window.removeEventListener('scroll', arm, true); };
  }, []);
  return <details ref={ref} className={className}>{children}</details>;
}

const fieldCls = 'h-9 w-full rounded-md border border-[#E6E5EC] bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#301D5D]';

type ContractSection = (typeof CONTRACT_MAP_SECTIONS)[number];

export default function ContractPage({ deal: rawDeal, onPatch, onParties }: Props) {
  const deal = effective(rawDeal);
  const setForm = (patch: Record<string, string>) => {
    const appPatch: Record<string, string> = {};
    const formPatch: Record<string, string> = {};
    for (const [id, v] of Object.entries(patch)) { if (id.startsWith('app:')) appPatch[id.slice(4)] = v; else formPatch[id] = v; }
    onPatch({
      ...(Object.keys(formPatch).length ? { formFields: { ...rawDeal.formFields, ...formPatch } } : {}),
      ...(Object.keys(appPatch).length ? { contractAddresses: { ...(rawDeal.contractAddresses ?? {}), ...appPatch } } : {}),
    });
  };
  const getVal = (id: string): string => (id.startsWith('app:') ? (rawDeal.contractAddresses ?? {})[id.slice(4)] ?? '' : rawDeal.formFields[id] ?? '');
  const stored = deal.keyTerms;
  const storedLines = deal.cashLines;
  const terms: (AgentKeyTerm & { source?: TermDef['source']; auto?: Auto })[] = [
    ...TERM_DEFS.map((def) => {
      const auto = def.auto(deal);
      const own = stored.find((t) => t.id === def.id);
      const value = auto.value || (def.source ? '' : own?.value || '');
      return { id: def.id, term: def.term, ref: def.ref, value, note: own?.note || auto.note, source: def.source, auto };
    }),
    ...stored.filter((t) => !t.id.startsWith('tpl-')),
  ];
  const lines: AgentCashLine[] = [
    ...LINE_DEFS.flatMap((def) => {
      const found = storedLines.find((l) => l.id === def.id);
      const own = found && found.label !== HIDDEN ? found : undefined;
      return [{ id: def.id, label: own?.label || def.label(deal), sign: own ? own.sign : def.sign, amount: own?.amount || def.amount(deal), note: own?.note ?? '' }];
    }),
    ...storedLines.filter((l) => !l.id.startsWith('tpl-')),
  ];
  const [editing, setEditing] = useState<AgentKeyTerm | null>(null);
  const [quickId, setQuickId] = useState<string | null>(null);
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
  // The trash button clears a line's amount and note and keeps the line itself.
  const removeLine = (id: string) => {
    const current = lines.find((l) => l.id === id);
    if (!current) return;
    if (!id.startsWith('tpl-') && !current.amount.trim() && !current.note.trim()) {
      onPatch({ cashLines: storedLines.filter((l) => l.id !== id), cashLinesCustom: true });
      return;
    }
    const def = LINE_DEFS.find((d) => d.id === id);
    saveLine({ ...current, label: def ? def.label(deal) : current.label, amount: def && def.amount(deal) ? ' ' : '', note: '' });
  };
  const addLine = () => onPatch({ cashLines: [...storedLines, { id: newId('line'), label: 'New Line', sign: '+', amount: '', note: '' }], cashLinesCustom: true });

  const total = lines.reduce((sum, line) => sum + (line.sign === '-' ? -1 : 1) * parseMoney(line.amount), 0);
  const cells = terms.length + 1;
  const filler = (4 - (cells % 4)) % 4;

  const applyTerm = (clean: AgentKeyTerm, creating: boolean) => {
    const isTpl = clean.id.startsWith('tpl-');
    if (!isTpl) {
      saveCustomTerms(creating ? [...stored.filter((t) => !t.id.startsWith('tpl-')), clean] : stored.filter((t) => !t.id.startsWith('tpl-')).map((t) => (t.id === clean.id ? clean : t)));
    } else {
      const def = TERM_DEFS.find((d) => d.id === clean.id);
      const others = stored.filter((t) => t.id !== clean.id);
      if (def?.source) onPatch({ contractDetails: { ...rawDeal.contractDetails, [def.source]: clean.value }, ...(CD_LINKS[def.source] ? { formFields: { ...rawDeal.formFields, [CD_LINKS[def.source] as string]: clean.value } } : {}), keyTerms: clean.note ? [...others, clean] : others, keyTermsCustom: true });
      else putTerm(clean.value || clean.note ? [...others, clean] : others);
    }
  };

  const commit = () => {
    if (!editing || !editing.term.trim()) return;
    const isTpl = editing.id.startsWith('tpl-');
    if (!isTpl && !editing.value.trim()) return;
    const clean = { ...editing, term: editing.term.trim(), value: editing.value.trim(), note: editing.note.trim() };
    applyTerm(clean, isNew);
    setEditing(null);
  };

  const clearTerm = (t: AgentKeyTerm) => {
    if (t.id.startsWith('tpl-')) {
      const def = TERM_DEFS.find((d) => d.id === t.id);
      const others = stored.filter((x) => x.id !== t.id);
      if (def?.source) onPatch({ contractDetails: { ...rawDeal.contractDetails, [def.source]: '' }, ...(CD_LINKS[def.source] ? { formFields: { ...rawDeal.formFields, [CD_LINKS[def.source] as string]: '' } } : {}), keyTerms: others, keyTermsCustom: true });
      else putTerm(others);
    } else {
      saveCustomTerms(stored.filter((x) => x.id !== t.id));
    }
  };

  const customFields = rawDeal.contractCustomFields ?? [];
  const putCustom = (next: typeof customFields) => onPatch({ contractCustomFields: next });
  const leadsFor = (section: ContractSection) => section.id === 'buyer' ? [['Buyer 1', rawDeal.buyerNames, (v: string) => onParties('buyerNames', v)], ['Buyer 2', rawDeal.buyer2Name ?? '', (v: string) => onParties('buyer2Name', v)]] as const
              : section.id === 'lender' ? [['Lender', rawDeal.lender ?? '', (v: string) => onPatch({ lender: v })]] as const
              : section.id === 'seller' ? [['Seller 1', rawDeal.sellerNames, (v: string) => onParties('sellerNames', v)], ['Seller 2', rawDeal.seller2Name ?? '', (v: string) => onParties('seller2Name', v)]] as const
              : null;
  const renderSectionBody = (section: ContractSection, bordered: boolean) => {
    const leads = leadsFor(section);
    return (
                <div className={`grid gap-x-4 gap-y-3 ${bordered ? 'border-t border-[#F1F0F5] px-[1.125rem] py-4' : ''} sm:grid-cols-2 lg:grid-cols-4`}>
                  {leads && leads.map(([label, value, set]) => (
                    <label key={label} className={`block min-w-0 sm:col-span-2 ${leads.length === 1 ? 'lg:col-span-4' : ''}`}>
                      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">{label}</span>
                      <input value={value ?? ''} onChange={(e) => set(e.target.value)} className={`${fieldCls} mt-1`} />
                    </label>
                  ))}
                  {section.fields.map((fl) => {
                    const value = getVal(fl.id);
                    if (fl.kind === 'c') {
                      return (
                        <label key={fl.id} className="flex min-w-0 items-start gap-2 text-sm text-slate-900">
                          <input type="checkbox" checked={value === 'true'} onChange={(e) => setForm({ [fl.id]: e.target.checked ? 'true' : '' })} className="mt-0.5 h-4 w-4 accent-[#301D5D]" />
                          <span className="min-w-0 break-words">{fl.label}</span>
                        </label>
                      );
                    }
                    return (
                      <label key={fl.id} className={`block min-w-0 ${fl.span === 2 ? 'lg:col-span-2' : ''} ${fl.pos ? `${POS_COL[fl.pos[0]]} ${POS_ROW[fl.pos[1]]}` : ''}`}>
                        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">{fl.label}</span>
                        <span className="mt-1 flex items-center gap-1 rounded-md border border-[#E6E5EC] bg-white px-2 focus-within:border-[#301D5D]">
                          {fl.kind === 'm' && <span className="text-sm text-slate-400">$</span>}
                          <input value={value} onChange={(e) => setForm({ [fl.id]: e.target.value })} inputMode={fl.kind === 'm' || fl.kind === 'd' ? 'decimal' : undefined} className="h-9 min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none" />
                        </span>
                      </label>
                    );
                  })}
                  {customFields.filter((cf) => cf.section === section.id).map((cf) => (
                    <div key={cf.id} className="block min-w-0">
                      <span className="flex items-center justify-between gap-1">
                        <input value={cf.label} onChange={(e) => putCustom(customFields.map((x) => (x.id === cf.id ? { ...x, label: e.target.value } : x)))} aria-label="Field name" placeholder="Field Name" className="cf-label h-4 min-w-0 flex-1 bg-transparent text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500 outline-none" />
                        <button type="button" aria-label="Remove field" onClick={() => putCustom(customFields.filter((x) => x.id !== cf.id))} className="!h-4 !border-0 !bg-transparent !px-0 text-slate-400 hover:!text-[#301D5D]"><X className="h-3 w-3" aria-hidden="true" /></button>
                      </span>
                      <input value={cf.value} onChange={(e) => putCustom(customFields.map((x) => (x.id === cf.id ? { ...x, value: e.target.value } : x)))} className={`${fieldCls} mt-1`} />
                    </div>
                  ))}
                  {!bordered && (
                    <div className="flex items-end">
                      <button type="button" onClick={() => putCustom([...customFields, { id: newId('cf'), section: section.id, label: 'New Field', value: '' }])}><Plus className="mr-1 inline h-4 w-4" aria-hidden="true" />Add Field</button>
                    </div>
                  )}
                </div>
    );
  };

  const cashBody = (
    <>
        <div className="flex items-center justify-between gap-4 border-b border-[#F1F0F5] px-[1.125rem] py-3">
          <div>
            <p className="text-sm font-medium text-slate-900">Earnest Money In Escrow</p>
            <p className="text-xs text-slate-500">Shown to the client as the deposit held in escrow</p>
          </div>
          <label className="flex w-36 items-center gap-1 rounded-md border border-[#E6E5EC] px-2 text-sm text-slate-500 focus-within:border-[#301D5D]">$
            <input value={deal.earnestInEscrow || asNumber(deal.contractDetails.earnestMoney)} onChange={(e) => onPatch({ earnestInEscrow: e.target.value })} inputMode="decimal" aria-label="Earnest money in escrow" className="h-9 min-w-0 flex-1 bg-transparent text-right text-sm text-slate-900 outline-none" />
          </label>
        </div>
        <div className="px-[1.125rem] py-3">
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
                  <button type="button" aria-label="Clear line" onClick={() => removeLine(line.id)} className="!border-0 !bg-transparent !px-2 text-slate-400 hover:!text-[#301D5D]"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                </div>
                <input value={line.note} onChange={(e) => updateLine(line.id, { note: e.target.value })} aria-label="Note shown to client" placeholder="Optional note the client sees under this line" className="mt-1 h-7 w-full bg-transparent text-xs text-slate-500 outline-none placeholder:text-slate-300" />
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-[#F1F0F5] pt-3">
            <button type="button" onClick={addLine}><Plus className="mr-1 inline h-4 w-4" aria-hidden="true" />Add Line</button>
            <p className="text-sm font-semibold text-slate-900">Cash To Close {money(total)}</p>
          </div>
        </div>
    </>
  );

  return (
    <div className="ds-page" data-testid="contract-page">
      <div aria-label="Contract Sections">
        <div className="space-y-3">
          {CONTRACT_MAP_SECTIONS.map((section) => {
            const filled = section.fields.filter((fl) => getVal(fl.id).trim()).length;
            return (
              <Fragment key={section.id}>
              <AutoDetails className="group overflow-hidden rounded-2xl border border-[#E6E5EC] bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between px-[1.125rem] py-4 text-sm font-semibold text-slate-900">
                  <span>{section.title}</span>
                  <span className="flex items-center gap-3">
                    {section.fields.length > 0 && <span className="text-xs font-normal text-slate-500">{filled} Of {section.fields.length} Filled</span>}
                    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); const d = e.currentTarget.closest('details'); if (d) d.open = true; putCustom([...customFields, { id: newId('cf'), section: section.id, label: 'New Field', value: '' }]); }}><Plus className="mr-1 inline h-4 w-4" aria-hidden="true" />Add Field</button>
                    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setQuickId(section.id); }}>Quick Entry</button>
                  </span>
                </summary>
                {renderSectionBody(section, true)}
              </AutoDetails>
              {section.id === 'property' && (
                <AutoDetails className="group overflow-hidden rounded-2xl border border-[#E6E5EC] bg-white">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-[1.125rem] py-4 text-sm font-semibold text-slate-900"><span>Key Details</span><button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setQuickId('key-details'); }}>Quick Entry</button></summary>
                  <div className="border-t border-[#F1F0F5]">
      <section className="overflow-hidden bg-white" aria-label="Contract Terms">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4">
          {terms.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setIsNew(false); setEditing(t); }}
              className="!block !h-auto !rounded-none !border-0 !border-b !border-r !border-[#E6E5EC] !bg-white !px-[1.125rem] !py-4 text-left hover:!bg-[#F6F3FB]"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">{t.term}</span>
                {t.ref && <span className="text-[11px] text-slate-400">{t.ref}</span>}
              </span>
              <span className="mt-1 block min-h-[20px] break-words text-sm font-medium text-slate-900">{t.value}</span>
              <span className="mt-0.5 block min-h-[16px] break-words text-sm font-medium text-slate-500">{t.note}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setIsNew(true); setEditing({ id: newId('term'), term: '', ref: '', value: '', note: '' }); }}
            className="!flex !h-auto min-h-[76px] !items-center !justify-center !gap-1 !rounded-none !border-0 !border-b !border-r !border-[#E6E5EC] !bg-white !px-[1.125rem] !py-4 text-sm text-slate-500 hover:!bg-[#F6F3FB]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Add Term
          </button>
          {Array.from({ length: filler }, (_, i) => <div key={`f${i}`} className="hidden border-b border-r border-[#E6E5EC] bg-[#F6F3FB] lg:block" aria-hidden="true" />)}
        </div>
      </section>

                  </div>
                </AutoDetails>
              )}
              </Fragment>
            );
          })}
          <section className="overflow-hidden rounded-2xl border border-[#E6E5EC] bg-white" aria-label="Estimated Cash To Close">
        <div className="flex items-center justify-between border-b border-[#E6E5EC] px-[1.125rem] py-4">
          <p className="text-sm font-semibold text-slate-900">Estimated Cash To Close</p>
          <button type="button" onClick={() => setQuickId('cash')}>Quick Entry</button>
        </div>
        {cashBody}
      </section>
        </div>
      </div>

      {quickId && (() => {
        const qs = CONTRACT_MAP_SECTIONS.find((x) => x.id === quickId);
        const title = quickId === 'key-details' ? 'Key Details' : quickId === 'cash' ? 'Estimated Cash To Close' : qs?.title;
        if (!title) return null;
        const body = quickId === 'key-details' ? (
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            {terms.map((t) => (
              <div key={t.id} className="min-w-0">
                <span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">{t.term}</span>
                <input value={t.value} onChange={(e) => applyTerm({ id: t.id, term: t.term, ref: t.ref, value: e.target.value, note: t.note }, false)} aria-label={`${t.term} value`} className={`${fieldCls} mt-1`} />
                <input value={t.note} onChange={(e) => applyTerm({ id: t.id, term: t.term, ref: t.ref, value: t.value, note: e.target.value }, false)} aria-label={`${t.term} note`} placeholder="Note" className={`${fieldCls} mt-1`} />
              </div>
            ))}
          </div>
        ) : quickId === 'cash' ? cashBody : qs ? renderSectionBody(qs, false) : null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label={`${title} quick entry`} onClick={() => setQuickId(null)}>
            <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-[#E6E5EC] px-[1.125rem] py-4">
                <p className="text-sm font-semibold text-slate-900">{title}</p>
                <button type="button" aria-label="Close" onClick={() => setQuickId(null)} className="!border-0 !bg-transparent text-slate-500 hover:!text-[#301D5D]"><X className="h-4 w-4" aria-hidden="true" /></button>
              </div>
              <div className="px-[1.125rem] py-4">{body}</div>
              <div className="flex justify-end border-t border-[#E6E5EC] px-[1.125rem] py-3"><button type="button" onClick={() => setQuickId(null)}>Done</button></div>
            </div>
          </div>
        );
      })()}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label={isNew ? 'Add a Term' : 'Edit Term'} onClick={() => setEditing(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#E6E5EC] px-6 py-4">
              <p className="text-sm font-semibold text-slate-900">{isNew ? 'Add A Term' : 'Edit Term'}</p>
              <button type="button" aria-label="Close" onClick={() => setEditing(null)} className="!border-0 !bg-transparent !px-1"><X className="h-4 w-4" aria-hidden="true" /></button>
            </div>
            <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
              <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">Term
                <input value={editing.term} onChange={(e) => setEditing({ ...editing, term: e.target.value })} placeholder="Purchase Price" className={`${fieldCls} mt-1 font-normal`} />
              </label>
              <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">Where In The Contract
                <input value={editing.ref} onChange={(e) => setEditing({ ...editing, ref: e.target.value })} placeholder="§7.2 · p.5" className={`${fieldCls} mt-1 font-normal`} />
              </label>
              <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500 sm:col-span-2">Value
                <input value={editing.value} onChange={(e) => setEditing({ ...editing, value: e.target.value })} placeholder="$642,000" className={`${fieldCls} mt-1 font-normal`} />
              </label>
              <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500 sm:col-span-2">Note
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
