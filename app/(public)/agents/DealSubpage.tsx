'use client';

import StatusSymbol from './StatusSymbol';
import { buildDealFile, downloadDealFilePdf, printDealFile } from './dealFile';
import { dealPeople } from '@/lib/closing-time-people';
import { blankFieldAlerts } from '@/lib/blank-field-alerts';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, Check, Phone, Sparkles, ChevronLeft, ChevronRight, Clock, FileText, MoreHorizontal, Mail, MessageSquare, Plus, Trash2, UserRound, X } from 'lucide-react';
import type { AgentDeal } from '@/lib/agent-command-center-workspace';
import TrecFormActions from './TrecFormActions';
import ClientUploadsCard from './ClientUploadsCard';
import DocumentRequestsCard from './DocumentRequestsCard';
import { BUYER_REP_FORM_OPTIONS, CONTRACT_FORM_OPTIONS, dealFolders, effectiveAgentSide, requiredIdsFor } from './purchase-documents';
import Tip from './Tip';
import { EXTENSION_DAYS, autoCloseState, formatCloseDate } from '@/lib/closing-time-lifecycle';

type SnapId = 'attention' | 'waiting' | 'property' | 'next' | 'preferences' | 'offers' | 'parties' | 'workspace';

type Tab = 'overview' | 'documents' | 'people' | 'tasks' | 'history';

export const DEAL_TYPES: { id: AgentDeal['dealType']; label: string }[] = [
  { id: 'purchase', label: 'Purchase' },
  { id: 'listing_sale', label: 'Listing for Sale' },
  { id: 'listing_lease', label: 'Listing for Lease' },
  { id: 'lease', label: 'Lease' },
  { id: 'real_estate_other', label: 'Real Estate Other' },
  { id: 'other', label: 'Other' },
];

const titleCaseLabel = (v: string): string => v.replace(/(^|[\s/])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase());

export const SERVICE_PROVIDER_CATEGORIES = [
  'Utilities', 'Home improvement', 'Mortgage', 'Home security', 'Home inspection',
  'Moving & storage', 'Home warranty', 'Attorney', 'Home insurance', 'Escrow/title', 'Other home services',
];

export const TASK_TEMPLATES: { id: string; label: string; tasks: string[] }[] = [
  {
    id: 'tc-buyer', label: 'TC Buyer Checklist',
    tasks: ['Send welcome letter to agent', 'Confirm whether the property has a well or needs a septic inspection', 'Order home warranty (if applicable)', 'Complete contact information sheets', 'Send intro email to title with executed contract', 'Send intro email to lender with executed contract', 'Send intro email to the other agent', 'Send intro email to client', 'Earnest money due', 'Confirm earnest money receipt with title', 'Order inspection', 'Inspection deadline', 'Wood-destroying insect inspection (VA/FHA)', 'Review inspection report', 'Request repairs', 'Loan application', 'Loan approval', 'Schedule closing with title', 'Seller property disclosure received', 'Title commitment and insurance deadline', 'Appraisal due', 'Buyer homeowner insurance', 'HOA application and approval', 'HOA estoppel', 'Survey and survey report'],
  },
  {
    id: 'tc-seller', label: 'TC Seller Checklist',
    tasks: ['Executed sales contract received', 'Send contact sheets to all parties', 'Executed seller property disclosure', 'Send executed contract to title company', 'Earnest money due', 'Second earnest money deposit', 'Confirm earnest money receipt from title', 'Inspection deadline', 'Buyer loan application', 'Buyer loan approval', 'Schedule closing with title', 'Appraisal due', 'HOA estoppel requested from title', 'Title commitment requested from title', 'Utilities information shared with buyer agent', 'Closing disclosure delivered to buyer', 'Clear to close', 'Proof of funds', 'Pre-qualification letter', 'Lead-based paint disclosure (if applicable)', 'Final walk-through coordinated', 'Closing date', 'Compensation agreement from buyer agent', 'Update MLS to closed'],
  },
  {
    id: 'listing', label: 'Listing Checklist',
    tasks: ['Sign listing agreement', 'Collect seller disclosure', 'Order professional photos', 'Measure and gather property details', 'Enter listing in MLS', 'Install sign and lockbox', 'Schedule open house', 'Review showing feedback', 'Review offers with seller', 'Execute contract'],
  },
  {
    id: 'buying', label: 'Buying Checklist',
    tasks: ['Add earnest money receipt', 'Add contingencies to calendar and tasks', 'Add inspector', 'Add lender', 'Order inspections', 'Upload inspection report', 'Create inspection addendum', 'Remove inspection contingency', 'Complete agent info sheet for title', 'Schedule closing', 'Do a final walkthrough', 'Complete close', 'Upload closing statement', 'Ask for a review', 'Create market report for the new neighborhood'],
  },
];

const input = 'h-[36px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm';
const btn = 'inline-flex h-[34px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-[#F6F3FB]';
const btnPrimary = 'inline-flex h-[34px] items-center gap-2 rounded-lg bg-[#301D5D] px-3 text-sm font-semibold text-white hover:bg-[#42277C]';


const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';

type PartyView = { name: string; role: string; company?: string; email: string; phone: string };
/** One person on a deal, identical on Snapshot (desktop and mobile) and the People tab: full contact details, nothing truncated. */
function PartyLine({ p, textHref: textLink, onRemove }: { p: PartyView; textHref: string; onRemove?: () => void }) {
  return (
    <div className="flex items-start gap-3 border-b border-[#F6F3FB] px-4 py-3 last:border-0">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EFEAF8] text-xs font-semibold text-[#301D5D]" aria-hidden="true">{initials(p.name)}</span>
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-semibold text-slate-900">{p.name}</span>
        <span className="block break-words text-xs font-medium text-slate-500">{[p.role, p.company && p.company !== p.name ? p.company : ''].filter(Boolean).join(' · ')}</span>
        {p.email ? <span className="mt-0.5 block break-all text-xs text-slate-500">{p.email}</span> : null}
        {p.phone ? <span className="block break-words text-xs text-slate-500">{p.phone}</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-3 pt-1 text-slate-400">
        {p.email ? <a href={`mailto:${p.email}`} aria-label={`Email ${p.name}`} className="hover:text-[#301D5D]"><Mail className="h-4 w-4" aria-hidden="true" /></a> : <Mail className="h-4 w-4 opacity-40" aria-hidden="true" />}
        {p.phone ? <a href={textLink} aria-label={`Text ${p.name}`} className="hover:text-[#301D5D]"><MessageSquare className="h-4 w-4" aria-hidden="true" /></a> : null}
        {p.phone ? <a href={`tel:${p.phone.replace(/[^+\d]/g, '')}`} aria-label={`Call ${p.name}`} className="hover:text-[#301D5D]"><Phone className="h-4 w-4" aria-hidden="true" /></a> : <Phone className="h-4 w-4 opacity-40" aria-hidden="true" />}
        {onRemove ? <button type="button" aria-label={`Remove ${p.name}`} className="hover:text-[#661102]" onClick={onRemove}><Trash2 className="h-4 w-4" aria-hidden="true" /></button> : null}
      </span>
    </div>
  );
}

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
  deadlines?: readonly { id: string; label: string; date: string }[];
  timelineFields?: ReactNode;
  alerts?: { emailEnabled: boolean; pushEnabled: boolean; reminderOffsets: readonly number[] };
  onOpenAlerts?: () => void;
  formatDate: (value: string) => string;
  countdownLabel: string;
  onUpdate: <K extends keyof AgentDeal>(key: K, value: AgentDeal[K]) => void;
  onExtendDeal?: (dealId: string) => void;
  onBack: () => void;
  onOpenView: (view: string) => void;
  /** Readiness Check items in, from the Readiness Check list itself. */
  readiness?: { done: number; total: number; groups: { label: string; done: number; total: number }[] };
  /** Readiness groups (Buyer, Seller, Lender and so on) shown inside Documents. rowExtra adds form actions to rows that mirror a checklist document. */
  onUploadOptionalFile?: (documentId: string, label: string, file: File | undefined) => void;
  uploadBusyId?: string | null;
  renderReadiness?: (rowExtra: (readinessDocId: string) => ReactNode, requiredIds: Set<string>) => ReactNode;
  /** Readiness item id to the Documents checklist item it mirrors. */
  readinessLinks?: Record<string, string>;
  section?: Tab;
  stripOnly?: boolean;
  trecForms?: readonly { formFamily: string; formNumber: string; title: string; total: number; filled: number; selected: boolean }[];
  onOpenTrecForm?: (formFamily: string) => void;
  onUploadTrecForm?: (formFamily: string, mode: 'file' | 'photo') => void;
  onToggleTrecForm?: (formFamily: string, selected: boolean) => void;
};


const DOC_DEADLINE_IDS: Record<string, string> = {
  'pd-executed-contract-receipt': 'earnest-money-delivery',
  'pd-third-party-financing': 'financing-deadline',
  'pd-third-party-financing-credit': 'financing-deadline',
  'pd-right-to-terminate': 'appraisal-deadline',
  'pd-new-survey': 'survey-due',
  'pd-existing-survey-t47': 'survey-due',
};

function dayDiff(today: string, date: string): number {
  return Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
}

