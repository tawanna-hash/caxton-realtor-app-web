'use client';

import { useRef, useState, type ReactNode } from 'react';
import { AlertCircle, Check, Phone, Sparkles, ChevronLeft, ChevronRight, Clock, FileText, MoreHorizontal, Mail, Plus, Trash2, UserRound, X } from 'lucide-react';
import type { AgentDeal } from '@/lib/agent-command-center-workspace';
import { PURCHASE_FOLDERS, PURCHASE_REQUIRED_IDS } from './purchase-documents';

type SnapId = 'attention' | 'waiting' | 'property' | 'next' | 'preferences' | 'offers' | 'parties' | 'workspace';

type Tab = 'overview' | 'documents' | 'people' | 'tasks' | 'history';

export const DEAL_TYPES: { id: AgentDeal['dealType']; label: string }[] = [
  { id: 'purchase', label: 'Purchase' },
  { id: 'listing_sale', label: 'Listing for sale' },
  { id: 'listing_lease', label: 'Listing for lease' },
  { id: 'lease', label: 'Lease' },
  { id: 'real_estate_other', label: 'Real estate other' },
  { id: 'other', label: 'Other' },
];

export const SERVICE_PROVIDER_CATEGORIES = [
  'Utilities', 'Home improvement', 'Mortgage', 'Home security', 'Home inspection',
  'Moving & storage', 'Home warranty', 'Attorney', 'Home insurance', 'Escrow/title', 'Other home services',
];

const TASK_TEMPLATES: { id: string; label: string; tasks: string[] }[] = [
  {
    id: 'tc-buyer', label: 'TC buyer checklist',
    tasks: ['Send welcome letter to agent', 'Confirm whether the property has a well or needs a septic inspection', 'Order home warranty (if applicable)', 'Complete contact information sheets', 'Send intro email to title with executed contract', 'Send intro email to lender with executed contract', 'Send intro email to the other agent', 'Send intro email to client', 'Earnest money due', 'Confirm earnest money receipt with title', 'Order inspection', 'Inspection deadline', 'Wood-destroying insect inspection (VA/FHA)', 'Review inspection report', 'Request repairs', 'Loan application', 'Loan approval', 'Schedule closing with title', 'Seller property disclosure received', 'Title commitment and insurance deadline', 'Appraisal due', 'Buyer homeowner insurance', 'HOA application and approval', 'HOA estoppel', 'Survey and survey report'],
  },
  {
    id: 'tc-seller', label: 'TC seller checklist',
    tasks: ['Executed sales contract received', 'Send contact sheets to all parties', 'Executed seller property disclosure', 'Send executed contract to title company', 'Earnest money due', 'Second earnest money deposit', 'Confirm earnest money receipt from title', 'Inspection deadline', 'Buyer loan application', 'Buyer loan approval', 'Schedule closing with title', 'Appraisal due', 'HOA estoppel requested from title', 'Title commitment requested from title', 'Utilities information shared with buyer agent', 'Closing disclosure delivered to buyer', 'Clear to close', 'Proof of funds', 'Pre-qualification letter', 'Lead-based paint disclosure (if applicable)', 'Final walk-through coordinated', 'Closing date', 'Compensation agreement from buyer agent', 'Update MLS to closed'],
  },
  {
    id: 'listing', label: 'Listing checklist',
    tasks: ['Sign listing agreement', 'Collect seller disclosure', 'Order professional photos', 'Measure and gather property details', 'Enter listing in MLS', 'Install sign and lockbox', 'Schedule open house', 'Review showing feedback', 'Review offers with seller', 'Execute contract'],
  },
  {
    id: 'buying', label: 'Buying checklist',
    tasks: ['Add earnest money receipt', 'Add contingencies to calendar and tasks', 'Add inspector', 'Add lender', 'Order inspections', 'Upload inspection report', 'Create inspection addendum', 'Remove inspection contingency', 'Complete agent info sheet for title', 'Schedule closing', 'Do a final walkthrough', 'Complete close', 'Upload closing statement', 'Ask for a review', 'Create market report for the new neighborhood'],
  },
];

const input = 'h-[36px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm';
const btn = 'inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-[#F4F3F8]';
const btnPrimary = 'inline-flex h-[34px] items-center gap-1.5 rounded-lg bg-[#301D5D] px-3 text-sm font-semibold text-white hover:bg-[#42277C]';


const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';

function newId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

type Props = {
  deal: AgentDeal | undefined;
  today: string;
  locked: boolean;
  health: { label: string; tone: string };
  statusLabels: Record<string, string>;
  statuses: readonly string[];
  documentGroups: readonly { id: string; label: string; items: readonly { id: string; label: string }[] }[];
  nextDeadline?: { label: string; date: string };
  formatDate: (value: string) => string;
  countdownLabel: string;
  onUpdate: <K extends keyof AgentDeal>(key: K, value: AgentDeal[K]) => void;
  onBack: () => void;
  onOpenView: (view: string) => void;
  section?: Tab;
  stripOnly?: boolean;
};

