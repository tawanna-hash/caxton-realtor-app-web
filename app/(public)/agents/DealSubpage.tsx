'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, Plus, Trash2, UserRound, X } from 'lucide-react';
import type { AgentDeal } from '@/lib/agent-command-center-workspace';
import { PURCHASE_FOLDERS, PURCHASE_REQUIRED_IDS } from './purchase-documents';

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
};

export default function DealSubpage({ deal, locked, health, statusLabels, statuses, documentGroups, nextDeadline, formatDate, countdownLabel, onUpdate, onBack, onOpenView }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
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

  const tabs: [Tab, string][] = [['overview', 'Overview'], ['documents', 'Documents'], ['people', 'People'], ['tasks', `Tasks ${deal.tasks.length}`], ['history', 'History']];

  return (
    <div className="ds-page" data-testid="deal-subpage">
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

      <div className="ds-split">
        <div className="min-w-0">
          <div className="ds-tabs !mt-0" role="tablist" aria-label="Deal sections">
            {tabs.map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className="ds-tab">{label}</button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="space-y-4">
              <div className="ds-card">
                <label className="ds-field-label" htmlFor="deal-next-action">Next action</label>
                <input id="deal-next-action" className={`${input} mt-1`} disabled={locked} value={deal.nextAction} placeholder={nextTask ? nextTask.title : nextDeadline ? `${nextDeadline.label} · ${formatDate(nextDeadline.date)}` : 'What happens next?'} onChange={(e) => onUpdate('nextAction', e.target.value)} />
                <label className="ds-field-label mt-4 block" htmlFor="deal-notes">Notes</label>
                <textarea id="deal-notes" rows={3} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" disabled={locked} value={deal.notes} placeholder="Signing details, client requests, reminders" onChange={(e) => onUpdate('notes', e.target.value)} />
              </div>
              <div className="ds-card">
                <p className="ds-side-title !mt-0">Preferences</p>
                <div className="ds-fields mt-3">
                  {([['budget', 'Budget'], ['financing', 'Financing'], ['targetAreas', 'Target areas'], ['mustHaves', 'Must-haves'], ['timeframe', 'Timeframe'], ['minBeds', 'Min beds']] as const).map(([key, label]) => (
                    <div key={key}><label className="ds-field-label" htmlFor={`pref-${key}`}>{label}</label><input id={`pref-${key}`} className={`${input} mt-1`} disabled={locked} value={prefs[key]} onChange={(e) => setPref(key, e.target.value)} /></div>
                  ))}
                </div>
              </div>
              <OffersShowings deal={deal} locked={locked} formatDate={formatDate} onUpdate={onUpdate} />
            </div>
          )}

          {tab === 'documents' && (() => {
            const checks = deal.documentChecks;
            const requiredDone = PURCHASE_REQUIRED_IDS.filter((id) => checks[id]).length;
            return (
              <div className="space-y-4">
                <div className="ds-card flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="ds-side-title !m-0">{({ purchase: 'Purchase', listing_sale: 'Listing For Sale', listing_lease: 'Listing For Lease', lease: 'Lease' } as Record<string, string>)[deal.dealType] ?? 'Transaction'} documents</p>
                    <p className="text-sm text-slate-500">Required forms for this transaction type.</p>
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

        <aside className="ds-rail-right" aria-label="Deal details">
          <h3 className="ds-side-title">Focus property</h3>
          <div className="ds-card !p-0 overflow-hidden">
            {deal.photoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={deal.photoUrl} alt={deal.propertyAddress || deal.title} className="h-44 w-full object-cover" />
              : <div className="flex h-32 items-center justify-center bg-[#F6F3FB] text-sm text-slate-400">No photo</div>}
            <div className="p-4">
              <p className="font-semibold text-slate-900">{deal.propertyAddress || deal.title}</p>
              <p className="mt-1 text-xs text-slate-500">{deal.closingDate ? `Closing ${formatDate(deal.closingDate)} · ${countdownLabel}` : 'Closing date not set'}</p>
              {!locked && <input aria-label="Photo URL" className={`${input} mt-3`} placeholder="Photo URL" value={deal.photoUrl} onChange={(e) => onUpdate('photoUrl', e.target.value)} />}
            </div>
          </div>
          <h3 className="ds-side-title">Contacts</h3>
          <div className="ds-card ds-list">
            {people.length === 0 && <p className="text-sm text-slate-500">No contacts added.</p>}
            {people.slice(0, 5).map((p) => (
              <div key={p.id} className="ds-list-row"><span className="min-w-0"><span className="block text-sm font-medium text-slate-900">{p.name}</span><span className="block truncate text-xs text-slate-500">{p.email || p.role}</span></span></div>
            ))}
          </div>
          <h3 className="ds-side-title">Workspace</h3>
          <div className="ds-card ds-list">
            {([['transaction', 'Current Deal'], ['coordinator', 'Deal Settings'], ['readiness', 'Readiness Check'], ['audit', 'Audit Trail']] as const).map(([view, label]) => (
              <button key={view} type="button" onClick={() => onOpenView(view)} className="ds-list-row ds-link-row"><span className="min-w-0 flex-1 text-left">{label}</span><ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" /></button>
            ))}
          </div>
        </aside>
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