function AutoSection({ className, header, children }: { className?: string; header: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let armed = false;
    let done = false;
    const io = new IntersectionObserver((entries) => {
      if (!armed || done) return;
      if (entries.some((entry) => entry.isIntersecting)) { setOpen(true); done = true; io.disconnect(); }
    }, { rootMargin: '0px 0px -25% 0px' });
    const arm = () => { armed = true; io.disconnect(); if (!done) io.observe(el); window.removeEventListener('scroll', arm, true); };
    io.observe(el);
    window.addEventListener('scroll', arm, true);
    return () => { io.disconnect(); window.removeEventListener('scroll', arm, true); };
  }, []);
  return (
    <div ref={ref} className={className}>
      <div role="button" tabIndex={0} aria-expanded={open} className={open ? 'cursor-pointer' : 'cursor-pointer [&>div]:!border-b-0'} onClick={() => setOpen((v) => !v)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v); } }}>{header}</div>
      <div hidden={!open}>{children}</div>
    </div>
  );
}

/** Opens the phone's own Messages app with the number and a short note filled in; the agent taps Send. */
function textHref(phone: string, name: string, address: string): string {
  const digits = phone.replace(/[^0-9+]/g, '');
  const first = name.trim().split(/\s+/)[0] || '';
  const body = `Hi${first ? ` ${first}` : ''}, this is about ${address || 'your transaction'}. `;
  return `sms:${digits}?&body=${encodeURIComponent(body)}`;
}