export default function DealSubpage({ deal, today, locked, health, statusLabels, statuses, documentGroups, nextDeadline, formatDate, countdownLabel, onUpdate, onBack, onOpenView, section, stripOnly }: Props) {
  const [tab, setTab] = useState<Tab>(section ?? 'tasks');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);
  const uploadPhoto = async (file?: File) => {
    if (!file) return;
    setPhotoError('');
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setPhotoError('Use a JPG, PNG, or WebP image.'); return; }
    if (file.size > 8 * 1024 * 1024) { setPhotoError('Image must be 8 MB or smaller.'); return; }
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/agent-command-center/photo', { method: 'POST', body });
      const data = await res.json().catch(() => ({})) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || 'Upload failed. Try again.');
      onUpdate('photoUrl', data.url);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Upload failed. Try again.');
    } finally {
      setUploading(false);
    }
  };
  const [providerCategory, setProviderCategory] = useState<string | null>(null);
  const [showPersonForm, setShowPersonForm] = useState(false);

  if (!deal) {
    return (
      <div className="ds-page">
        <button type="button" className="ds-back" onClick={onBack}><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Deals</button>
        <p className="mt-4 text-sm text-slate-500">That deal is no longer available.</p>
      </div>
    );
  }

  const clients = [deal.buyerNames, deal.sellerNames].filter(Boolean);
  const people = deal.clientContacts;
  const docById = new Map(deal.documents.map((d) => [d.id, d]));
  const prefs = deal.preferences;
  const setPref = (key: keyof AgentDeal['preferences'], value: string) => onUpdate('preferences', { ...prefs, [key]: value });
  const nextTask = deal.tasks.find((t) => !t.complete);

  const addTemplate = (id: string) => {
    const template = TASK_TEMPLATES.find((t) => t.id === id);
    if (!template) return;
    const existing = new Set(deal.tasks.map((t) => t.title));
    const added = template.tasks.filter((title) => !existing.has(title)).map((title) => ({
      id: newId('task'), title, dueDate: '', priority: 'normal' as const, status: 'todo' as const, complete: false,
    }));
    onUpdate('tasks', [...deal.tasks, ...added].slice(0, 200));
  };

  const addDays = (iso: string, days: string | number | undefined) => {
    const n = Number(days);
    if (!iso || !Number.isFinite(n) || n <= 0) return '';
    return new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  };
  const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const completedDeal = deal.workflowStatus === 'completed';
  const optionEnd = addDays(deal.effectiveDate, deal.optionPeriodDays);
  const appraisalEnd = addDays(deal.effectiveDate, deal.appraisalDeadlineDays);
  const requiredAllIn = PURCHASE_REQUIRED_IDS.every((id) => deal.documentChecks[id]);
  const rawMilestones: { key: string; label: string; date: string; done: boolean }[] = [
    { key: 'contract', label: 'Under contract', date: deal.effectiveDate, done: Boolean(deal.effectiveDate) && deal.effectiveDate <= today },
    { key: 'earnest', label: 'Earnest money received', date: deal.earnestMoneyDeliveredDate || addDays(deal.effectiveDate, 3), done: Boolean(deal.earnestMoneyDeliveredDate) },
    { key: 'inspection', label: 'Inspection resolved', date: optionEnd, done: Boolean(optionEnd) && optionEnd <= today },
    { key: 'appraisal', label: 'Appraisal complete', date: appraisalEnd, done: Boolean(appraisalEnd) && appraisalEnd <= today },
    { key: 'clear', label: 'Clear to close', date: '', done: requiredAllIn },
    { key: 'prep', label: 'Closing prep', date: '', done: completedDeal || (Boolean(deal.closingDate) && deal.closingDate <= today) },
    { key: 'closing', label: 'Closing', date: deal.closingDate, done: completedDeal || (Boolean(deal.closingDate) && deal.closingDate < today) },
    { key: 'wrap', label: 'File wrap-up', date: deal.closeoutDate, done: completedDeal },
  ];
  const firstOpen = rawMilestones.findIndex((m) => !m.done);
  const milestones = rawMilestones.map((m, index) => ({ ...m, current: index === firstOpen }));
  const openTasks = deal.tasks.filter((t) => !t.complete);
  const missingRequired = PURCHASE_FOLDERS.flatMap((folder) => folder.docs).filter((doc) => doc.kind === 'required' && !deal.documentChecks[doc.id]);
  const price = deal.contractDetails?.salesPrice?.trim();
  const sideBlocks = {
    property: (
<>
          <h3 className="ds-side-title">Focus property</h3>
          <div className="ds-card !p-0 overflow-hidden">
            <div
              className={`relative ${dragOver ? 'bg-[#EFEAF8] outline outline-2 -outline-offset-2 outline-[#301D5D]' : ''}`}
              onDragOver={(e) => { if (locked) return; e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!locked) void uploadPhoto(e.dataTransfer.files?.[0]); }}
            >
              {deal.photoUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={deal.photoUrl} alt={deal.propertyAddress || deal.title} className="h-44 w-full object-cover" />
                : <div className="flex h-32 items-center justify-center bg-[#F6F3FB] text-sm text-slate-400">No photo</div>}
              {!locked && (
                <button type="button" onClick={() => photoInputRef.current?.click()} disabled={uploading}
                  className="absolute inset-x-3 bottom-3 rounded-md border border-dashed border-slate-300 bg-white/90 px-3 py-2 text-xs font-medium text-slate-600">
                  {uploading ? 'Uploading…' : dragOver ? 'Drop image to upload' : deal.photoUrl ? 'Drop a new image or click to replace' : 'Drop an image here or click to upload'}
                </button>
              )}
              <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { void uploadPhoto(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
            {photoError && <p className="px-4 pt-2 text-xs text-red-600" role="alert">{photoError}</p>}
            <div className="p-4">
              <p className="font-semibold text-slate-900">{deal.propertyAddress || deal.title}</p>
              <p className="mt-1 text-xs text-slate-500">{deal.closingDate ? `Closing ${formatDate(deal.closingDate)} · ${countdownLabel}` : 'Closing date not set'}</p>
              {!locked && <input aria-label="Photo URL" className={`${input} mt-3`} placeholder="Photo URL" value={deal.photoUrl} onChange={(e) => onUpdate('photoUrl', e.target.value)} />}
            </div>
          </div>
</>
    ),
    parties: (
<>
          <h3 className="ds-side-title">Parties</h3>
          <div className="ds-card ds-list">
            {people.length === 0 && <p className="text-sm text-slate-500">No parties added.</p>}
            {people.slice(0, 8).map((p) => (
              <div key={p.id} className="ds-list-row">
                <span className="ds-avatar" aria-hidden="true">{initials(p.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{p.name}</span>
                  <span className="mt-0.5 inline-block rounded-full bg-[#EFEAF8] px-2 py-0.5 text-[11px] font-medium capitalize text-[#301D5D]">{p.role}</span>
                </span>
                {p.email ? <a href={`mailto:${p.email}`} aria-label={`Email ${p.name}`} className="text-slate-400 hover:text-[#301D5D]"><Mail className="h-4 w-4" aria-hidden="true" /></a> : null}
              </div>
            ))}
            <button type="button" onClick={() => onOpenView('d-people')} className="ds-list-row ds-link-row"><span className="min-w-0 flex-1 text-left text-xs text-slate-500">Manage people</span><ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" /></button>
          </div>
</>
    ),
    workspace: (
<>
          <h3 className="ds-side-title">Workspace</h3>
          <div className="ds-card ds-list">
            {([['transaction', 'Current Deal'], ['coordinator', 'Deal Settings'], ['readiness', 'Readiness Check'], ['audit', 'Audit Trail']] as const).map(([view, label]) => (
              <button key={view} type="button" onClick={() => onOpenView(view)} className="ds-list-row ds-link-row"><span className="min-w-0 flex-1 text-left">{label}</span><ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" /></button>
            ))}
          </div>
</>
    ),
  };
  const snapCards: Partial<Record<SnapId, ReactNode>> = {
    next: (
              <div className="ds-card">
                <label className="ds-field-label" htmlFor="deal-next-action">Next action</label>
                <input id="deal-next-action" className={`${input} mt-1`} disabled={locked} value={deal.nextAction} placeholder={nextTask ? nextTask.title : nextDeadline ? `${nextDeadline.label} · ${formatDate(nextDeadline.date)}` : 'What happens next?'} onChange={(e) => onUpdate('nextAction', e.target.value)} />
                <label className="ds-field-label mt-4 block" htmlFor="deal-notes">Notes</label>
                <textarea id="deal-notes" rows={3} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" disabled={locked} value={deal.notes} placeholder="Signing details, client requests, reminders" onChange={(e) => onUpdate('notes', e.target.value)} />
              </div>
    ),
    preferences: (
              <div className="ds-card">
                <p className="ds-side-title !mt-0">Preferences</p>
                <div className="ds-fields mt-3">
                  {([['budget', 'Budget'], ['financing', 'Financing'], ['targetAreas', 'Target areas'], ['mustHaves', 'Must-haves'], ['timeframe', 'Timeframe'], ['minBeds', 'Min beds']] as const).map(([key, label]) => (
                    <div key={key}><label className="ds-field-label" htmlFor={`pref-${key}`}>{label}</label><input id={`pref-${key}`} className={`${input} mt-1`} disabled={locked} value={prefs[key]} onChange={(e) => setPref(key, e.target.value)} /></div>
                  ))}
                </div>
              </div>
    ),
    property: <div>{sideBlocks.property}</div>,
    offers: (
              <div className="scroll-mt-24"><OffersShowings deal={deal} locked={locked} formatDate={formatDate} onUpdate={onUpdate} /></div>
    ),
  };
  const progressStrip = (
    <>
      <h2 className="ds-title !mt-0">{deal.propertyAddress && deal.title && deal.title !== deal.propertyAddress ? `${deal.propertyAddress} — ${deal.title}` : deal.propertyAddress || deal.title || 'New Contract'}</h2>
      <div className="ds-summary" aria-label="Deal summary">
        {([
          ['Purchase price', price ? (price.startsWith('$') ? price : `$${price}`) : 'Not set', ''],
          ['Buyers', deal.buyerNames || 'Not added', 'Your clients'],
          ['Sellers', deal.sellerNames || 'Not added', ''],
          ['Closing', deal.closingDate ? formatDate(deal.closingDate) : 'Not set', deal.closingDate ? countdownLabel : ''],
        ] as const).map(([label, value, hint]) => (
          <div key={label} className="min-w-0">
            <p className="ds-eyebrow">{label}</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-900">{value}{hint ? <span className="ml-1.5 text-xs font-normal text-slate-500">{hint}</span> : null}</p>
          </div>
        ))}
      </div>
      <ol className="ds-stepper" aria-label="Deal progress">
        {milestones.map((m, index) => (
          <li key={m.key} className={`ds-step ${m.done ? 'is-done' : ''} ${m.current ? 'is-current' : ''} ${index === 0 ? 'is-first' : ''} ${index === milestones.length - 1 ? 'is-last' : ''} ${index > 0 && milestones[index - 1].done ? 'prev-done' : ''}`} aria-current={m.current ? 'step' : undefined}>
            <span className="ds-step-dot">{m.done ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" /> : null}</span>
            <span className="ds-step-label">{m.label}</span>
            <span className="ds-step-sub">{m.current ? 'Now' : m.date ? shortDate(m.date) : ''}</span>
          </li>
        ))}
      </ol>
    </>
  );
  if (stripOnly) return <div className="ds-page ds-strip" data-testid="deal-strip">{progressStrip}</div>;

  const tabs: [Tab, string][] = [['tasks', `Tasks ${deal.tasks.length}`], ['history', 'History']];

  if ((section as string | undefined) === 'overview') {
    const doneTasks = deal.tasks.length - openTasks.length;
    const overdueTasks = openTasks.filter((t) => t.dueDate && t.dueDate < today).length;
    const weekEnd = new Date(Date.parse(`${today}T12:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
    const dueSoon = openTasks.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd).length;
    const upcoming = [...openTasks].sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')).slice(0, 6);
    const pct = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0);
    const reqDone = PURCHASE_REQUIRED_IDS.filter((id) => deal.documentChecks[id]).length;
    const scheduled = deal.reminders.filter((r) => !r.complete).length;
    const stat = (label: string, value: string, tone?: string) => (
      <div className="min-w-0"><p className="ds-eyebrow">{label}</p><p className={`mt-1 text-xl font-semibold ${tone ?? 'text-slate-900'}`}>{value}</p></div>
    );
    type PartyRow = { id: string; name: string; role: string; sub: string; email: string; phone: string; menu?: boolean };
    const clientRe = /buyer|seller|client|tenant|landlord|owner/i;
    const sideRe = /agent|coordinator|broker|realtor/i;
    const known = new Set(deal.clientContacts.map((p) => p.name.trim().toLowerCase()));
    const fromNames = (names: string, role: string): PartyRow[] => (names || '').split(/\s*(?:&|,|\band\b)\s*/i).map((n) => n.trim()).filter((n) => n && !known.has(n.toLowerCase())).map((n) => ({ id: `n-${role}-${n}`, name: n, role, sub: 'Your client', email: '', phone: '' }));
    const yourSide: PartyRow[] = [
      ...deal.clientContacts.filter((p) => !p.role || clientRe.test(p.role) || sideRe.test(p.role)).map((p) => ({ id: p.id, name: p.name, role: p.role || 'Client', sub: !p.role || clientRe.test(p.role) ? 'Your client' : (p.email ?? ''), email: p.email ?? '', phone: p.phone ?? '', menu: Boolean(p.role && sideRe.test(p.role)) })),
      ...fromNames(deal.buyerNames, 'Buyer'),
      ...fromNames(deal.sellerNames, 'Seller'),
    ];
    const external: PartyRow[] = [
      ...deal.clientContacts.filter((p) => p.role && !clientRe.test(p.role) && !sideRe.test(p.role)).map((p) => ({ id: p.id, name: p.name, role: p.role as string, sub: p.email ?? '', email: p.email ?? '', phone: p.phone ?? '' })),
      ...deal.serviceProviders.map((p) => ({ id: p.id, name: p.name, role: p.category, sub: p.email ?? '', email: p.email ?? '', phone: p.phone ?? '' })),
    ];
    const roleTone = () => ['border-[#E6E5EC] bg-[#F6F3FB] text-[#301D5D]', 'bg-[#EFEAF8] text-[#301D5D]'];
    const partyRow = (p: PartyRow) => {
      const [pill, avatar] = roleTone();
      return (
        <div key={p.id} className="flex items-start gap-3 border-b border-[#F1F0F5] px-4 py-3 last:border-0">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${avatar}`} aria-hidden="true">{initials(p.name)}</span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5"><span className="text-sm font-semibold text-slate-900">{p.name}</span><span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${pill}`}>{p.role}</span></span>
            {p.sub ? <span className="mt-0.5 block truncate text-xs text-slate-500">{p.sub}</span> : null}
          </span>
          <span className="flex shrink-0 items-center gap-3 pt-1.5 text-slate-400">
            {p.email ? <a href={`mailto:${p.email}`} aria-label={`Email ${p.name}`} className="hover:text-[#301D5D]"><Mail className="h-4 w-4" aria-hidden="true" /></a> : <Mail className="h-4 w-4 opacity-40" aria-hidden="true" />}
            {p.phone ? <a href={`tel:${p.phone}`} aria-label={`Call ${p.name}`} className="hover:text-[#301D5D]"><Phone className="h-4 w-4" aria-hidden="true" /></a> : <Phone className="h-4 w-4 opacity-40" aria-hidden="true" />}
            {p.menu ? <MoreHorizontal className="h-4 w-4" aria-hidden="true" /> : null}
          </span>
        </div>
      );
    };
    const partiesCard = (
      <div className="overflow-hidden rounded-2xl border border-[#E6E5EC] bg-white self-start">
        <div className="flex items-center justify-between px-4 py-3.5">
          <p className="text-base font-semibold text-slate-900">Parties</p>
          <button type="button" className="!border-0 !bg-transparent !text-slate-500 hover:!text-[#301D5D]" onClick={() => onOpenView('d-people')}><Plus className="mr-1 inline h-4 w-4" aria-hidden="true" />Add</button>
        </div>
        <p className="border-y border-[#F1F0F5] bg-[#F6F3FB] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">Your side</p>
        {yourSide.length === 0 ? <p className="px-4 py-4 text-xs text-slate-500">No parties added.</p> : yourSide.map(partyRow)}
        {external.length > 0 && <p className="border-y border-[#F1F0F5] bg-[#F6F3FB] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">External parties</p>}
        {external.map(partyRow)}
      </div>
    );
    return (
      <div className="ds-page" data-testid="deal-snapshot">
        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="ds-card">
            <div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-900">Tasks</p><button type="button" onClick={() => onOpenView('tasks')}>View all</button></div>
            <div className="mt-3 grid grid-cols-4 gap-3">
              {stat('Open', String(openTasks.length))}
              {stat('Done', String(doneTasks))}
              {stat('Overdue', String(overdueTasks), overdueTasks ? 'text-[#9A3D2B]' : undefined)}
              {stat('Due 7 days', String(dueSoon))}
            </div>
            <div className="ds-bar mt-3" aria-hidden="true"><span style={{ width: `${pct(doneTasks, deal.tasks.length)}%` }} /></div>
            <p className="mt-1 text-xs text-slate-500">{pct(doneTasks, deal.tasks.length)}% complete</p>
            <ul className="mt-3 divide-y divide-[#F1F0F5]">
              {upcoming.length === 0 && <li className="py-2 text-xs text-slate-500">No open tasks.</li>}
              {upcoming.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-slate-900">{t.title}</span>
                  <span className={`shrink-0 text-xs ${t.dueDate && t.dueDate < today ? 'text-[#9A3D2B]' : 'text-slate-500'}`}>{t.dueDate ? formatDate(t.dueDate) : 'No date'}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="ds-card">
            <div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-900">Documents</p><button type="button" onClick={() => onOpenView('d-documents')}>View all</button></div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {stat('Required in', `${reqDone}/${PURCHASE_REQUIRED_IDS.length}`, reqDone === PURCHASE_REQUIRED_IDS.length ? 'text-[#2F7D5B]' : undefined)}
              {stat('Missing', String(missingRequired.length), missingRequired.length ? 'text-[#9A3D2B]' : undefined)}
              {stat('Complete', `${pct(reqDone, PURCHASE_REQUIRED_IDS.length)}%`)}
            </div>
            <ul className="mt-3 space-y-2.5">
              {PURCHASE_FOLDERS.map((folder) => {
                const total = folder.docs.length;
                const done = folder.docs.filter((d) => deal.documentChecks[d.id]).length;
                return (
                  <li key={folder.id}>
                    <div className="flex items-center justify-between text-xs"><span className="text-slate-900">{folder.label}</span><span className="text-slate-500">{done}/{total}</span></div>
                    <div className="ds-bar mt-1" aria-hidden="true"><span style={{ width: `${pct(done, total)}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="ds-card">
            <div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-900">Deadlines And Reminders</p><button type="button" onClick={() => onOpenView('transaction')}>Open</button></div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {stat('Next deadline', nextDeadline ? formatDate(nextDeadline.date) : '—', nextDeadline && nextDeadline.date < today ? 'text-[#9A3D2B]' : undefined)}
              {stat('Closing', deal.closingDate ? formatDate(deal.closingDate) : '—')}
              {stat('Reminders', String(scheduled))}
            </div>
            {nextDeadline && <p className="mt-3 text-xs text-slate-500">{nextDeadline.label}</p>}
          </div>
          <div className="ds-card">
            <div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-900">People And Offers</p><button type="button" onClick={() => onOpenView('d-people')}>Open</button></div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {stat('Parties', String(deal.clientContacts.length))}
              {stat('Offers', String(deal.offersShowings.filter((x) => x.kind === 'offer').length))}
              {stat('Showings', String(deal.offersShowings.filter((x) => x.kind === 'showing').length))}
            </div>
          </div>
        </div>
        {partiesCard}
        </div>
      </div>
    );
  }

  return (
    <div className="ds-page" data-testid="deal-subpage">
      {!section && (<>
      <button type="button" className="ds-back" onClick={onBack}><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Deals</button>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="ds-title">{deal.propertyAddress || deal.title}</h2>
          <p className="ds-subtitle">{clients.length ? clients.join(' · ') : 'No clients added'}{deal.owner ? ` · ${deal.owner}` : ''}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select aria-label="Deal type" value={deal.dealType} disabled={locked} onChange={(e) => onUpdate('dealType', e.target.value as AgentDeal['dealType'])} className="ds-select !h-[34px] !min-w-[170px]">
              {DEAL_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <select aria-label="Deal status" value={deal.workflowStatus} disabled={locked} onChange={(e) => onUpdate('workflowStatus', e.target.value as AgentDeal['workflowStatus'])} className="ds-select !h-[34px] !min-w-[170px]">
              {statuses.map((s) => <option key={s} value={s}>{statusLabels[s] ?? s}</option>)}
            </select>
            <button type="button" className="text-sm font-medium text-[#301D5D] underline-offset-2 hover:underline" onClick={() => onOpenView('transaction')}>View details</button>
          </div>
        </div>
        <span className={`ds-chip ${health.tone}`}>{health.label}</span>
      </div>

      </>)}

      {(!section || section === 'overview') && (<>
      {section === 'overview' && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="ds-title !mt-0">{deal.propertyAddress || deal.title}</h2>
              <span className="ds-chip bg-[#EFEAF8] text-[#301D5D]">{DEAL_TYPES.find((t) => t.id === deal.dealType)?.label ?? 'Deal'}</span>
              <span className="ds-chip bg-slate-100 text-slate-600">{statusLabels[deal.workflowStatus] ?? deal.workflowStatus}</span>
            </div>
            <p className="ds-subtitle">{clients.length ? clients.join(' · ') : 'No clients added'}{deal.owner ? ` · ${deal.owner}` : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`ds-chip ${health.tone}`}>{health.label}</span>
            <select aria-label="Deal status" value={deal.workflowStatus} disabled={locked} onChange={(e) => onUpdate('workflowStatus', e.target.value as AgentDeal['workflowStatus'])} className="ds-select !h-[34px] !min-w-[170px]">
              {statuses.map((st) => <option key={st} value={st}>{statusLabels[st] ?? st}</option>)}
            </select>
          </div>
        </div>
      )}
      {progressStrip}

      </>)}

      <div className={section ? '' : 'ds-split'}>
        <div className="min-w-0">
          {!section && (
          <div className="ds-tabs !mt-0" role="tablist" aria-label="Deal sections">
            {tabs.map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className="ds-tab">{label}</button>
            ))}
            <button type="button" className="ds-tab" onClick={() => onOpenView('transaction')}>Contract</button>
          </div>
          )}

          {tab === 'overview' && (() => {
            const clientRole = /buyer|seller|client|tenant|landlord|owner|agent|coordinator/i;
            const named = new Set(people.map((p) => p.name.trim().toLowerCase()));
            const clientNames = [[deal.buyerNames, 'Buyer'], [deal.sellerNames, 'Seller']].flatMap(([names, role]) => (names || '').split(/\s*(?:&|,|\band\b)\s*/i).map((n) => n.trim()).filter((n) => n && !named.has(n.toLowerCase())).map((n) => ({ id: `n-${role}-${n}`, name: n, role, email: '', phone: '', sub: 'Your client' })));
            const yourSide = [...people.filter((p) => !p.role || clientRole.test(p.role)).map((p) => ({ id: p.id, name: p.name, role: p.role || 'Client', email: p.email ?? '', phone: p.phone ?? '', sub: /buyer|seller|client|tenant|landlord|owner/i.test(p.role ?? '') || !p.role ? 'Your client' : (p.email ?? '') })), ...clientNames];
            const external = people.filter((p) => p.role && !clientRole.test(p.role)).map((p) => ({ id: p.id, name: p.name, role: p.role as string, email: p.email ?? '', phone: p.phone ?? '', sub: p.email ?? '' }));
            const soon = nextDeadline && nextDeadline.date <= new Date(Date.parse(`${today}T12:00:00Z`) + 3 * 86400000).toISOString().slice(0, 10);
            const attentionRows: { key: string; eyebrow: string; title: string; detail: string; tone: 'red' | 'amber'; go: string }[] = [
              ...openTasks.filter((t) => t.dueDate && t.dueDate <= today).map((t) => ({ key: t.id, eyebrow: 'Task', title: t.title, detail: t.dueDate < today ? `Overdue · ${formatDate(t.dueDate)}` : 'Due today', tone: (t.dueDate < today ? 'red' : 'amber') as 'red' | 'amber', go: 'tasks' })),
              ...(nextDeadline && soon ? [{ key: 'deadline', eyebrow: 'Deadline', title: nextDeadline.label, detail: nextDeadline.date <= today ? (nextDeadline.date < today ? `Past due · ${formatDate(nextDeadline.date)}` : 'Due today') : `Due ${formatDate(nextDeadline.date)}`, tone: (nextDeadline.date <= today ? 'red' : 'amber') as 'red' | 'amber', go: 'transaction' }] : []),
            ];
            const waitingRows = [
              ...openTasks.filter((t) => !t.dueDate || t.dueDate > today).map((t) => ({ key: t.id, chip: 'Task', title: t.title, detail: t.dueDate ? `Due ${formatDate(t.dueDate)}` : 'No due date', go: 'tasks' })),
              ...missingRequired.map((doc) => ({ key: doc.id, chip: 'Document', title: doc.label, detail: 'Required document', go: 'd-documents' })),
            ];
            const requiredDone = PURCHASE_REQUIRED_IDS.filter((id) => deal.documentChecks[id]).length;
            const scheduled = deal.reminders.filter((r) => !r.complete).length;
            const handling = [
              { key: 'alerts', title: 'Deadline alerts', detail: `${scheduled} ${scheduled === 1 ? 'reminder' : 'reminders'} scheduled`, chip: scheduled ? 'In motion' : 'Not set', go: 'coordinator' },
              { key: 'readiness', title: 'Readiness check', detail: `${requiredDone} of ${PURCHASE_REQUIRED_IDS.length} required documents in`, chip: requiredDone === PURCHASE_REQUIRED_IDS.length ? 'Complete' : 'In progress', go: 'readiness' },
              { key: 'followups', title: 'Follow-up drafts', detail: 'Intro and status requests to your parties', chip: 'Ready', go: 'coordinator' },
            ];
            const cardHead = (icon: ReactNode, title: string, count: number, tone: string) => (
              <div className="flex items-center justify-between border-b border-[#E6E5EC] px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">{icon} {title}</p>
                <span className={`ds-chip ${tone}`}>{count}</span>
              </div>
            );
            const footLink = (label: string, go: string) => (
              <button type="button" onClick={() => onOpenView(go)} className="flex w-full items-center justify-between px-4 py-3 text-xs text-slate-500 hover:text-slate-900">{label} <ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
            );
            const partyRow = (p: { id: string; name: string; role: string; email: string; phone: string; sub: string }) => (
              <div key={p.id} className="flex items-center gap-2.5 px-4 py-2.5">
                <span className="ds-avatar !mr-0" aria-hidden="true">{initials(p.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5"><span className="truncate text-sm font-semibold text-slate-900">{p.name}</span><span className="rounded-full bg-[#EFEAF8] px-2 py-0.5 text-[11px] font-medium capitalize text-[#301D5D]">{p.role}</span></span>
                  {p.sub ? <span className="block truncate text-xs text-slate-500">{p.sub}</span> : null}
                </span>
                {p.email ? <a href={`mailto:${p.email}`} aria-label={`Email ${p.name}`} className="text-slate-400 hover:text-[#301D5D]"><Mail className="h-4 w-4" aria-hidden="true" /></a> : null}
                {p.phone ? <a href={`tel:${p.phone}`} aria-label={`Call ${p.name}`} className="text-slate-400 hover:text-[#301D5D]"><Phone className="h-4 w-4" aria-hidden="true" /></a> : null}
              </div>
            );
            return (
              <div className="space-y-4">
                <div className="ds-snap-grid">
                  <div className="ds-card !p-0 self-start">
                    {cardHead(<AlertCircle className="h-4 w-4 text-amber-600" aria-hidden="true" />, 'Needs Your Attention', attentionRows.length, 'bg-amber-50 text-amber-700')}
                    {attentionRows.length === 0 ? <p className="px-4 py-4 text-xs text-slate-500">Nothing needs you right now.</p> : attentionRows.map((item) => (
                      <div key={item.key} className="border-b border-[#F1F0F5] px-4 py-3">
                        <p className={`text-[11px] font-medium ${item.tone === 'red' ? 'text-[#9A3D2B]' : 'text-amber-700'}`}>{item.eyebrow}</p>
                        <p className="mt-0.5 text-sm font-semibold text-slate-900">{item.title}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{item.detail}</p>
                        <button type="button" className="mt-2" onClick={() => onOpenView(item.go)}>Open</button>
                      </div>
                    ))}
                    {footLink('View all tasks', 'tasks')}
                  </div>
                  <div className="ds-card !p-0 self-start">
                    {cardHead(<Sparkles className="h-4 w-4 text-[#7059A8]" aria-hidden="true" />, 'The AI Is Handling', handling.length, 'bg-[#EFEAF8] text-[#301D5D]')}
                    {handling.map((item) => (
                      <button key={item.key} type="button" onClick={() => onOpenView(item.go)} className="ds-snap-row">
                        <span className="min-w-0 flex-1 text-left">
                          <span className="block text-sm font-semibold">{item.title}</span>
                          <span className="block text-xs opacity-70">{item.detail}</span>
                        </span>
                        <span className="ds-chip bg-[#EFEAF8] text-[#301D5D]">{item.chip}</span>
                      </button>
                    ))}
                    {footLink('Message AI', 'coordinator')}
                  </div>
                  <div className="ds-card !p-0 self-start">
                    {cardHead(<Clock className="h-4 w-4 text-[#7059A8]" aria-hidden="true" />, 'Waiting On Others', waitingRows.length, 'bg-[#EFEAF8] text-[#301D5D]')}
                    {waitingRows.length === 0 ? <p className="px-4 py-4 text-xs text-slate-500">Nothing is pending.</p> : waitingRows.slice(0, 5).map((item) => (
                      <button key={item.key} type="button" onClick={() => onOpenView(item.go)} className="ds-snap-row">
                        <span className="min-w-0 flex-1 text-left">
                          <span className="flex flex-wrap items-center gap-1.5"><span className="text-sm font-semibold">{item.title}</span><span className="rounded bg-[#EFEAF8] px-1.5 py-0.5 text-[11px] font-medium text-[#301D5D]">{item.chip}</span></span>
                          <span className="block text-xs opacity-70">{item.detail}</span>
                        </span>
                      </button>
                    ))}
                    {footLink(waitingRows.length > 5 ? `View all ${waitingRows.length}` : 'View documents', 'd-documents')}
                  </div>
                  <div className="ds-card !p-0 self-start">
                    <div className="flex items-center justify-between border-b border-[#E6E5EC] px-4 py-3">
                      <p className="text-sm font-semibold text-slate-900">Parties</p>
                      <button type="button" onClick={() => onOpenView('d-people')}><Plus className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Add</button>
                    </div>
                    <p className="ds-eyebrow px-4 pt-3">Your side</p>
                    {yourSide.length === 0 ? <p className="px-4 py-3 text-xs text-slate-500">No parties added.</p> : yourSide.map(partyRow)}
                    {external.length > 0 && <p className="ds-eyebrow px-4 pt-3">External parties</p>}
                    {external.map(partyRow)}
                    <div className="h-2" />
                  </div>
                </div>
                <div className="space-y-2">
                  {([['next', 'Next Action And Notes'], ['preferences', 'Preferences'], ['offers', 'Offers And Showings'], ['property', 'Focus Property']] as const).map(([id, label]) => (
                    <details key={id} className="ds-detail">
                      <summary>{label}</summary>
                      <div className="pt-3">{snapCards[id]}</div>
                    </details>
                  ))}
                </div>
              </div>
            );
          })()}

          {tab === 'documents' && (() => {
            const checks = deal.documentChecks;
            const requiredDone = PURCHASE_REQUIRED_IDS.filter((id) => checks[id]).length;
            return (
              <div className="space-y-4">
                <div className="ds-card flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="ds-side-title !m-0">{({ purchase: 'Purchase', listing_sale: 'Listing For Sale', listing_lease: 'Listing For Lease', lease: 'Lease' } as Record<string, string>)[deal.dealType] ?? 'Deal'} documents</p>
                    <p className="text-sm text-slate-500">Required forms for this deal type.</p>
                  </div>
                  <span className={`ds-chip ${requiredDone === PURCHASE_REQUIRED_IDS.length ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{requiredDone} of {PURCHASE_REQUIRED_IDS.length} required received</span>
                </div>
                {PURCHASE_FOLDERS.map((folder) => {
                  const req = folder.docs.filter((x) => x.kind === 'required');
                  const reqDone = req.filter((x) => checks[x.id]).length;
                  return (
                    <div key={folder.id} className="ds-card ds-list">
                      <div className="flex items-center justify-between gap-2 border-b border-[#E6E5EC] px-4 py-3 text-sm font-semibold text-slate-900">
                        <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-[#7059A8]" aria-hidden="true" />{folder.label}</span>
                        {req.length > 0 && <span className="text-xs font-medium text-slate-500">{reqDone} of {req.length} required</span>}
                      </div>
                      {folder.docs.map((doc) => (
                        <label key={doc.id} className="ds-list-row cursor-pointer">
                          <span className={`w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wide ${doc.kind === 'required' ? 'text-[#C2412D]' : 'text-slate-400'}`}>{doc.kind === 'reference' ? 'PDF' : doc.kind}</span>
                          <input type="checkbox" checked={Boolean(checks[doc.id])} disabled={locked} onChange={(e) => onUpdate('documentChecks', { ...checks, [doc.id]: e.target.checked })} />
                          <span className="min-w-0 flex-1">{doc.label}</span>
                          <span className={`ds-chip ${checks[doc.id] ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{checks[doc.id] ? 'Received' : 'Not submitted'}</span>
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {tab === 'people' && (
            <div className="space-y-6">
              <section>
                <div className="flex items-center justify-between gap-3">
                  <div><p className="ds-side-title !m-0">People</p><p className="text-sm text-slate-500">Clients, vendors and others on this deal.</p></div>
                  {!locked && <button type="button" className={btnPrimary} onClick={() => setShowPersonForm((v) => !v)}><Plus className="h-4 w-4" aria-hidden="true" /> Add people</button>}
                </div>
                {showPersonForm && (
                  <form className="ds-card mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
                    e.preventDefault();
                    const data = new FormData(e.currentTarget);
                    const name = String(data.get('name') ?? '').trim();
                    if (!name) return;
                    onUpdate('clientContacts', [...people, { id: newId('person'), name, role: String(data.get('role') ?? ''), email: String(data.get('email') ?? ''), phone: String(data.get('phone') ?? '') }].slice(0, 20));
                    e.currentTarget.reset();
                    setShowPersonForm(false);
                  }}>
                    <input name="name" required placeholder="Name" aria-label="Name" className={input} />
                    <input name="role" placeholder="Role (buyer, lender, title...)" aria-label="Role" className={input} />
                    <input name="email" type="email" placeholder="Email" aria-label="Email" className={input} />
                    <input name="phone" type="tel" placeholder="Phone" aria-label="Phone" className={input} />
                    <div className="sm:col-span-2 flex justify-end gap-2"><button type="button" className={btn} onClick={() => setShowPersonForm(false)}>Cancel</button><button type="submit" className={btnPrimary}>Save</button></div>
                  </form>
                )}
                <div className="ds-card ds-list mt-3">
                  {people.length === 0 && clients.length === 0 && <p className="text-sm text-slate-500">No people added yet.</p>}
                  {people.length === 0 && deal.buyerNames && <div className="ds-list-row"><UserRound className="h-4 w-4 text-slate-400" aria-hidden="true" /><span className="flex-1">{deal.buyerNames}</span><span className="text-xs text-slate-500">Buyer</span></div>}
                  {people.length === 0 && deal.sellerNames && <div className="ds-list-row"><UserRound className="h-4 w-4 text-slate-400" aria-hidden="true" /><span className="flex-1">{deal.sellerNames}</span><span className="text-xs text-slate-500">Seller</span></div>}
                  {people.map((person) => (
                    <div key={person.id} className="ds-list-row">
                      <UserRound className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                      <span className="min-w-0 flex-1"><span className="block font-medium text-slate-900">{person.name}</span><span className="block truncate text-xs text-slate-500">{[person.role, person.email, person.phone].filter(Boolean).join(' · ')}</span></span>
                      {!locked && <button type="button" aria-label={`Remove ${person.name}`} className="text-slate-400 hover:text-[#9A3D2B]" onClick={() => onUpdate('clientContacts', people.filter((p) => p.id !== person.id))}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <p className="ds-side-title !m-0">Trusted service providers</p>
                <p className="text-sm text-slate-500">Set up the lenders, inspectors, attorneys and others you recommend on this deal.</p>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {SERVICE_PROVIDER_CATEGORIES.map((category) => {
                    const count = deal.serviceProviders.filter((p) => p.category === category).length;
                    return (
                      <button key={category} type="button" onClick={() => setProviderCategory(category)} className="ds-provider-tile">
                        <span className="text-xs font-semibold uppercase tracking-wide text-[#5B3FA0]">{count ? `${count} added` : 'Set up'}</span>
                        <span className="text-sm font-medium text-slate-900">{category}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          )}

          {tab === 'tasks' && (
            <div className="space-y-4">
              <div className="ds-card">
                <p className="ds-side-title !m-0">Add task list</p>
                <p className="text-sm text-slate-500">Load a checklist into this deal. Tasks already on the deal are skipped.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {TASK_TEMPLATES.map((t) => <button key={t.id} type="button" disabled={locked} className={btn} onClick={() => addTemplate(t.id)}><Plus className="h-4 w-4" aria-hidden="true" />{t.label}</button>)}
                </div>
              </div>
              <div className="ds-card ds-list">
                {deal.tasks.length === 0 && <p className="text-sm text-slate-500">No tasks yet.</p>}
                {deal.tasks.map((t) => (
                  <label key={t.id} className="ds-list-row cursor-pointer">
                    <input type="checkbox" checked={t.complete} disabled={locked} onChange={(e) => onUpdate('tasks', deal.tasks.map((x) => x.id === t.id ? { ...x, complete: e.target.checked, status: e.target.checked ? 'done' as const : 'todo' as const } : x))} />
                    <span className={`min-w-0 flex-1 ${t.complete ? 'text-slate-400 line-through' : ''}`}>{t.title}</span>
                    <span className="text-xs uppercase tracking-wide text-slate-400">{t.dueDate ? formatDate(t.dueDate) : 'No due date'}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {tab === 'history' && (
            <div className="ds-card ds-list">
              {[...deal.activity].reverse().slice(0, 50).map((a) => (
                <div key={a.id} className="ds-list-row"><span className="min-w-0 flex-1">{a.message}</span><span className="text-xs text-slate-500">{formatDate(a.createdAt.slice(0, 10))}</span></div>
              ))}
            </div>
          )}
        </div>

        {!section && (<aside className="ds-rail-right" aria-label="Deal details">
          {sideBlocks.property}
          {sideBlocks.parties}
          {sideBlocks.workspace}
        </aside>)}
      </div>

      {providerCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-label={`Trusted ${providerCategory.toLowerCase()} providers`} onClick={() => setProviderCategory(null)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-900">Trusted {providerCategory.toLowerCase()} providers</h3>
              <button type="button" aria-label="Close" className="text-slate-500 hover:text-slate-900" onClick={() => setProviderCategory(null)}><X className="h-5 w-5" aria-hidden="true" /></button>
            </div>
            <div className="mt-3 divide-y divide-[#F1F0F5]">
              {deal.serviceProviders.filter((p) => p.category === providerCategory).map((p) => (
                <div key={p.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1"><span className="block font-medium text-slate-900">{p.name}</span><span className="block truncate text-xs text-slate-500">{[p.phone, p.email].filter(Boolean).join(' · ')}</span></span>
                  {!locked && <button type="button" aria-label={`Remove ${p.name}`} className="text-slate-400 hover:text-[#9A3D2B]" onClick={() => onUpdate('serviceProviders', deal.serviceProviders.filter((x) => x.id !== p.id))}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}
                </div>
              ))}
              {deal.serviceProviders.filter((p) => p.category === providerCategory).length === 0 && <p className="py-2 text-sm text-slate-500">No providers added yet.</p>}
            </div>
            {!locked && (
              <form className="mt-3 grid gap-2 sm:grid-cols-3" onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                const name = String(data.get('name') ?? '').trim();
                if (!name) return;
                onUpdate('serviceProviders', [...deal.serviceProviders, { id: newId('provider'), category: providerCategory, name, phone: String(data.get('phone') ?? ''), email: String(data.get('email') ?? '') }].slice(0, 60));
                e.currentTarget.reset();
              }}>
                <input name="name" required placeholder="Company or name" aria-label="Company or name" className={input} />
                <input name="phone" type="tel" placeholder="Phone" aria-label="Phone" className={input} />
                <input name="email" type="email" placeholder="Email" aria-label="Email" className={input} />
                <div className="sm:col-span-3 flex justify-end gap-2"><button type="button" className={btn} onClick={() => setProviderCategory(null)}>Done</button><button type="submit" className={btnPrimary}>Add provider</button></div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OffersShowings({ deal, locked, formatDate, onUpdate }: Pick<Props, 'deal' | 'locked' | 'formatDate' | 'onUpdate'> & { deal: AgentDeal }) {
  const items = deal.offersShowings;
  return (
    <div className="ds-card">
      <p className="ds-side-title !mt-0">Offers &amp; showings</p>
      <div className="mt-2 divide-y divide-[#F1F0F5]">
        {items.length === 0 && <p className="py-2 text-sm text-slate-500">No offers or showings logged.</p>}
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 py-2 text-sm">
            <span className={`ds-chip ${item.kind === 'offer' ? 'ds-chip-purple' : 'bg-slate-100 text-slate-600'}`}>{item.kind === 'offer' ? 'Offer' : 'Showing'}</span>
            <span className="min-w-0 flex-1"><span className="block font-medium text-slate-900">{item.label}</span><span className="block text-xs text-slate-500">{[item.date ? formatDate(item.date) : '', item.amount, item.status].filter(Boolean).join(' · ')}</span></span>
            {!locked && <button type="button" aria-label={`Remove ${item.label}`} className="text-slate-400 hover:text-[#9A3D2B]" onClick={() => onUpdate('offersShowings', items.filter((x) => x.id !== item.id))}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}
          </div>
        ))}
      </div>
      {!locked && (
        <form className="mt-3 grid gap-2 sm:grid-cols-[110px_140px_minmax(0,1fr)_120px_auto]" onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const label = String(data.get('label') ?? '').trim();
          if (!label) return;
          onUpdate('offersShowings', [...items, { id: newId('os'), kind: data.get('kind') === 'offer' ? 'offer' as const : 'showing' as const, date: String(data.get('date') ?? ''), label, amount: String(data.get('amount') ?? ''), status: '' }].slice(0, 100));
          e.currentTarget.reset();
        }}>
          <select name="kind" aria-label="Type" className={input}><option value="showing">Showing</option><option value="offer">Offer</option></select>
          <input name="date" type="date" aria-label="Date" className={input} />
          <input name="label" required placeholder="Property or note" aria-label="Property or note" className={input} />
          <input name="amount" placeholder="Amount" aria-label="Amount" className={input} />
          <button type="submit" className={btnPrimary}><Plus className="h-4 w-4" aria-hidden="true" /> Add</button>
        </form>
      )}
    </div>
  );
}