export default function DealSubpage({ onUploadOptionalFile, uploadBusyId, readiness, renderReadiness, readinessLinks, deal, today, locked, health, statusLabels, statuses, documentGroups, nextDeadline, deadlines, timelineFields, alerts, onOpenAlerts, formatDate, countdownLabel, onUpdate, onExtendDeal, onBack, onOpenView, section, stripOnly, trecForms, onOpenTrecForm, onUploadTrecForm, onToggleTrecForm }: Props) {
  const [tab, setTab] = useState<Tab>(section ?? 'history');
  const [stagesOpen, setStagesOpen] = useState(false);
  // Stages stay closed until opened by hand, then close again on their own after five minutes.
  useEffect(() => {
    if (!stagesOpen) return;
    const t = window.setTimeout(() => setStagesOpen(false), 5 * 60 * 1000);
    return () => window.clearTimeout(t);
  }, [stagesOpen]);
  const docFolders = dealFolders(deal);
  const requiredIdList = requiredIdsFor(docFolders);
  const [docSec, setDocSec] = useState('required');
  const [docSel, setDocSel] = useState('');
  const [docMOpen, setDocMOpen] = useState(false);
  const [arrangePage, setArrangePage] = useState<string | null>(null);
  const [pickedCard, setPickedCard] = useState<{ page: string; key: string } | null>(null);
  const cardKeys = (page: string, defaults: string[]) => {
    const saved = (deal?.contractFieldOrder?.[`page:${page}`] ?? []).filter((k) => defaults.includes(k));
    return [...saved, ...defaults.filter((k) => !saved.includes(k))];
  };
  const cardProps = (page: string, defaults: string[], key: string) => {
    const keys = cardKeys(page, defaults);
    const active = arrangePage === page;
    const picked = pickedCard?.page === page && pickedCard.key === key;
    return {
      style: { order: keys.indexOf(key) } as const,
      className: active ? `cursor-pointer rounded-xl ${picked ? 'ring-2 ring-[#301D5D]' : 'hover:ring-2 hover:ring-[#B9ADD6]'}` : '',
      onClickCapture: active ? (e: React.MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        if (!pickedCard || pickedCard.page !== page) { setPickedCard({ page, key }); return; }
        if (pickedCard.key !== key) {
          const next = [...keys];
          const a = next.indexOf(pickedCard.key); const b = next.indexOf(key);
          [next[a], next[b]] = [next[b], next[a]];
          onUpdate('contractFieldOrder', { ...(deal?.contractFieldOrder ?? {}), [`page:${page}`]: next });
        }
        setPickedCard(null);
      } : undefined,
    };
  };
  const [waitingOnSigner, setWaitingOnSigner] = useState(0);
  const [brokerageForms, setBrokerageForms] = useState<{ id: string; title: string; url: string; filename: string; fillable?: boolean }[]>([]);
  const signDealId = deal?.id;
  useEffect(() => {
    if (!signDealId || (stripOnly && !section)) return;
    let cancelled = false;
    fetch(`/api/closing-time/assist?dealId=${encodeURIComponent(signDealId)}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { signing?: { envelopes?: { status: string }[]; requests?: { status: string }[] } } | null) => {
        if (cancelled || !data?.signing) return;
        const sentEnvelopes = (data.signing.envelopes ?? []).filter((item) => item.status === 'sent').length;
        const sentRequests = (data.signing.requests ?? []).filter((item) => item.status === 'sent').length;
        setWaitingOnSigner(Math.max(sentEnvelopes, sentRequests));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [signDealId, stripOnly, section]);
  useEffect(() => {
    if (stripOnly && !section) return;
    let cancelled = false;
    fetch('/api/agent-command-center/forms-library', { cache: 'no-store' })
      .then((res) => res.json() as Promise<{ forms?: { id: string; section: string; title: string; url: string; filename: string; fillable?: boolean }[] }>)
      .then((data) => { if (!cancelled) setBrokerageForms((data.forms ?? []).filter((form) => form.section === 'brokerage')); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [stripOnly, section]);
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
  const [personErrors, setPersonErrors] = useState<{ name?: string; email?: string }>({});

  if (!deal) {
    return (
      <div className="ds-page">
        <button type="button" className="ds-back" onClick={onBack}><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Deals</button>
        <p className="mt-4 text-sm text-slate-500">That deal is no longer available.</p>
      </div>
    );
  }

  const clients = [deal.buyerNames, deal.sellerNames].filter(Boolean);
  const partyLines = (
    <>
      {deal.buyerNames && <span className="block"><span className="font-medium text-[#1B1726]">Buyer:</span> {deal.buyerNames}</span>}
      {deal.sellerNames && <span className="block"><span className="font-medium text-[#1B1726]">Seller:</span> {deal.sellerNames}</span>}
      {!clients.length && <span className="block">No clients added</span>}
    </>
  );
  const people = deal.clientContacts;
  const allPeople = dealPeople(deal);
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
  const requiredAllIn = requiredIdList.every((id) => deal.documentChecks[id]);
  const rawMilestones: { key: string; label: string; date: string; done: boolean }[] = [
    { key: 'contract', label: 'Under Contract', date: deal.effectiveDate, done: Boolean(deal.effectiveDate) && deal.effectiveDate <= today },
    { key: 'earnest', label: 'Earnest Money Received', date: deal.earnestMoneyDeliveredDate || addDays(deal.effectiveDate, 3), done: Boolean(deal.earnestMoneyDeliveredDate) },
    { key: 'inspection', label: 'Inspection Resolved', date: optionEnd, done: Boolean(optionEnd) && optionEnd <= today },
    { key: 'appraisal', label: 'Appraisal Complete', date: appraisalEnd, done: Boolean(appraisalEnd) && appraisalEnd <= today },
    { key: 'clear', label: 'Clear to Close', date: '', done: requiredAllIn },
    { key: 'prep', label: 'Closing Prep', date: '', done: completedDeal || (Boolean(deal.closingDate) && deal.closingDate <= today) },
    { key: 'closing', label: 'Closing', date: deal.closingDate, done: completedDeal || (Boolean(deal.closingDate) && deal.closingDate < today) },
    { key: 'wrap', label: 'File wrap-up', date: deal.closeoutDate, done: completedDeal },
  ];
  const firstOpen = rawMilestones.findIndex((m) => !m.done);
  const milestones = rawMilestones.map((m, index) => ({ ...m, current: index === firstOpen }));
  const openTasks = deal.tasks.filter((t) => !t.complete);
  const missingRequired = docFolders.flatMap((folder) => folder.docs).filter((doc) => doc.kind === 'required' && !deal.documentChecks[doc.id]);
  const price = deal.contractDetails?.salesPrice?.trim();
  const dayMs = 86400000;
  const daysFromToday = (iso: string) => Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / dayMs);
  const criticalDeadlines = [
    ...(deadlines ?? []).map((d) => ({ id: d.id, label: d.label, date: d.date })),
    ...(deal.closingDate ? [{ id: 'closing-date', label: 'Closing', date: deal.closingDate }] : []),
  ]
    .filter((d) => d.date && !(d.id === 'earnest-money-delivery' && deal.earnestMoneyDeliveredDate) && !deal.documentChecks[`dl:${d.id}`] && !completedDeal)
    .map((d) => ({ ...d, days: daysFromToday(d.date) }))
    .filter((d) => d.days <= 1)
    .sort((l, r) => l.days - r.days);
  const level: 'red' | 'amber' | null = criticalDeadlines.some((d) => d.days <= 0) ? 'red' : criticalDeadlines.length ? 'amber' : null;
  const isCritical = level !== null;
  const textTone = level === 'red' ? 'text-[#661102]' : 'text-[#645600]';
  const barTone = level === 'red' ? 'bg-[#FF2A04]' : 'bg-[#FAD800]';
  const sideBlocks = {
    property: (
<>
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
                  {uploading ? 'Uploading…' : dragOver ? 'Drop Image to Upload' : deal.photoUrl ? 'Drop a new image or click to replace' : 'Drop an image here or click to upload'}
                </button>
              )}
              <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { void uploadPhoto(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
            {photoError && <p className="px-4 pt-2 text-xs text-[#661102]" role="alert">{photoError}</p>}
            <div className="p-4">
              <p className="font-semibold text-slate-900">{deal.propertyAddress || deal.title}</p>
              <p className={`mt-1 text-xs ${isCritical ? `font-semibold ${textTone}` : 'text-slate-500'}`}>{deal.closingDate ? `Closing ${formatDate(deal.closingDate)} · ${countdownLabel}` : 'Closing Date Not Set'}</p>
              {!locked && <input aria-label="Photo URL" className={`${input} mt-3`} placeholder="Photo URL" value={deal.photoUrl} onChange={(e) => onUpdate('photoUrl', e.target.value)} />}
            </div>
          </div>
</>
    ),
    parties: (
<>
          <h3 className="ds-side-title">Parties</h3>
          <div className="ds-card ds-list">
            {allPeople.length === 0 && <p className="px-4 py-3 text-sm text-slate-500">No parties added.</p>}
            {allPeople.map((p) => <PartyLine key={`${p.role}-${p.name}`} p={p} textHref={textHref(p.phone, p.name, deal.propertyAddress || deal.title)} />)}
            <button type="button" onClick={() => onOpenView('d-people')} className="ds-list-row ds-link-row"><span className="min-w-0 flex-1 text-left text-xs text-slate-500">Manage People</span><ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" /></button>
          </div>
</>
    ),
    workspace: (
<>
          <h3 className="ds-side-title">Workspace</h3>
          <div className="ds-card ds-list">
            {([['transaction', 'Contract'], ['audit', 'Audit Trail']] as const).map(([view, label]) => (
              <button key={view} type="button" onClick={() => onOpenView(view)} className="ds-list-row ds-link-row"><span className="min-w-0 flex-1 text-left">{label}</span><ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" /></button>
            ))}
          </div>
</>
    ),
  };
  const snapCards: Partial<Record<SnapId, ReactNode>> = {
    next: (
              <div className="ds-card">
                <label className="ds-field-label" htmlFor="deal-next-action">Next Action</label>
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
  const stageIndex = firstOpen === -1 ? milestones.length : firstOpen;
  const stageName = firstOpen === -1 ? 'Complete' : milestones[firstOpen].label;
  const headerPeople = [deal.buyerNames, deal.sellerNames].filter(Boolean).join(' · ');
  const priceText = price ? (price.startsWith('$') ? price : `$${price}`) : '';
  const dueText = (days: number) => (days < 0 ? `${-days} ${-days === 1 ? 'day' : 'days'} overdue` : days === 0 ? 'due today' : days === 1 ? 'due tomorrow' : `due in ${days} days`);
  const autoClose = deal ? autoCloseState(deal, today) : null;
  const closeWarning = autoClose && autoClose.warn && !autoClose.due && deal ? (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#ffaf3d] bg-[#fff3e0] px-4 py-3" data-no-auto-open data-testid="auto-close-warning">
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-[#301D5D]">This Deal Closes Automatically On {formatCloseDate(autoClose.date)}</p>
        <p className="mt-1 text-[13px] text-[#4A4757]">
          {autoClose.hasClosingDate ? 'Deals close two weeks after the closing date.' : 'No closing date is entered, so this deal closes 180 days after it was opened.'}
          {' '}After that it becomes read-only and the whole file is saved to your document storage. If you have none connected, connect a free Google Drive or OneDrive account in Integrations first. Clear up the file before then{', or extend the deal.'}
        </p>
      </div>
      {!locked && onExtendDeal && (
        <button type="button" data-no-auto-open onClick={() => onExtendDeal(deal.id)} className="hover:!bg-[#EFEAF8] hover:!text-[#301D5D]">Extend {EXTENSION_DAYS} Days{autoClose.nextExtensionFree ? ' Free' : ' For $5'}</button>
      )}
    </div>
  ) : null;
  const pct = Math.round((Math.min(stageIndex, milestones.length) / milestones.length) * 100);
  const progressStrip = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1" data-testid="deal-header">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="ds-title !mt-0 min-w-0 sm:truncate">{deal.propertyAddress || deal.title || 'New Contract'}</h2>
            <span className="ds-chip bg-[#EFEAF8] text-[#301D5D] uppercase tracking-wide">{({ purchase: 'Residential', listing_sale: 'Listing For Sale', listing_lease: 'Listing For Lease', lease: 'Lease' } as Record<string, string>)[deal.dealType] ?? 'Residential'}</span>
          </div>
          <p className={`mt-1 text-[13px] font-medium ${isCritical ? textTone : 'text-[#4A4757]'}`}>
            {[headerPeople, priceText, deal.closingDate ? `Closing ${formatDate(deal.closingDate)} · ${countdownLabel}` : 'Closing Date Not Set'].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
      {isCritical && (
        <p className={`mt-1 text-[13px] font-semibold ${textTone}`} role="alert">
          {criticalDeadlines.slice(0, 2).map((d) => `${d.label} ${dueText(d.days)}`).join(' · ')}{criticalDeadlines.length > 2 ? ` · ${criticalDeadlines.length - 2} more` : ''}
        </p>
      )}
      <button
        type="button"
        data-no-auto-open
        onClick={() => setStagesOpen((v) => !v)}
        aria-expanded={stagesOpen}
        aria-label={`${stageName}, step ${Math.min(stageIndex + 1, milestones.length)} of ${milestones.length}. ${stagesOpen ? 'Hide' : 'Show'} stages`}
        className="mt-3 !flex !h-auto w-full !flex-col !items-stretch !gap-1.5 !rounded-none !border-0 !bg-transparent !p-0 text-left hover:!bg-transparent"
      >
        <span className="flex items-center justify-between gap-3 text-[12px] font-medium text-[#4A4757]">
          <span><span className="font-semibold text-[#1B1726]">{stageName}</span> · Step {Math.min(stageIndex + 1, milestones.length)} of {milestones.length}</span>
          <span className="flex items-center gap-1 text-[#6B6878]">{stagesOpen ? 'Hide Stages' : 'Show Stages'}<ChevronRight className={`h-3.5 w-3.5 transition-transform ${stagesOpen ? 'rotate-90' : ''}`} aria-hidden="true" /></span>
        </span>
        <span className="block h-1.5 overflow-hidden rounded-full bg-[#EFEAF8]" aria-hidden="true"><span className="block h-full rounded-full bg-[#301D5D]" style={{ width: `${Math.max(pct, 4)}%` }} /></span>
      </button>
      {stagesOpen && (
      <div className="mt-4 overflow-x-auto pb-1">
        <ol className="flex min-w-[560px] sm:min-w-[720px]" aria-label="Deal stages">
          {milestones.map((m, i) => (
            <li key={m.key} aria-current={m.current ? 'step' : undefined} className="relative flex-1 px-1 text-center">
              {i < milestones.length - 1 && <span aria-hidden="true" className={`absolute left-1/2 top-[9px] h-[2px] w-full ${m.done ? 'bg-[#301D5D]' : 'bg-[#E6E5EC]'}`} />}
              <span className={`relative z-[1] mx-auto mb-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 ${m.done ? 'border-[#301D5D] bg-[#301D5D]' : m.current ? 'border-[#301D5D] bg-[#EFEAF8]' : 'border-[#A9A5B8] bg-white'}`}>{m.done ? <Check className="h-3 w-3 text-white" strokeWidth={4} aria-hidden="true" /> : null}</span>
              <span className={`block text-[11px] leading-snug sm:text-[12px] ${m.current ? 'font-semibold text-[#1B1726]' : 'text-[#4A4757]'}`}>{m.label}</span>
              <span className="block min-h-[16px] text-[11px] text-[#6B6878]">{m.current ? 'Now' : m.date ? shortDate(m.date) : ''}</span>
            </li>
          ))}
        </ol>
      </div>
      )}
      {closeWarning}
    </>
  );
  if (stripOnly) return <div className="ds-page ds-strip" data-testid="deal-strip">{progressStrip}</div>;

  const renderSnapshotTop = () => {
    const allReq = docFolders.flatMap((folder) => folder.docs).filter((doc) => doc.kind === 'required' || deal.documentChecks[`add:${doc.id}`]);
    const trackedDeadlines = [
      ...(deadlines ?? []).map((item) => ({ id: item.id, label: item.label, date: item.date })),
      ...(deal.closingDate ? [{ id: 'closing-date', label: 'Closing Date', date: deal.closingDate }] : []),
    ].filter((item) => !['earnest-money-delivery', 'option-period-ends', 'closing-date'].includes(item.id)).sort((l, r) => l.date.localeCompare(r.date)).map((item) => ({ ...item, done: Boolean(deal.documentChecks[`dl:${item.id}`]) }));
    const alertChannels = alerts ? [alerts.emailEnabled ? 'Email' : '', alerts.pushEnabled ? 'Push' : ''].filter(Boolean) : [];
    const nextAlert = alerts && alertChannels.length
      ? trackedDeadlines.filter((item) => !item.done).flatMap((item) => alerts.reminderOffsets.map((offset) => ({ label: item.label, date: new Date(Date.parse(`${item.date}T12:00:00Z`) - offset * 86400000).toISOString().slice(0, 10) }))).filter((entry) => entry.date >= today).sort((l, r) => l.date.localeCompare(r.date))[0]
      : undefined;
    const tileBrokerage = brokerageForms.filter((form) => deal.documentChecks[`bf:${form.id}`]);
    const tileSubmitted = allReq.filter((doc) => deal.documentChecks[doc.id]).length + tileBrokerage.filter((form) => deal.documentChecks[`bfs:${form.id}`]).length;
    const tileStarted = allReq.filter((doc) => !deal.documentChecks[doc.id] && doc.formFamily && (trecForms ?? []).some((form) => form.formFamily === doc.formFamily && form.filled > 0)).length;
    const tileTotal = allReq.length + tileBrokerage.length;
    const tileNotStarted = Math.max(0, tileTotal - tileSubmitted - waitingOnSigner);
    const tilePct = tileTotal ? Math.round((tileSubmitted / tileTotal) * 100) : 0;
    const tile = (value: number, label: string) => (
      <div className="rounded-lg bg-[#F6F3FB] px-4 py-3">
        <p className="text-2xl font-semibold text-[#301D5D]">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    );
    return {
      tiles: (
        <>
      <div className="ds-card">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[15px] font-semibold text-[#1B1726]">Required Documents</p>
          <button type="button" onClick={() => onOpenView('d-documents')}>View All</button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {tile(tileSubmitted, 'Submitted')}
          {tile(waitingOnSigner, 'Waiting On Signer')}
          {tile(tileNotStarted, 'Not started')}
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#EFEAF8]" role="progressbar" aria-valuenow={tilePct} aria-valuemin={0} aria-valuemax={100} aria-label="Required documents submitted"><div className="h-full bg-[#301D5D]" style={{ width: `${tilePct}%` }} /></div>
        <p className="mt-2 text-xs text-slate-500">{tileSubmitted} of {tileTotal} submitted</p>
          <ul className="mt-4 space-y-3">
            {docFolders.map((folder) => {
              const total = folder.docs.length;
              const done = folder.docs.filter((d) => deal.documentChecks[d.id]).length;
              return (
                <li key={folder.id}>
                  <div className="flex items-center justify-between text-xs"><span className="text-slate-900">{folder.label}</span><span className="text-slate-500">{done}/{total}</span></div>
                  <div className="ds-bar mt-1" aria-hidden="true"><span style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} /></div>
                </li>
              );
            })}
          </ul>
      </div>
        </>
      ),
      pressing: (
        <>
      {(() => {
        const all = blankFieldAlerts(deal, trecForms ?? []);
        const ignoredIds = deal.ignoredBlankAlerts ?? [];
        const open = all.filter((a) => !ignoredIds.includes(a.id));
        const ignored = all.filter((a) => ignoredIds.includes(a.id));
        if (open.length === 0 && ignored.length === 0) return null;
        const tomorrow = (() => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
        const urgentDeadline = (deadlines ?? []).find((d) => !deal.documentChecks?.[`dl:${d.id}`] && d.date && d.date >= today && d.date <= tomorrow);
        const urgent = open.length > 0 && Boolean(urgentDeadline);
        return (
          <div className={urgent ? 'ds-card !border-[#301D5D]' : 'ds-card'} data-testid="blank-field-alerts" data-urgent={urgent ? 'true' : undefined}>
            <div className="flex flex-wrap items-baseline gap-2"><h3 className={urgent ? 'text-[15px] font-semibold text-[#301D5D]' : 'text-[15px] font-semibold text-[#1B1726]'}>{urgent ? 'Urgent: Review Blank Fields' : 'Blank Fields Need Your Attention'}</h3><Tip text={urgent && urgentDeadline ? `${urgentDeadline.label} is ${urgentDeadline.date === today ? 'today' : 'tomorrow'}. Review each item or ignore it if the blanks are intentional.` : open.length > 0 ? 'Review each item or ignore it if the blanks are intentional.' : 'Everything left is ignored.'} /><span className="text-[13px] text-[#6B6878]">{open.length} open</span></div>
            {open.length > 0 && (
              <>
                <ul className="mt-3 divide-y divide-[#E6E5EC]">
                  {open.slice(0, 3).map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2">
                    <span className="min-w-0 flex-1 basis-40 text-sm text-slate-900"><span className="block break-words font-medium">{a.label}</span><span className="block text-xs text-slate-500">{a.blank} of {a.total} blank</span></span>
                    <span className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => onOpenView(a.view)}>Review</button>
                      <button type="button" onClick={() => onUpdate('ignoredBlankAlerts', [...ignoredIds, a.id])}>Ignore</button>
                    </span>
                  </li>
                  ))}
                </ul>
                {open.length > 3 && (
                  <details data-no-auto-open className="group border-t border-[#E6E5EC]">
                    <summary className="cursor-pointer py-2 text-xs font-medium text-[#301D5D]"><span className="group-open:hidden">Show {open.length - 3} More</span><span className="hidden group-open:inline">Show Fewer</span></summary>
                    <ul className="divide-y divide-[#E6E5EC]">
                      {open.slice(3).map((a) => (
                        <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2">
                    <span className="min-w-0 flex-1 basis-40 text-sm text-slate-900"><span className="block break-words font-medium">{a.label}</span><span className="block text-xs text-slate-500">{a.blank} of {a.total} blank</span></span>
                    <span className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => onOpenView(a.view)}>Review</button>
                      <button type="button" onClick={() => onUpdate('ignoredBlankAlerts', [...ignoredIds, a.id])}>Ignore</button>
                    </span>
                  </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
            {ignored.length > 0 && (
              <details className="mt-3 border-t border-[#E6E5EC] pt-2">
                <summary className="cursor-pointer text-xs text-slate-500">{ignored.length} Ignored</summary>
                <ul className="mt-2">
                  {ignored.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-1">
                      <span className="min-w-0 truncate text-xs text-slate-600">{a.label} · {a.blank} Blank</span>
                      <button type="button" onClick={() => onUpdate('ignoredBlankAlerts', ignoredIds.filter((id) => id !== a.id))}>Restore</button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        );
      })()}
      <div className="ds-card !bg-[#EFEAF8]">
        <p className="text-[15px] font-semibold text-[#1B1726]">Key Deadlines</p>
        <Tip text="Enter the signed contract's effective date first. Deadline dates calculate from it using the contract terms and TREC timing rules." />
        {timelineFields}
        {trackedDeadlines.length > 0 && (
          <div className="mt-4 border-t border-[#E6E5EC] pt-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[15px] font-semibold text-[#1B1726]">Deadline Tracking</p>
              <span className="ds-chip bg-[#EFEAF8] text-[#301D5D]">{trackedDeadlines.filter((item) => item.done).length} Of {trackedDeadlines.length} Done</span>
            </div>
            <div className="grid sm:grid-cols-2 sm:gap-x-6">
            {trackedDeadlines.map((item) => {
              const diff = dayDiff(today, item.date);
              const chip = item.done ? { text: 'Done', cls: 'bg-[#EFEAF8] text-[#301D5D]' }
                : diff < 0 ? { text: `Overdue ${-diff} Day${diff === -1 ? '' : 's'}`, cls: 'bg-[#301D5D] text-white' }
                : diff === 0 ? { text: 'Due Today', cls: 'bg-[#EFEAF8] text-[#301D5D]' }
                : { text: `Due In ${diff} Day${diff === 1 ? '' : 's'}`, cls: diff <= 3 ? 'bg-[#EFEAF8] text-[#301D5D]' : 'bg-slate-100 text-slate-600' };
              return (
                <div key={item.id} className="ds-list-row">
                  <input type="checkbox" aria-label={`Mark ${item.label} done`} checked={item.done} disabled={locked} onChange={(e) => onUpdate('documentChecks', { ...deal.documentChecks, [`dl:${item.id}`]: e.target.checked })} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${item.done ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{item.label}</span>
                    <span className="block text-xs text-slate-500">{formatDate(item.date)}</span>
                  </span>
                  <span className={`ds-chip ${chip.cls}`}>{chip.text}</span>
                </div>
              );
            })}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#F6F3FB] px-3 py-3 text-xs text-slate-600">
              <span>
                {alertChannels.length === 0 ? 'Alerts Are Off' : `Alerts By ${alertChannels.join(' And ')}`}
                {alertChannels.length > 0 && alerts ? ` · ${[...alerts.reminderOffsets].sort((l, r) => r - l).map((o) => (o === 0 ? 'Due Today' : `${o}d`)).join(', ')}` : ''}
                {nextAlert ? ` · Next Alert ${formatDate(nextAlert.date)} (${nextAlert.label})` : ''}
              </span>
              {onOpenAlerts && <button type="button" onClick={onOpenAlerts}>Manage Alerts</button>}
            </div>
          </div>
        )}
      </div>
        </>
      ),
    };
  };

  const tabs: [Tab, string][] = [['history', 'History']];

  if ((section as string | undefined) === 'overview') {
    const snapshotTop = renderSnapshotTop();
    const doneTasks = deal.tasks.length - openTasks.length;
    const overdueTasks = openTasks.filter((t) => t.dueDate && t.dueDate < today).length;
    const weekEnd = new Date(Date.parse(`${today}T12:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
    const dueSoon = openTasks.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd).length;
    const upcoming = [...openTasks].sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')).slice(0, 6);
    const openReminders = (deal.reminders ?? []).filter((r) => !r.complete);
    const tasksTotal = deal.tasks.length + (deal.reminders ?? []).length;
    const tasksOpen = openTasks.length + openReminders.length;
    const tasksDone = tasksTotal - tasksOpen;
    const tasksOverdue = overdueTasks + openReminders.filter((r) => r.reminderDate && r.reminderDate < today).length;
    const tasksSoon = dueSoon + openReminders.filter((r) => r.reminderDate && r.reminderDate >= today && r.reminderDate <= weekEnd).length;
    const tasksPct = tasksTotal ? Math.round((tasksDone / tasksTotal) * 100) : 0;
    const taskTile = (value: number, label: string) => (
      <div className="rounded-lg bg-[#F6F3FB] px-4 py-3">
        <p className="text-2xl font-semibold text-[#301D5D]">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    );
    const tasksCard = (
      <div className="ds-card">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[15px] font-semibold text-[#1B1726]">Tasks &amp; Reminders</p>
          <button type="button" onClick={() => onOpenView('tasks')}>View All</button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {taskTile(tasksOpen, 'Open')}
          {taskTile(tasksOverdue, 'Overdue')}
          {taskTile(tasksSoon, 'Due In 7 Days')}
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#EFEAF8]" role="progressbar" aria-valuenow={tasksPct} aria-valuemin={0} aria-valuemax={100} aria-label="Tasks and reminders completed"><div className="h-full bg-[#301D5D]" style={{ width: `${tasksPct}%` }} /></div>
        <p className="mt-2 text-xs text-slate-500">{tasksDone} of {tasksTotal} complete</p>
      </div>
    );
    const pct = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0);
    const reqDone = requiredIdList.filter((id) => deal.documentChecks[id]).length;
    const stat = (label: string, value: string, tone?: string) => (
      <div className="min-w-0"><p className="ds-eyebrow">{label}</p><p className={`mt-1 text-xl font-semibold ${tone ?? 'text-slate-900'}`}>{value}</p></div>
    );
    const clientsList = allPeople.filter((p) => p.kind === 'client');
    const othersList = allPeople.filter((p) => p.kind !== 'client');
    const partyRow = (p: PartyView) => <PartyLine key={`${p.role}-${p.name}`} p={p} textHref={textHref(p.phone, p.name, deal.propertyAddress || deal.title)} />;
    const partiesCard = (
      <div className="ds-card self-start">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[15px] font-semibold text-[#1B1726]">Parties</p>
          <button type="button" onClick={() => onOpenView('d-people')}>Add</button>
        </div>
        <div className="mt-3">
          {clientsList.length === 0 ? <p className="text-xs text-slate-500">No parties added.</p> : clientsList.map(partyRow)}
        </div>
        {othersList.length > 0 && <p className="ds-eyebrow mt-3 border-t border-[#F6F3FB] pt-3">External Parties</p>}
        {othersList.length > 0 && <div className="mt-1">{othersList.map(partyRow)}</div>}
      </div>
    );
    return (
      <div className="ds-page" data-testid="deal-snapshot">
        <div className="mb-4 space-y-4">
          {snapshotTop.pressing}
          <div className="grid items-start gap-4 lg:grid-cols-4">
            {(() => { const p = cardProps('snapshot', ['docs', 'parties', 'property', 'tasks'], 'docs'); const r = readiness; const pctDone = r && r.total ? Math.round((r.done / r.total) * 100) : 0; return (
              <div style={p.style} onClickCapture={p.onClickCapture} className={`min-w-0 lg:col-span-2 ${p.className}`}>
                <div className="ds-card">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[15px] font-semibold text-[#1B1726]">Readiness</p>
                    <button type="button" onClick={() => onOpenView('d-documents')}>Open Documents</button>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{r ? `${r.done} of ${r.total} items in` : 'No readiness items yet.'}</p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#EFEAF8]" role="progressbar" aria-valuenow={pctDone} aria-valuemin={0} aria-valuemax={100} aria-label="Readiness progress"><div className="h-full rounded-full bg-[#301D5D]" style={{ width: `${pctDone}%` }} /></div>
                  {r ? (
                    <ul className="mt-4 space-y-2">
                      {r.groups.map((g) => (
                        <li key={g.label} className="flex items-center justify-between gap-3 text-xs"><span className="min-w-0 truncate text-slate-900">{g.label}</span><span className={`font-medium ${g.done === g.total && g.total > 0 ? 'text-[#005A00]' : 'text-[#301D5D]'}`}>{g.done}/{g.total}</span></li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            ); })()}
            {(() => { const p = cardProps('snapshot', ['docs', 'parties', 'property', 'tasks'], 'parties'); return <div style={p.style} onClickCapture={p.onClickCapture} className={`min-w-0 lg:col-span-2 ${p.className}`}>{partiesCard}</div>; })()}
            {(() => { const p = cardProps('snapshot', ['docs', 'parties', 'property', 'tasks'], 'property'); return <div style={p.style} onClickCapture={p.onClickCapture} className={`min-w-0 lg:col-span-2 ${p.className}`}>{sideBlocks.property}</div>; })()}
            {(() => { const p = cardProps('snapshot', ['docs', 'parties', 'property', 'tasks'], 'tasks'); return <div style={p.style} onClickCapture={p.onClickCapture} className={`min-w-0 lg:col-span-2 ${p.className}`}>{tasksCard}</div>; })()}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ds-page" data-testid="deal-subpage">
      {!section && (<>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2"><nav aria-label="Breadcrumb" className="min-w-0 max-w-full"><ol className="flex flex-nowrap items-center gap-1 text-[14px] leading-5"><li className="leading-5"><button type="button" className="ds-back !m-0 !h-auto !min-h-0 !p-0 !text-[14px] leading-5" onClick={onBack}>Deals</button></li><li className="flex min-w-0 items-center gap-1 leading-5"><ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#7A7787]" aria-hidden="true" /><span aria-current="page" className="truncate text-[14px] font-medium leading-5 text-[#1B1726]">{deal.propertyAddress || deal.title || 'Deal'}</span></li></ol></nav><span className={`ds-chip ${health.tone}`}><StatusSymbol label={health.label} />{health.label}</span></div>

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
            <p className="ds-subtitle">{partyLines}{deal.owner && <span className="block">{deal.owner}</span>}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`ds-chip ${health.tone}`}><StatusSymbol label={health.label} />{health.label}</span>
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
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E6E5EC] pb-3">
            <p className="text-[15px] font-semibold text-[#1B1726]">Deal File</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="hover:!bg-[#EFEAF8] hover:!text-[#301D5D]" onClick={() => void downloadDealFilePdf(buildDealFile(deal, deadlines ?? [], health.label, stageName))}>Download PDF</button>
              <button type="button" className="hover:!bg-[#EFEAF8] hover:!text-[#301D5D]" onClick={() => printDealFile(buildDealFile(deal, deadlines ?? [], health.label, stageName))}>Print</button>
              <button type="button" className="hover:!bg-[#EFEAF8] hover:!text-[#301D5D]" onClick={() => onOpenView('transaction')}>Edit Contract</button>
            </div>
          </div>
          )}

          {tab === 'overview' && (() => {
            const yourSide = allPeople.filter((p) => p.kind === 'client');
            const external = allPeople.filter((p) => p.kind !== 'client');
            const soon = nextDeadline && nextDeadline.date <= new Date(Date.parse(`${today}T12:00:00Z`) + 3 * 86400000).toISOString().slice(0, 10);
            const attentionRows: { key: string; eyebrow: string; title: string; detail: string; tone: 'red' | 'amber'; go: string }[] = [
              ...openTasks.filter((t) => t.dueDate && t.dueDate <= today).map((t) => ({ key: t.id, eyebrow: 'Task', title: t.title, detail: t.dueDate < today ? `Overdue · ${formatDate(t.dueDate)}` : 'Due today', tone: (t.dueDate < today ? 'red' : 'amber') as 'red' | 'amber', go: 'tasks' })),
              ...(nextDeadline && soon ? [{ key: 'deadline', eyebrow: 'Deadline', title: nextDeadline.label, detail: nextDeadline.date <= today ? (nextDeadline.date < today ? `Past due · ${formatDate(nextDeadline.date)}` : 'Due today') : `Due ${formatDate(nextDeadline.date)}`, tone: (nextDeadline.date <= today ? 'red' : 'amber') as 'red' | 'amber', go: 'transaction' }] : []),
            ];
            const waitingRows = [
              ...openTasks.filter((t) => !t.dueDate || t.dueDate > today).map((t) => ({ key: t.id, chip: 'Task', title: t.title, detail: t.dueDate ? `Due ${formatDate(t.dueDate)}` : 'No due date', go: 'tasks' })),
              ...missingRequired.map((doc) => ({ key: doc.id, chip: 'Document', title: doc.label, detail: 'Required document', go: 'd-documents' })),
            ];
            const requiredDone = requiredIdList.filter((id) => deal.documentChecks[id]).length;
            const handling = [
              { key: 'readiness', title: 'Document readiness', detail: readiness ? `${readiness.done} of ${readiness.total} readiness items in` : `${requiredDone} of ${requiredIdList.length} required documents in`, chip: (readiness ? readiness.done === readiness.total : requiredDone === requiredIdList.length) ? 'Complete' : 'In progress', go: 'd-documents' },
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
            const partyRow = (p: PartyView) => <PartyLine key={`${p.role}-${p.name}`} p={p} textHref={textHref(p.phone, p.name, deal.propertyAddress || deal.title)} />;
            return (
              <div className="space-y-4">
                <div className="ds-snap-grid">
                  <div className="ds-card !p-0 self-start">
                    {cardHead(<AlertCircle className="h-4 w-4 text-[#645600]" aria-hidden="true" />, 'Needs Your Attention', attentionRows.length, 'bg-[#FEF8CC] text-[#645600]')}
                    {attentionRows.length === 0 ? <p className="px-4 py-4 text-xs text-slate-500">Nothing needs you right now.</p> : attentionRows.map((item) => (
                      <div key={item.key} className="border-b border-[#F6F3FB] px-4 py-3">
                        <p className={`text-[11px] font-medium ${item.tone === 'red' ? 'text-[#661102]' : 'text-[#645600]'}`}>{item.eyebrow}</p>
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
                          {item.key === 'readiness' && readiness ? (
                            <>
                              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[#EFEAF8]" aria-hidden="true"><span className="block h-full rounded-full bg-[#301D5D]" style={{ width: `${readiness.total ? Math.round((readiness.done / readiness.total) * 100) : 0}%` }} /></span>
                              <span className="mt-2 block space-y-1">
                                {readiness.groups.map((g) => (
                                  <span key={g.label} className="flex items-center justify-between gap-3 text-xs"><span className="truncate opacity-70">{g.label}</span><span className={`font-medium ${g.done === g.total && g.total > 0 ? 'text-[#005A00]' : 'text-[#301D5D]'}`}>{g.done}/{g.total}</span></span>
                                ))}
                              </span>
                            </>
                          ) : null}
                        </span>
                        <span className="ds-chip bg-[#EFEAF8] text-[#301D5D]">{item.chip}</span>
                      </button>
                    ))}
                  </div>
                  <div className="ds-card !p-0 self-start">
                    {cardHead(<Clock className="h-4 w-4 text-[#7059A8]" aria-hidden="true" />, 'Waiting On Others', waitingRows.length, 'bg-[#EFEAF8] text-[#301D5D]')}
                    {waitingRows.length === 0 ? <p className="px-4 py-4 text-xs text-slate-500">Nothing is pending.</p> : waitingRows.slice(0, 5).map((item) => (
                      <button key={item.key} type="button" onClick={() => onOpenView(item.go)} className="ds-snap-row">
                        <span className="min-w-0 flex-1 text-left">
                          <span className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{item.title}</span><span className="rounded bg-[#EFEAF8] px-2 py-0.5 text-[11px] font-medium text-[#301D5D]">{item.chip}</span></span>
                          <span className="block text-xs opacity-70">{item.detail}</span>
                        </span>
                      </button>
                    ))}
                    {footLink(waitingRows.length > 5 ? `View all ${waitingRows.length}` : 'View Documents', 'd-documents')}
                  </div>
                  <div className="ds-card !p-0 self-start">
                    <div className="flex items-center justify-between border-b border-[#E6E5EC] px-4 py-3">
                      <p className="text-[15px] font-semibold text-[#1B1726]">Parties</p>
                      <button type="button" onClick={() => onOpenView('d-people')}><Plus className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Add</button>
                    </div>
                    <p className="ds-eyebrow px-4 pt-3">Your Side</p>
                    {yourSide.length === 0 ? <p className="px-4 py-3 text-xs text-slate-500">No parties added.</p> : yourSide.map(partyRow)}
                    {external.length > 0 && <p className="ds-eyebrow px-4 pt-3">External Parties</p>}
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
            const allDocs = docFolders.flatMap((folder) => folder.docs);
            const isAdded = (id: string) => Boolean(checks[`add:${id}`]);
            const requiredDocs = allDocs.filter((doc) => doc.kind === 'required' || isAdded(doc.id));
            const optionalDocs = allDocs.filter((doc) => doc.kind !== 'required' && !isAdded(doc.id) && !(renderReadiness && Object.values(readinessLinks ?? {}).includes(doc.id)));
            // Documents that also appear in the readiness groups are tracked there, so they are not listed twice.
            const mirrored = new Set(renderReadiness ? Object.values(readinessLinks ?? {}) : []);
            const requiredShown = requiredDocs.filter((doc) => !mirrored.has(doc.id));
            const requiredIds = new Set(requiredDocs.map((doc) => doc.id));
            const brokerageDocs = brokerageForms.filter((form) => checks[`bf:${form.id}`]);
            const totalRequired = requiredDocs.length + brokerageDocs.length;
            const submittedCount = requiredDocs.filter((doc) => checks[doc.id]).length + brokerageDocs.filter((form) => checks[`bfs:${form.id}`]).length;
            const usedFamilies = new Set(requiredDocs.flatMap((doc) => (doc.formFamily ? [doc.formFamily] : [])));
            const dealForms = (trecForms ?? []).filter((form) => form.selected && !usedFamilies.has(form.formFamily));
            const formInfo = (family: string | undefined) => (family ? (trecForms ?? []).find((form) => form.formFamily === family) : undefined);
            const dealTypeLabel = ({ purchase: 'Residential Purchase', listing_sale: 'Listing For Sale', listing_lease: 'Listing For Lease', lease: 'Lease' } as Record<string, string>)[deal.dealType] ?? 'Deal';
            const dueFor = (docId: string): { label: string; date: string } | null => {
              if (docId === 'pd-closing-statement' || docId === 'pd-walkthrough') return deal.closingDate && !checks['dl:closing-date'] ? { label: 'Closing', date: deal.closingDate } : null;
              const id = DOC_DEADLINE_IDS[docId];
              if (id && checks[`dl:${id}`]) return null;
              const match = id ? (deadlines ?? []).find((item) => item.id === id) : undefined;
              return match ? { label: match.label.replace(/\b([a-z])/g, (c) => c.toUpperCase()), date: match.date } : null;
            };
            const statusChip = (done: boolean, docId?: string) => {
              if (done) return <span className="ds-chip bg-[#EFEAF8] text-[#301D5D]">Submitted</span>;
              const due = docId ? dueFor(docId) : null;
              if (!due) return <span className="ds-chip bg-slate-100 text-slate-600">Not Submitted</span>;
              const diff = dayDiff(today, due.date);
              const text = diff < 0 ? `Overdue ${-diff} day${diff === -1 ? '' : 's'}` : diff === 0 ? 'Due today' : `Due in ${diff} day${diff === 1 ? '' : 's'}`;
              return <span title={`${due.label} · ${formatDate(due.date)}`} className={`ds-chip ${diff < 0 ? 'bg-[#301D5D] text-white' : diff <= 3 ? 'bg-[#EFEAF8] text-[#301D5D]' : 'bg-slate-100 text-slate-600'}`}>{text}</span>;
            };
            const formStatus = (form: { total: number; filled: number }) => (form.total > 0 ? (form.filled > 0 ? `Fillable · ${form.filled} of ${form.total}` : `Fillable · ${form.total} fields`) : 'Notice · nothing to fill');
            const requiredRow = (doc: (typeof allDocs)[number]) => {
              const form = formInfo(doc.formFamily);
              const addedOptional = doc.kind !== 'required';
              return (
                <div key={doc.id} className="ds-list-row">
                  <input type="checkbox" aria-label={`Mark ${doc.label} submitted`} checked={Boolean(checks[doc.id])} disabled={locked} onChange={(e) => onUpdate('documentChecks', { ...checks, [doc.id]: e.target.checked })} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-900">{doc.label}</span>
                    {(addedOptional || (!checks[doc.id] && dueFor(doc.id))) && <span className="block text-xs text-slate-500">{[addedOptional ? 'Added From Optional' : '', !checks[doc.id] && dueFor(doc.id) ? `${dueFor(doc.id)!.label} ${formatDate(dueFor(doc.id)!.date)}` : ''].filter(Boolean).join(' · ')}</span>}
                  </span>
                  {form && <span className="ds-chip bg-[#EFEAF8] text-[#301D5D]">{formStatus(form)}</span>}
                  {statusChip(Boolean(checks[doc.id]), doc.id)}
                  {form && <TrecFormActions family={form.formFamily} disabled={locked} onOpen={(family) => onOpenTrecForm?.(family)} onUpload={(family, mode) => onUploadTrecForm?.(family, mode)} />}
                  {addedOptional && !locked && <button type="button" aria-label={`Move ${doc.label} back to optional`} className="text-xs text-slate-500 underline underline-offset-2 hover:text-slate-900" onClick={() => { const next = { ...checks }; delete next[`add:${doc.id}`]; delete next[doc.id]; onUpdate('documentChecks', next); }}>Remove</button>}
                </div>
              );
            };
            return (
              <div className="flex flex-col gap-4">
                {renderReadiness && <div className="min-w-0" style={{ order: -1 }}>{renderReadiness((readinessId) => {
                  const checklistId = readinessLinks?.[readinessId];
                  const doc = checklistId ? allDocs.find((d) => d.id === checklistId) : undefined;
                  if (!doc) return null;
                  const form = formInfo(doc.formFamily);
                  const due = !checks[doc.id] ? dueFor(doc.id) : null;
                  if (!form && !due) return null;
                  return (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {form && <span className="ds-chip bg-[#EFEAF8] text-[#301D5D]">{formStatus(form)}</span>}
                      {form && <TrecFormActions family={form.formFamily} disabled={locked} onOpen={(family) => onOpenTrecForm?.(family)} onUpload={(family, mode) => onUploadTrecForm?.(family, mode)} />}
                      {due && <span className="text-xs text-slate-500">{`${due.label} ${formatDate(due.date)}`}</span>}
                    </div>
                  );
                }, new Set(Object.entries(readinessLinks ?? {}).filter(([, cid]) => { const d = allDocs.find((x) => x.id === cid); return Boolean(d && (d.kind === 'required' || isAdded(d.id))); }).map(([rid]) => rid)))}</div>}
                {(() => {
                  const lab = 'text-[11px] font-medium uppercase tracking-[0.08em] text-[#6B6878]';
                  const linked = [
                    ...Array.from(new Set(Object.values(DOC_DEADLINE_IDS))).map((id) => {
                      const match = (deadlines ?? []).find((item) => item.id === id);
                      return match ? { id, label: match.label, date: match.date, docs: Object.keys(DOC_DEADLINE_IDS).filter((key) => DOC_DEADLINE_IDS[key] === id) } : null;
                    }),
                    deal.closingDate ? { id: 'closing-date', label: 'Closing Date', date: deal.closingDate, docs: ['pd-walkthrough', 'pd-closing-statement'] } : null,
                  ].filter((item): item is { id: string; label: string; date: string; docs: string[] } => Boolean(item)).sort((l, r) => l.date.localeCompare(r.date));
                  const checkField = (label: string, checked: boolean, onChange: (v: boolean) => void) => (
                    <label className="flex items-center gap-2 text-sm font-medium text-[#1B1726]"><input type="checkbox" checked={checked} disabled={locked} onChange={(e) => onChange(e.target.checked)} />{label}</label>
                  );
                  type Item = { id: string; title: string; sub: string; done: boolean; detail: ReactNode };
                  const formBlock = (family: string | undefined) => {
                    const form = formInfo(family);
                    if (!form) return null;
                    return (
                      <div>
                        <span className={lab}>Form</span>
                        <div className="mt-1 flex flex-wrap items-center gap-2"><span className="ds-chip bg-[#EFEAF8] text-[#301D5D]">{formStatus(form)}</span><TrecFormActions family={form.formFamily} disabled={locked} onOpen={(f) => onOpenTrecForm?.(f)} onUpload={(f, mode) => onUploadTrecForm?.(f, mode)} /></div>
                      </div>
                    );
                  };
                  const sections: { id: string; label: string; items: Item[]; empty: string }[] = [
                    {
                      id: 'required', label: 'Required', empty: 'No other required documents.',
                      items: [
                        ...requiredShown.map((doc): Item => {
                          const addedOptional = doc.kind !== 'required';
                          const due = !checks[doc.id] ? dueFor(doc.id) : null;
                          return {
                            id: `r:${doc.id}`, title: doc.label, done: Boolean(checks[doc.id]),
                            sub: [checks[doc.id] ? 'Submitted' : 'Not Submitted', due ? `${due.label} ${formatDate(due.date)}` : '', addedOptional ? 'Added From Optional' : ''].filter(Boolean).join(' · '),
                            detail: (<>
                              {checkField('Submitted', Boolean(checks[doc.id]), (v) => onUpdate('documentChecks', { ...checks, [doc.id]: v }))}
                              {due && <div><span className={lab}>Due</span><p className="mt-1 text-sm text-[#4A4757]">{`${due.label} ${formatDate(due.date)}`}</p></div>}
                              {formBlock(doc.formFamily)}
                              {addedOptional && !locked && <button type="button" onClick={() => { const next = { ...checks }; delete next[`add:${doc.id}`]; delete next[doc.id]; onUpdate('documentChecks', next); }}>Move Back To Optional</button>}
                            </>),
                          };
                        }),
                        ...brokerageDocs.map((form): Item => ({
                          id: `b:${form.id}`, title: form.title, done: Boolean(checks[`bfs:${form.id}`]),
                          sub: `Brokerage Form · ${checks[`bfs:${form.id}`] ? 'Submitted' : 'Not Submitted'}`,
                          detail: (<>
                            {checkField('Submitted', Boolean(checks[`bfs:${form.id}`]), (v) => onUpdate('documentChecks', { ...checks, [`bfs:${form.id}`]: v }))}
                            <div className="flex flex-wrap gap-2">
                              <a href={form.fillable ? `/agents/closing-time?form=${encodeURIComponent(`custom-${form.id}`)}#trec-form-workspace` : form.url} target={form.fillable ? undefined : '_blank'} rel="noreferrer" className="ds-row-btn">Open</a>
                              {!locked && <button type="button" onClick={() => { const next = { ...checks }; delete next[`bf:${form.id}`]; delete next[`bfs:${form.id}`]; onUpdate('documentChecks', next); }}>Remove From Deal</button>}
                            </div>
                          </>),
                        })),
                      ],
                    },
                    ...(linked.length ? [{
                      id: 'deadlines', label: 'Deadlines', empty: '',
                      items: linked.map((item): Item => {
                        const done = Boolean(checks[`dl:${item.id}`]);
                        const diff = dayDiff(today, item.date);
                        const status = done ? 'Done' : diff < 0 ? `Overdue ${-diff} Day${diff === -1 ? '' : 's'}` : diff === 0 ? 'Due Today' : `Due In ${diff} Day${diff === 1 ? '' : 's'}`;
                        const docLabels = allDocs.filter((doc) => item.docs.includes(doc.id) && (doc.kind === 'required' || isAdded(doc.id))).map((doc) => doc.label);
                        return {
                          id: `d:${item.id}`, title: item.label, done, sub: `${formatDate(item.date)} · ${status}`,
                          detail: (<>
                            {checkField('Done', done, (v) => onUpdate('documentChecks', { ...checks, [`dl:${item.id}`]: v }))}
                            <div><span className={lab}>Date</span><p className="mt-1 text-sm text-[#4A4757]">{`${formatDate(item.date)} · ${status}`}</p></div>
                            {docLabels.length > 0 && <div><span className={lab}>Related Documents</span><ul className="mt-1 space-y-0.5 text-sm text-[#4A4757]">{docLabels.map((l) => <li key={l}>{l}</li>)}</ul></div>}
                          </>),
                        };
                      }),
                    }] : []),
                    ...(trecForms ? [{
                      id: 'forms', label: 'Additional', empty: 'No additional documents added. Add forms this deal needs from the Forms Library.',
                      items: dealForms.map((form): Item => ({
                        id: `f:${form.formFamily}`, title: `${form.formNumber} · ${form.title}`, done: false, sub: formStatus(form),
                        detail: (<>
                          {formBlock(form.formFamily)}
                          <button type="button" onClick={() => onOpenTrecForm?.(form.formFamily)}>Open Form</button>
                        </>),
                      })),
                    }] : []),
                    {
                      id: 'optional', label: 'Optional', empty: 'Every optional document has been added.',
                      items: optionalDocs.map((doc): Item => ({
                        id: `o:${doc.id}`, title: doc.label, done: false, sub: doc.kind === 'reference' ? 'Reference' : 'Optional',
                        detail: (<>
                          {(() => { const existing = deal.documents.find((d) => d.id === doc.id); const busy = uploadBusyId === doc.id; return (<>
                            <div>
                              <span className={lab}>File</span>
                              {existing?.driveFileId ? <p className="mt-1 truncate text-sm text-[#005A00]">{existing.fileName || 'File Attached'}</p> : <p className="mt-1 text-[13px] text-[#6B6878]">No file attached.</p>}
                            </div>
                            <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-[#E6E5EC] bg-white px-3 text-[13px] font-medium text-[#301D5D] hover:bg-[#EFEAF8]">
                              {busy ? 'Uploading…' : existing?.driveFileId ? 'Replace File' : 'Upload File'}
                              <input type="file" className="hidden" disabled={locked || busy} aria-label={`Upload file for ${doc.label}`} onChange={(e) => { onUploadOptionalFile?.(doc.id, doc.label, e.target.files?.[0]); e.target.value = ''; }} />
                            </label>
                          </>); })()}
                        </>),
                      })),
                    },
                  ];
                  const visibleSections = sections.filter((x) => x.id === 'optional' || (x.id === 'required' && x.items.length > 0));
                  const section = visibleSections.find((x) => x.id === docSec) ?? visibleSections[0];
                  const selected = section.items.find((x) => x.id === docSel) ?? section.items[0];
                  return (
                    <div className="ds-card overflow-hidden !p-0" data-testid="more-documents">
                      <div className="flex items-center justify-between gap-2 border-b border-[#E6E5EC] px-4 py-3 text-sm font-semibold text-slate-900">
                        <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-[#7059A8]" aria-hidden="true" />{visibleSections.length > 1 ? 'More Documents' : 'Optional Documents'}</span>
                        <span className="text-xs font-medium text-slate-500">{submittedCount} of {totalRequired} Submitted</span>
                      </div>
                      {visibleSections.length > 1 && (
                        <div className="flex gap-1 overflow-x-auto border-b border-[#E6E5EC] px-2" role="tablist">
                          {visibleSections.map((x) => (
                            <button key={x.id} type="button" role="tab" aria-selected={section.id === x.id} onClick={() => setDocSec(x.id)} className={`!h-auto !rounded-none !border-0 !border-b-2 !bg-transparent !px-3 !py-2.5 text-sm whitespace-nowrap ${section.id === x.id ? '!border-[#301D5D] font-semibold !text-[#301D5D]' : '!border-transparent !text-[#4A4757]'}`}>{x.label}<span className="ml-1.5 text-xs text-[#6B6878]">{x.items.length}</span></button>
                          ))}
                        </div>
                      )}
                      {section.items.length === 0 ? <p className="px-4 py-4 text-sm text-[#6B6878]">{section.empty}</p> : (
                        <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_340px]">
                          <div className={`min-w-0 border-b border-[#E6E5EC] lg:border-b-0 ${docMOpen ? 'max-lg:hidden' : ''}`}>
                            {section.items.map((item) => (
                              <button key={item.id} type="button" onClick={() => { setDocSel(item.id); setDocMOpen(true); window.requestAnimationFrame(() => document.getElementById('more-doc-detail-panel')?.scrollIntoView({ block: 'start' })); }} aria-current={selected?.id === item.id ? 'true' : undefined} className={`!flex !h-auto w-full !items-center !justify-start !gap-3 !rounded-none !border-0 !border-t !border-[#E6E5EC] !px-4 !py-3 text-left first:!border-t-0 ${selected?.id === item.id ? '!bg-[#EFEAF8]' : '!bg-white hover:!bg-[#F6F3FB]'}`}>
                                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.done ? '#00e200' : '#ffaf3d' }} aria-hidden="true" />
                                <span className="min-w-0 flex-1">
                                  <span className="block lg:truncate text-sm font-semibold text-[#1B1726]">{item.title}</span>
                                  <span className="block lg:truncate text-[12px] font-normal text-[#6B6878]">{item.sub}</span>
                                </span>
                                {section.id === 'required' ? <span className="ds-chip shrink-0 bg-[#EFEAF8] text-[#301D5D]">Required</span> : null}
                              </button>
                            ))}
                          </div>
                          <div id="more-doc-detail-panel" className={`min-w-0 scroll-mt-4 space-y-4 p-4 lg:border-l lg:border-[#E6E5EC] ${docMOpen ? '' : 'max-lg:hidden'}`} data-testid="more-documents-detail"><button type="button" onClick={() => setDocMOpen(false)} className="mb-3 !inline-flex !h-9 !flex-row !items-center !gap-1 !px-2 lg:!hidden"><ChevronLeft className="h-4 w-4" aria-hidden="true" />Back To Documents</button>
                            {selected && (<><div><p className={lab}>Selected</p><h4 className="mt-1 text-[15px] font-semibold leading-snug text-[#1B1726]">{selected.title}</h4></div>{selected.detail}</>)}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {deal && <DocumentRequestsCard deal={deal} locked={locked} documentGroups={documentGroups} onUpdate={onUpdate} />}
                {deal && <ClientUploadsCard dealId={deal.id} version={deal.updatedAt} />}
              </div>
            );
          })()}

          {tab === 'people' && (
            <div className="space-y-6">
              <section>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[15px] font-semibold text-[#1B1726]">Deal People</h3>
                  {!locked && <button type="button" className={btnPrimary} onClick={() => setShowPersonForm((v) => !v)}><Plus className="h-4 w-4" aria-hidden="true" /> Add People</button>}
                </div>
                {showPersonForm && (
                  <form noValidate className="ds-card mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
                    e.preventDefault();
                    const data = new FormData(e.currentTarget);
                    const name = String(data.get('name') ?? '').trim();
                    const emailVal = String(data.get('email') ?? '').trim();
                    const errs: { name?: string; email?: string } = {};
                    if (!name) errs.name = 'Enter A Name.';
                    if (emailVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) errs.email = 'Enter A Valid Email, Like name@example.com.';
                    setPersonErrors(errs);
                    if (errs.name || errs.email) return;
                    onUpdate('clientContacts', [...people, { id: newId('person'), name, role: String(data.get('role') ?? ''), email: String(data.get('email') ?? ''), phone: String(data.get('phone') ?? '') }].slice(0, 20));
                    e.currentTarget.reset();
                    setPersonErrors({});
                    setShowPersonForm(false);
                  }}>
                    <label className="block min-w-0"><span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-[#6B6878]">Name</span><input name="name" required placeholder="Full Name" aria-invalid={personErrors.name ? true : undefined} className={`${input} mt-1`} />{personErrors.name && <span role="alert" className="mt-1 block text-[13px] text-[#661102]">{personErrors.name}</span>}</label>
                    <label className="block min-w-0"><span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-[#6B6878]">Role</span><input name="role" placeholder="Buyer, Lender, Title..." className={`${input} mt-1`} /></label>
                    <label className="block min-w-0"><span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-[#6B6878]">Email</span><input name="email" type="email" placeholder="name@example.com" aria-invalid={personErrors.email ? true : undefined} className={`${input} mt-1`} />{personErrors.email && <span role="alert" className="mt-1 block text-[13px] text-[#661102]">{personErrors.email}</span>}</label>
                    <label className="block min-w-0"><span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-[#6B6878]">Phone</span><input name="phone" type="tel" placeholder="(512) 555-0100" className={`${input} mt-1`} /></label>
                    <div className="sm:col-span-2 flex justify-end gap-2"><button type="button" className={btn} onClick={() => setShowPersonForm(false)}>Cancel</button><button type="submit" className={btnPrimary}>Save</button></div>
                  </form>
                )}
                <div className="ds-card ds-list mt-3">
                  {allPeople.length === 0 && <p className="px-4 py-3 text-sm text-slate-500">No people added yet.</p>}
                  {allPeople.map((p) => {
                    const manual = people.find((c) => c.name.trim().toLowerCase() === p.name.trim().toLowerCase());
                    return <PartyLine key={`${p.role}-${p.name}`} p={p} textHref={textHref(p.phone, p.name, deal.propertyAddress || deal.title)} onRemove={manual && !locked ? () => onUpdate('clientContacts', people.filter((c) => c.id !== manual.id)) : undefined} />;
                  })}
                </div>
              </section>

              <section>
                <p className="ds-side-title !m-0">Trusted Service Providers</p>
                <p className="text-sm text-slate-500">Set up the lenders, inspectors, attorneys and others you recommend on this deal.</p>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {SERVICE_PROVIDER_CATEGORIES.map((category) => {
                    const count = deal.serviceProviders.filter((p) => p.category === category).length;
                    return (
                      <button key={category} type="button" onClick={() => setProviderCategory(category)} className="ds-provider-tile">
                        <span className="text-xs font-semibold uppercase tracking-wide text-[#301D5D]">{count ? `${count} Added` : 'Set Up'}</span>
                        <span className="text-sm font-medium text-slate-900">{titleCaseLabel(category)}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          )}

          {tab !== 'documents' && deal && <DocumentRequestsCard headless deal={deal} locked={locked} documentGroups={documentGroups} onUpdate={onUpdate} />}

          {tab === 'history' && (() => {
            const file = buildDealFile(deal, deadlines ?? [], health.label, stageName);
            return (
              <div className="space-y-4" data-testid="deal-file">
                {file.sections.map((s) => (
                  <section key={s.title} className="ds-card !p-0 overflow-hidden">
                    <p className="border-b border-[#E6E5EC] px-4 py-3 text-[15px] font-semibold text-[#1B1726]">{s.title}</p>
                    <table className="w-full text-left text-sm">
                      {s.headers && <thead><tr className="bg-[#F6F3FB]">{s.headers.map((h) => <th key={h} className="px-4 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[#6B6878]">{h}</th>)}</tr></thead>}
                      <tbody>
                        {s.rows.map((r, i) => (
                          <tr key={i} className="border-t border-[#F6F3FB] align-top">
                            {r.map((c, j) => (!s.headers && j === 0
                              ? <th key={j} scope="row" className="w-[30%] bg-[#F6F3FB] px-4 py-2 text-[13px] font-medium text-[#1B1726]">{c}</th>
                              : <td key={j} className="px-4 py-2 text-[#1B1726]">{c}</td>))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                ))}
              </div>
            );
          })()}
        </div>

        {!section && (<aside className="ds-rail-right" aria-label="Deal details">
          {sideBlocks.parties}
        </aside>)}
      </div>

      {providerCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-label={`Trusted ${providerCategory.toLowerCase()} providers`} onClick={() => setProviderCategory(null)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-900">Trusted {titleCaseLabel(providerCategory)} Providers</h3>
              <button type="button" aria-label="Close" className="text-slate-500 hover:text-slate-900" onClick={() => setProviderCategory(null)}><X className="h-5 w-5" aria-hidden="true" /></button>
            </div>
            <div className="mt-3 divide-y divide-[#F6F3FB]">
              {deal.serviceProviders.filter((p) => p.category === providerCategory).map((p) => (
                <div key={p.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1"><span className="block font-medium text-slate-900">{p.name}</span><span className="block truncate text-xs text-slate-500">{[p.phone, p.email].filter(Boolean).join(' · ')}</span></span>
                  {!locked && <button type="button" aria-label={`Remove ${p.name}`} className="text-slate-400 hover:text-[#661102]" onClick={() => onUpdate('serviceProviders', deal.serviceProviders.filter((x) => x.id !== p.id))}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}
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
                <div className="sm:col-span-3 flex justify-end gap-2"><button type="button" className={btn} onClick={() => setProviderCategory(null)}>Done</button><button type="submit" className={btnPrimary}>Add Provider</button></div>
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
      <div className="mt-2 divide-y divide-[#F6F3FB]">
        {items.length === 0 && <p className="py-2 text-sm text-slate-500">No offers or showings logged.</p>}
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 py-2 text-sm">
            <span className={`ds-chip ${item.kind === 'offer' ? 'ds-chip-purple' : 'bg-slate-100 text-slate-600'}`}>{item.kind === 'offer' ? 'Offer' : 'Showing'}</span>
            <span className="min-w-0 flex-1"><span className="block font-medium text-slate-900">{item.label}</span><span className="block text-xs text-slate-500">{[item.date ? formatDate(item.date) : '', item.amount, item.status].filter(Boolean).join(' · ')}</span></span>
            {!locked && <button type="button" aria-label={`Remove ${item.label}`} className="text-slate-400 hover:text-[#661102]" onClick={() => onUpdate('offersShowings', items.filter((x) => x.id !== item.id))}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}
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
