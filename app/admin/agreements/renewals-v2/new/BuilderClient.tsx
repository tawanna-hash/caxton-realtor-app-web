'use client';

// Anchor-style single-page agreement builder: details, services, note, reference
// fields, billing timeline panel, client preview, save as template, send.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { A } from '@/components/anchor/ui';
import { DEFAULT_BILLING, DEFAULT_PAYMENT, billingBadge, cleanBilling, termMonths, type ServiceBilling } from '@/lib/agreements-v2/service-billing';
import {
  EMPTY_DOC, defaultPriceCents, docProblems, docTotalCents, quotePayload,
  type BuilderDoc, type Catalog, type Pub, type ServiceLine,
} from '@/lib/agreements-v2/builder-doc';

type Advertiser = { id: number; name: string; contact_email: string | null };
type DraftRow = { id: string; name: string; updated_at: string };
type Timeline =
  | { ok: false; reason: string }
  | { ok: true; first_invoice: { date: string; cents: number }; recurring_annual_cents: number; total_cents: number; due_days: number; card_today_cents: number;
      services: Array<{ label: string; manual: boolean; dates: string[] }>; manual_labels: string[];
      invoices: Array<{ date: string; due: string; total: number; items: Array<{ label: string; cents: number }> }> };

const money = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const fmtDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const today = () => new Date().toISOString().slice(0, 10);
const PUB_LABEL: Record<Pub, string> = { austin: 'Austin (RealtyLine)', san_antonio: 'San Antonio (Newsline)', both: 'Both markets' };
const uid = () => Math.random().toString(36).slice(2, 10);

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white shadow-xl">
        <div className="relative bg-[#EEF0FB] px-6 py-5 text-center">
          <h2 className="text-lg font-semibold text-[#261E5A]">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="absolute right-4 top-4 text-xl leading-none text-[#261E5A]">×</button>
        </div>
        <div className="space-y-4 px-6 py-6">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, isSelect }: { label: string; children: React.ReactNode; isSelect?: boolean }) {
  return (
    <label className="relative block">
      <span className="pointer-events-none absolute -top-2 left-3 z-10 bg-white px-1 text-xs text-[#5B3FE3]">{label}</span>
      {children}
      {isSelect && <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#261E5A]" width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    </label>
  );
}

const sel = `${A.input} appearance-none pr-9`;

export default function BuilderClient() {
  const router = useRouter();
  const params = useSearchParams();
  const [doc, setDoc] = useState<BuilderDoc>(EMPTY_DOC);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [intros, setIntros] = useState<{ new_partner: string; renewal: string }>({ new_partner: '', renewal: '' });
  const [templates, setTemplates] = useState<DraftRow[]>([]);
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const dirty = useRef(false);

  const [panel, setPanel] = useState(false);
  const [signDate, setSignDate] = useState(today());
  const [tab, setTab] = useState<'overview' | 'service' | 'invoice'>('overview');
  const [month, setMonth] = useState(0);
  const [timeline, setTimeline] = useState<Timeline | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [tplName, setTplName] = useState('');
  const [busy, setBusy] = useState(false);
  const [refsOpen, setRefsOpen] = useState(true);

  const update = useCallback((patch: Partial<BuilderDoc>) => {
    dirty.current = true;
    setDoc((d) => ({ ...d, ...patch }));
  }, []);

  // Initial load: catalog, templates, clients, and an existing draft or template.
  useEffect(() => {
    (async () => {
      try {
        const [b, a] = await Promise.all([
          fetch('/api/admin/agreements-v2/builder', { credentials: 'include' }).then((r) => r.json()),
          fetch('/api/admin/advertisers', { credentials: 'include' }).then((r) => r.json()),
        ]);
        setCatalog(b.catalog);
        setIntros(b.intros);
        setTemplates(b.templates ?? []);
        setAdvertisers(((a.advertisers ?? []) as Advertiser[]).map((x) => ({ id: x.id, name: x.name, contact_email: x.contact_email })));
        const draft = params.get('draft');
        const tpl = params.get('template');
        const id = draft || tpl;
        if (id) {
          const j = await fetch(`/api/admin/agreements-v2/builder?id=${id}`, { credentials: 'include' }).then((r) => r.json());
          if (j.draft) { setDoc({ ...EMPTY_DOC, ...j.draft.doc, payment: { ...DEFAULT_PAYMENT, ...(j.draft.doc.payment ?? {}) } }); if (draft) setDraftId(draft); }
        } else {
          setDoc((d) => ({ ...d, intro: b.intros.new_partner, expires_days: b.expiry_days ?? 30 }));
        }
      } catch {
        setError('Could not load the builder. Reload the page.');
      } finally {
        setLoaded(true);
      }
    })();
  }, [params]);

  // Autosave, like Anchor's "Draft saved".
  useEffect(() => {
    if (!loaded || !dirty.current) return;
    setSaveState('saving');
    const t = window.setTimeout(async () => {
      try {
        const r = await fetch('/api/admin/agreements-v2/builder', {
          method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'save', id: draftId, kind: 'draft', name: doc.name, doc }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        if (j.id && j.id !== draftId) {
          setDraftId(j.id);
          window.history.replaceState(null, '', `/admin/agreements/renewals-v2/new?draft=${j.id}`);
        }
        setSaveState('saved');
      } catch { setSaveState('idle'); }
    }, 1200);
    return () => window.clearTimeout(t);
  }, [doc, loaded, draftId]);

  // Billing timeline from the same schedule rules billing uses once signed.
  useEffect(() => {
    if (!panel) return;
    const t = window.setTimeout(async () => {
      try {
        const r = await fetch('/api/admin/agreements-v2/builder', {
          method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'timeline', doc, sign_date: signDate }),
        });
        setTimeline(await r.json());
        setMonth(0);
      } catch { setTimeline({ ok: false, reason: 'Could not build the timeline.' }); }
    }, 400);
    return () => window.clearTimeout(t);
  }, [panel, doc, signDate]);

  const total = docTotalCents(doc);
  const problems = useMemo(() => docProblems(doc), [doc]);
  const client = advertisers.find((a) => a.id === doc.advertiser_id) ?? null;
  const firstPub: Pub = doc.services[0]?.publication ?? 'austin';

  async function saveTemplate() {
    if (!tplName.trim()) return;
    setBusy(true);
    try {
      const r = await fetch('/api/admin/agreements-v2/builder', {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'save', kind: 'template', name: tplName.trim(), doc: { ...doc, advertiser_id: null, new_client: null } }),
      });
      if (!r.ok) throw new Error();
      setTplOpen(false); setTplName('');
      setTemplates((await fetch('/api/admin/agreements-v2/builder', { credentials: 'include' }).then((x) => x.json())).templates ?? []);
    } catch { setError('Could not save the template.'); } finally { setBusy(false); }
  }

  async function send() {
    setBusy(true); setError(null);
    let agreementId: string | null = null;
    try {
      const q = await fetch('/api/admin/quotes', {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(quotePayload(doc, firstPub)),
      });
      const qj = await q.json();
      if (!q.ok) throw new Error(qj.error || qj.message || `Could not create the agreement (HTTP ${q.status})`);
      agreementId = (qj.agreement ?? qj).id as string;
      const m = await fetch(`/api/admin/agreements-v2/${agreementId}`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'save_meta',
          meta: {
            name: doc.name, intro: doc.intro, note: doc.note, ask_address: doc.ask_address,
            expires_days: doc.expires ? doc.expires_days : null,
            refs: doc.refs,
            services: doc.services.map((s, i) => ({ line_no: i + 1, name: s.name, description: s.description, billing: { ...cleanBilling(s.billing), term_months: termMonths(s) } })),
            payment: doc.payment,
          },
        }),
      });
      if (!m.ok) throw new Error('The agreement was created but its details could not be saved.');
      const s = await fetch(`/api/admin/new-partner-v2/${agreementId}`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'send' }),
      });
      const sj = await s.json();
      if (!s.ok || sj.ok === false) throw new Error(sj.error || 'The agreement was created but the email did not send.');
      if (draftId) await fetch('/api/admin/agreements-v2/builder', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: draftId }) });
      router.push('/admin/agreements/renewals-v2');
    } catch (e) {
      setSendOpen(false);
      setError(`${e instanceof Error ? e.message : 'Send failed.'}${agreementId ? ' The draft agreement is saved in New partners; you can send it from there.' : ''}`);
    } finally { setBusy(false); }
  }

  const svcLabel = (s: ServiceLine) => s.name || 'Service';

  return (
    <div className="min-h-screen bg-[#F7F7FA]" data-anchor-ui="true" data-no-auto-open>
      {/* Top bar */}
      <div className="sticky top-0 z-40 flex flex-wrap items-center gap-3 border-b border-[#ECEAF4] bg-white px-4 py-3">
        <Link href="/admin/agreements/renewals-v2" aria-label="Close builder" className="text-2xl leading-none text-[#261E5A]">×</Link>
        <h1 className="text-lg font-semibold text-[#261E5A]">Create agreement</h1>
        {saveState !== 'idle' && (
          <span className="rounded-full border border-green-600 px-2.5 py-0.5 text-xs text-green-700">{saveState === 'saving' ? 'Saving…' : 'Draft saved'}</span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" className={A.outline} onClick={() => setPanel((p) => !p)} aria-pressed={panel}>Billing timeline</button>
          <button type="button" className={A.outline} onClick={() => { setTplName(doc.name); setTplOpen(true); }}>Save as template</button>
          <button type="button" className={A.outline} onClick={() => setPreviewOpen(true)}>View client preview</button>
          <button type="button" className={A.primary} disabled={problems.length > 0 || busy} onClick={() => setSendOpen(true)} title={problems[0]}>Send</button>
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6">
        {panel && (
          <aside className="w-[380px] shrink-0 self-start rounded-lg border border-[#ECEAF4] bg-white" aria-label="Billing timeline">
            <div className="flex items-start justify-between p-4">
              <div><h2 className="font-semibold text-[#261E5A]">Billing timeline</h2><p className="text-xs text-[#6E6A8A]">For automatically billed services</p></div>
              <button type="button" aria-label="Close" onClick={() => setPanel(false)} className="text-xl leading-none text-[#261E5A]">×</button>
            </div>
            <div className="px-4">
              <Field label="Simulate sign date">
                <input type="date" value={signDate} onChange={(e) => setSignDate(e.target.value || today())} className="mt-0 w-full border border-[#5B3FE3] text-sm text-[#261E5A]" />
              </Field>
            </div>
            {timeline && !timeline.ok && <p className="p-4 text-sm text-[#6E6A8A]">{timeline.reason}</p>}
            {timeline && timeline.ok && (
              <div className="p-4">
                <div className="grid grid-cols-3 gap-2 text-xs text-[#6E6A8A]">
                  <div><div>First invoice</div><div className="text-lg font-semibold text-[#261E5A]">{money(timeline.first_invoice.cents)}</div><div>{fmtDay(timeline.first_invoice.date)}</div></div>
                  <div><div>Annual recurring</div><div className="text-lg font-semibold text-[#261E5A]">{money(timeline.recurring_annual_cents)}</div><div>per year</div></div>
                  <div><div>Contract value</div><div className="text-lg font-semibold text-[#261E5A]">{money(timeline.total_cents)}</div><div>{timeline.invoices.length} invoices</div></div>
                </div>
                <div className="mt-4 flex rounded-full bg-[#EEEDF3] p-1 text-sm" role="tablist">
                  {([['overview', 'Overview'], ['service', 'By service'], ['invoice', 'By invoice']] as const).map(([k, l]) => (
                    <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`flex-1 rounded-full px-2 py-1.5 ${tab === k ? 'bg-white font-medium text-[#261E5A] shadow' : 'text-[#6E6A8A]'}`} style={{ border: 0 }}>{l}</button>
                  ))}
                </div>
                {tab === 'overview' && (() => {
                  const max = Math.max(...timeline.invoices.map((i) => i.total), 1);
                  return (
                    <div className="mt-4 flex h-40 items-end gap-1.5 border-b border-[#ECEAF4]">
                      {timeline.invoices.slice(0, 12).map((i) => (
                        <div key={i.date} className="flex flex-1 flex-col items-center justify-end" title={`${fmtDay(i.date)} ${money(i.total)}`}>
                          <div className="w-full rounded-t bg-[#A99CF0]" style={{ height: `${Math.max(6, (i.total / max) * 100)}%` }} />
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {tab === 'overview' && <div className="mt-1 flex gap-1.5 text-[10px] text-[#6E6A8A]">{timeline.invoices.slice(0, 12).map((i) => <span key={i.date} className="flex-1 text-center">{new Date(`${i.date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</span>)}</div>}
                {tab === 'service' && (
                  <ul className="mt-4 space-y-3 text-sm">
                    {timeline.services.map((sv, i) => (
                      <li key={i}>
                        <div className="font-medium text-[#261E5A]">{sv.label}</div>
                        {sv.manual ? <p className="mt-1 text-xs text-[#6E6A8A]">Billed manually. Nothing is scheduled.</p> : (
                          <div className="mt-1 flex flex-wrap gap-1">{sv.dates.slice(0, 12).map((d) => <span key={d} className="rounded-full bg-[#EEF0FB] px-2 py-0.5 text-xs text-[#261E5A]">{new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</span>)}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {tab === 'invoice' && (() => {
                  const inv = timeline.invoices[Math.min(month, timeline.invoices.length - 1)];
                  return (
                    <div className="mt-4">
                      <div className="flex items-center justify-between">
                        <button type="button" aria-label="Previous invoice" disabled={month === 0} onClick={() => setMonth((m) => m - 1)} className={`${A.small} disabled:opacity-40`}>‹</button>
                        <span className="text-sm font-semibold text-[#261E5A]">{new Date(`${inv.date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })}</span>
                        <button type="button" aria-label="Next invoice" disabled={month >= timeline.invoices.length - 1} onClick={() => setMonth((m) => m + 1)} className={`${A.small} disabled:opacity-40`}>›</button>
                      </div>
                      <div className="mt-3 rounded-lg border border-[#ECEAF4] p-4 text-sm">
                        <div className="text-xs text-[#6E6A8A]">{fmtDay(inv.date)} · due {fmtDay(inv.due)}</div>
                        {inv.items.map((it, i) => <div key={i} className="mt-2 flex justify-between gap-3 text-[#261E5A]"><span>{it.label}</span><span>{money(it.cents)}</span></div>)}
                        <div className="mt-3 flex justify-between border-t border-[#ECEAF4] pt-2 font-semibold text-[#261E5A]"><span>Total</span><span>{money(inv.total)}</span></div>
                      </div>
                    </div>
                  );
                })()}
                {timeline.manual_labels.length > 0 && <p className="mt-3 text-xs text-[#6E6A8A]">Billed manually, not in this schedule: {timeline.manual_labels.join(', ')}.</p>}
                <p className="mt-4 text-xs text-[#6E6A8A]">Partners who pay by card are charged {money(timeline.card_today_cents)} (3% surcharge included) when they sign. Invoices apply to partners who pay by check.</p>
              </div>
            )}
          </aside>
        )}

        <main className="mx-auto w-full max-w-2xl space-y-6">
          {error && <div className={A.error} role="alert">{error}</div>}

          {/* Agreement details */}
          <section className={`${A.card} overflow-visible`}>
            <h2 className="border-b border-[#ECEAF4] px-6 py-4 text-lg font-semibold text-[#261E5A]">Agreement details</h2>
            <div className="space-y-5 p-6">
              <Field label="Agreement name">
                <input className={A.input} value={doc.name} placeholder="Agreement" onChange={(e) => update({ name: e.target.value })} />
              </Field>
              <Field label="Client" isSelect>
                <select className={sel} value={doc.new_client ? 'new' : doc.advertiser_id ?? ''} onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'new') update({ advertiser_id: null, new_client: { name: '', email: '', contact: '' } });
                  else update({ advertiser_id: v ? Number(v) : null, new_client: null });
                }}>
                  <option value="">Select client</option>
                  <option value="new">Add a new client…</option>
                  {advertisers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              {client && !client.contact_email && <p className="text-xs text-red-700">This client has no contact email, so the agreement cannot be emailed.</p>}
              {doc.new_client && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <input className={A.input} placeholder="Company name" value={doc.new_client.name} onChange={(e) => update({ new_client: { ...doc.new_client!, name: e.target.value } })} />
                  <input className={A.input} placeholder="Contact name" value={doc.new_client.contact} onChange={(e) => update({ new_client: { ...doc.new_client!, contact: e.target.value } })} />
                  <input className={`${A.input} sm:col-span-2`} type="email" placeholder="Contact email" value={doc.new_client.email} onChange={(e) => update({ new_client: { ...doc.new_client!, email: e.target.value } })} />
                </div>
              )}
              <hr className="border-[#ECEAF4]" />
              <Field label="Agreement effective date" isSelect>
                <select className={sel} value={doc.effective} onChange={(e) => update({ effective: e.target.value as BuilderDoc['effective'] })}>
                  <option value="acceptance">On acceptance</option>
                  <option value="date">On a specific date</option>
                </select>
              </Field>
              {doc.effective === 'date' && (
                <input type="date" aria-label="Effective date" min={today()} value={doc.effective_date} onChange={(e) => update({ effective_date: e.target.value })} className="w-full border border-[#D8D5E6] text-sm text-[#261E5A]" />
              )}
              <Field label="Introductory message" isSelect>
                <select className={sel} value="" onChange={(e) => {
                  if (e.target.value === 'new') update({ intro: intros.new_partner });
                  if (e.target.value === 'renewal') update({ intro: intros.renewal });
                }}>
                  <option value="">Start from a template…</option>
                  <option value="new">New partner template</option>
                  <option value="renewal">Renewal template</option>
                </select>
              </Field>
              <textarea className={`${A.input} min-h-[140px]`} value={doc.intro} aria-label="Introductory message text" onChange={(e) => update({ intro: e.target.value })} />
              <p className="-mt-3 text-xs text-[#6E6A8A]">Use {'{first_name}'} and {'{company}'} to personalize.</p>
              <label className="flex items-center gap-3 text-sm text-[#261E5A]">
                <input type="checkbox" className="h-4 w-4 accent-[#5B3FE3]" checked={doc.expires} onChange={(e) => update({ expires: e.target.checked })} />
                Set an expiration for this proposal
                {doc.expires && (
                  <span className="ml-2 inline-flex items-center gap-2">
                    <input type="number" min={1} max={365} aria-label="Days until expiry" value={doc.expires_days} onChange={(e) => update({ expires_days: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })} className="w-20 rounded-md border border-[#D8D5E6] px-2 py-1 text-sm" />
                    days after sending
                  </span>
                )}
              </label>
            </div>
          </section>

          {/* Services */}
          <section className={A.card}>
            <h2 className="border-b border-[#ECEAF4] px-6 py-4 text-lg font-semibold text-[#261E5A]">Services provided</h2>
            <div className="space-y-3 p-6">
              {doc.services.length === 0 && <p className="text-sm text-[#6E6A8A]">No services yet. Add the products this agreement covers.</p>}
              {doc.services.map((s, i) => (
                <div key={s.id} className="rounded-lg border border-[#ECEAF4] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-[#261E5A]">{svcLabel(s)}</div>
                      {s.description && <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-[#6E6A8A]">{s.description}</p>}
                    </div>
                    <div className="text-right font-semibold text-[#261E5A]">{money(s.price_cents)}</div>
                  </div>
                  <BillingControls billing={s.billing ?? DEFAULT_BILLING} onChange={(b) => update({ services: doc.services.map((x) => (x.id === s.id ? { ...x, billing: b } : x)) })} />
                  <div className="mt-3 flex gap-2">
                    <button type="button" className={A.small} onClick={() => setEditIdx(i)}>Edit name and description</button>
                    <button type="button" className={A.small} onClick={() => update({ services: doc.services.filter((x) => x.id !== s.id) })}>Remove</button>
                  </div>
                </div>
              ))}
              <button type="button" className="text-sm font-medium text-[#5B3FE3]" style={{ border: 0, background: 'transparent' }} onClick={() => setAddOpen(true)} disabled={!catalog}>+ Create service</button>
              {doc.services.length > 0 && <div className="flex justify-between border-t border-[#ECEAF4] pt-3 text-sm font-semibold text-[#261E5A]"><span>Agreement total</span><span>{money(total)}</span></div>}
            </div>
          </section>

          {/* Note */}
          <section className={A.card}>
            <div className="space-y-4 p-6">
              <label className="flex items-center gap-3 text-sm text-[#261E5A]">
                <input type="checkbox" className="h-4 w-4 accent-[#5B3FE3]" checked={doc.ask_address} onChange={(e) => update({ ask_address: e.target.checked })} />
                Ask my client to provide their address
              </label>
              <div>
                <div className="mb-1 text-sm text-[#261E5A]">Add a note to your agreement (optional)</div>
                <textarea className={`${A.input} min-h-[160px]`} value={doc.note} placeholder="Add here anything you need that's not specified elsewhere" onChange={(e) => update({ note: e.target.value })} />
              </div>
            </div>
          </section>

          {/* Payment settings */}
          <section className={A.card}>
            <h2 className="border-b border-[#ECEAF4] px-6 py-4 text-lg font-semibold text-[#261E5A]">Payment settings</h2>
            <div className="space-y-4 p-6 text-sm text-[#261E5A]">
              <div>
                <div className="mb-2 font-medium">Payment methods the client can choose</div>
                <label className="flex items-center gap-3"><input type="checkbox" className="h-4 w-4 accent-[#5B3FE3]" checked={doc.payment.card} onChange={(e) => update({ payment: { ...doc.payment, card: e.target.checked } })} />Credit card <span className="text-[#6E6A8A]">(3% surcharge added, charged when they sign)</span></label>
                <label className="mt-2 flex items-center gap-3"><input type="checkbox" className="h-4 w-4 accent-[#5B3FE3]" checked={doc.payment.check} onChange={(e) => update({ payment: { ...doc.payment, check: e.target.checked } })} />Check <span className="text-[#6E6A8A]">(invoiced on the schedule; print agreements only)</span></label>
              </div>
              <Field label="Invoice due">
                <input type="number" min={0} max={120} className={A.input} placeholder="Account default" value={doc.payment.due_days ?? ''} onChange={(e) => update({ payment: { ...doc.payment, due_days: e.target.value === '' ? null : Math.max(0, Math.min(120, Number(e.target.value) || 0)) } })} />
              </Field>
              <p className="-mt-2 text-xs text-[#6E6A8A]">Days after each invoice is issued. Leave blank for the account default.</p>
              <label className="flex items-center gap-3"><input type="checkbox" className="h-4 w-4 accent-[#5B3FE3]" checked={doc.payment.show_schedule} onChange={(e) => update({ payment: { ...doc.payment, show_schedule: e.target.checked } })} />Show the billing schedule to the client</label>
            </div>
          </section>

          {/* Reference fields */}
          <section className={A.card}>
            <button type="button" className="flex w-full items-center justify-between px-6 py-4 text-left" style={{ border: 0, background: 'transparent' }} aria-expanded={refsOpen} aria-haspopup="true" onClick={() => setRefsOpen((o) => !o)}>
              <span className="text-lg font-semibold text-[#261E5A]">Reference fields</span>
              <span className={`text-[#261E5A] ${refsOpen ? 'rotate-180' : ''}`} aria-hidden="true">⌃</span>
            </button>
            {refsOpen && (
              <div className="space-y-4 border-t border-[#ECEAF4] p-6">
                {doc.refs.map((r, i) => (
                  <div key={i} className="space-y-3">
                    <div className="flex items-center gap-3">
                      <input className={A.input} placeholder="Reference field name" value={r.name} onChange={(e) => update({ refs: doc.refs.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} />
                      <input className={A.input} placeholder="Value" value={r.value} onChange={(e) => update({ refs: doc.refs.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)) })} />
                      <button type="button" aria-label="Remove reference field" className="text-xl text-[#261E5A]" style={{ border: 0, background: 'transparent' }} onClick={() => update({ refs: doc.refs.filter((_, k) => k !== i) })}>×</button>
                    </div>
                    <div className="inline-flex rounded-full bg-[#EEEDF3] p-1 text-sm" role="group" aria-label="Visibility">
                      {([true, false] as const).map((cf) => (
                        <button key={String(cf)} type="button" aria-pressed={r.client_facing === cf} onClick={() => update({ refs: doc.refs.map((x, k) => (k === i ? { ...x, client_facing: cf } : x)) })} className={`rounded-full px-4 py-1.5 ${r.client_facing === cf ? 'bg-white font-medium text-[#261E5A] shadow' : 'text-[#6E6A8A]'}`} style={{ border: 0 }}>{cf ? 'Client-facing' : 'Internal'}</button>
                      ))}
                    </div>
                  </div>
                ))}
                <button type="button" className="text-sm font-medium text-[#5B3FE3]" style={{ border: 0, background: 'transparent' }} onClick={() => update({ refs: [...doc.refs, { name: '', value: '', client_facing: false }] })}>⊕ Add reference field</button>
              </div>
            )}
          </section>

          {templates.length > 0 && (
            <p className="text-sm text-[#6E6A8A]">Start from a saved template: {templates.map((t) => <a key={t.id} href={`/admin/agreements/renewals-v2/new?template=${t.id}`} className="mr-3 text-[#5B3FE3] underline">{t.name}</a>)}</p>
          )}
        </main>
      </div>

      {/* Add service */}
      {addOpen && catalog && <ServiceModal catalog={catalog} onClose={() => setAddOpen(false)} onSave={(s) => { update({ services: [...doc.services, s] }); setAddOpen(false); }} />}

      {/* Edit name and description */}
      {editIdx !== null && doc.services[editIdx] && (
        <EditServiceModal
          service={doc.services[editIdx]}
          onClose={() => setEditIdx(null)}
          onSave={(patch) => { update({ services: doc.services.map((x, k) => (k === editIdx ? { ...x, ...patch } : x)) }); setEditIdx(null); }}
        />
      )}

      {/* Save as template */}
      {tplOpen && (
        <Modal title="Save as template" onClose={() => setTplOpen(false)}>
          <input className={A.input} placeholder="Template name" value={tplName} onChange={(e) => setTplName(e.target.value)} />
          <p className="text-xs text-[#6E6A8A]">Saves the services, message, note and reference fields. The client is not saved.</p>
          <div className="flex justify-end gap-3"><button type="button" className={A.outline} onClick={() => setTplOpen(false)}>Cancel</button><button type="button" className={A.primary} disabled={!tplName.trim() || busy} onClick={saveTemplate}>Save</button></div>
        </Modal>
      )}

      {/* Client preview */}
      {previewOpen && (
        <Modal title="Client preview" onClose={() => setPreviewOpen(false)}>
          <div className="space-y-3 text-sm text-[#261E5A]">
            <p className="text-xs uppercase tracking-wide text-[#6E6A8A]">{doc.name || 'Your advertising agreement'}</p>
            <p className="whitespace-pre-line">{doc.intro.replace('{first_name}', doc.new_client?.contact?.split(' ')[0] || 'there').replace('{company}', doc.new_client?.name || client?.name || 'your company')}</p>
            <div className="space-y-3 rounded-md bg-[#F3F0FF] p-4">
              {doc.services.map((s) => (
                <div key={s.id}>
                  <div className="flex justify-between gap-4"><span>{svcLabel(s)}</span><span className="font-medium">{money(s.price_cents)}</span></div>
                  {s.description && <p className="mt-1 whitespace-pre-line text-xs text-[#4A4767]">{s.description}</p>}
                </div>
              ))}
              {doc.refs.filter((r) => r.client_facing && r.name).map((r, i) => <div key={i} className="flex justify-between gap-4 text-xs"><span className="text-[#6E6A8A]">{r.name}</span><span>{r.value}</span></div>)}
              <div className="flex justify-between border-t border-[#E4DFF1] pt-3 font-semibold"><span>Agreement total</span><span>{money(total)}</span></div>
            </div>
            {doc.note && <p className="whitespace-pre-line rounded-md border border-[#ECEAF4] p-3 text-xs text-[#4A4767]">{doc.note}</p>}
            {doc.ask_address && <p className="text-xs text-[#6E6A8A]">The client will be asked for their address.</p>}
            {doc.expires && <p className="text-xs text-[#6E6A8A]">Expires {doc.expires_days} days after sending.</p>}
            {doc.services.map((sv) => <p key={sv.id} className="text-xs text-[#6E6A8A]">{svcLabel(sv)}: {billingBadge(sv.billing ?? DEFAULT_BILLING).toLowerCase()}.</p>)}
            <p className="text-xs text-[#6E6A8A]">Payment: {[doc.payment.card ? 'credit card' : null, doc.payment.check ? 'check' : null].filter(Boolean).join(' or ')}.</p>
            <p className="text-xs text-[#6E6A8A]">Effective {doc.effective === 'date' && doc.effective_date ? fmtDay(doc.effective_date) : 'on acceptance'}. The client then enters send or start dates for e-Blast and app services, chooses card or check, and signs.</p>
          </div>
        </Modal>
      )}

      {/* Send */}
      {sendOpen && (
        <Modal title="Send agreement" onClose={() => !busy && setSendOpen(false)}>
          <p className="text-sm text-[#261E5A]">
            This creates the agreement for {client?.name ?? doc.new_client?.name} and emails the review link to {client?.contact_email ?? doc.new_client?.email}. Total {money(total)}.
          </p>
          <div className="flex justify-end gap-3"><button type="button" className={A.outline} disabled={busy} onClick={() => setSendOpen(false)}>Cancel</button><button type="button" className={A.primary} disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Send'}</button></div>
        </Modal>
      )}
    </div>
  );
}

function ServiceModal({ catalog, onClose, onSave }: { catalog: Catalog; onClose: () => void; onSave: (s: ServiceLine) => void }) {
  const [channel, setChannel] = useState<ServiceLine['channel']>('print');
  const [pkg, setPkg] = useState(catalog.print[0]?.id ?? '');
  const [size, setSize] = useState(catalog.print[0]?.sizes[0]?.size ?? '');
  const [months, setMonths] = useState(1);
  const [sends, setSends] = useState(1);
  const [weeks, setWeeks] = useState(4);
  const [markets, setMarkets] = useState<1 | 2 | 3 | 4>(1);
  const [pub, setPub] = useState<Pub>('austin');
  const [price, setPrice] = useState<string | null>(null);

  const pickChannel = (c: ServiceLine['channel']) => {
    setChannel(c); setPrice(null);
    setPkg(c === 'print' ? catalog.print[0]?.id ?? '' : c === 'email' ? catalog.email[0]?.id ?? '' : catalog.app[0]?.slug ?? '');
    if (c === 'print') setSize(catalog.print[0]?.sizes[0]?.size ?? '');
  };
  const base = { channel, package_id: pkg, size, months, sends, app_weeks: weeks, app_markets: markets, publication: pub };
  const suggested = defaultPriceCents(base, catalog);
  const cents = price === null ? suggested : Math.round(Number(price) * 100) || 0;
  const label =
    channel === 'print' ? `${catalog.print.find((p) => p.id === pkg)?.name ?? 'Print'} — ${size}${months > 1 ? `, ${months} months` : ''}`
    : channel === 'email' ? `${catalog.email.find((e) => e.id === pkg)?.name ?? 'e-Blast'}${sends > 1 ? `, ${sends} sends` : ''}`
    : `${catalog.app.find((s) => s.slug === pkg)?.name ?? 'App placement'} — ${markets} market${markets > 1 ? 's' : ''}, ${weeks} weeks`;

  return (
    <Modal title="Create service" onClose={onClose}>
      <Field label="Type" isSelect><select className={sel} value={channel} onChange={(e) => pickChannel(e.target.value as ServiceLine['channel'])}><option value="print">Print ad</option><option value="email">e-Blast</option><option value="app">App placement</option></select></Field>
      <Field label="Product" isSelect>
        <select className={sel} value={pkg} onChange={(e) => { setPkg(e.target.value); setPrice(null); if (channel === 'print') setSize(catalog.print.find((p) => p.id === e.target.value)?.sizes[0]?.size ?? ''); }}>
          {channel === 'print' && catalog.print.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          {channel === 'email' && catalog.email.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          {channel === 'app' && catalog.app.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
        </select>
      </Field>
      {channel === 'print' && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Ad size" isSelect><select className={sel} value={size} onChange={(e) => { setSize(e.target.value); setPrice(null); }}>{catalog.print.find((p) => p.id === pkg)?.sizes.map((s) => <option key={s.size} value={s.size}>{s.size}</option>)}</select></Field>
          <Field label="Months"><input type="number" min={1} max={24} className={A.input} value={months} onChange={(e) => { setMonths(Math.max(1, Math.min(24, Number(e.target.value) || 1))); setPrice(null); }} /></Field>
        </div>
      )}
      {channel === 'email' && <Field label="Sends"><input type="number" min={1} max={52} className={A.input} value={sends} onChange={(e) => { setSends(Math.max(1, Math.min(52, Number(e.target.value) || 1))); setPrice(null); }} /></Field>}
      {channel === 'app' && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Weeks"><input type="number" min={1} max={52} className={A.input} value={weeks} onChange={(e) => { setWeeks(Math.max(1, Math.min(52, Number(e.target.value) || 1))); setPrice(null); }} /></Field>
          <Field label="Markets" isSelect><select className={sel} value={markets} onChange={(e) => { setMarkets(Number(e.target.value) as 1 | 2 | 3 | 4); setPrice(null); }}>{[1, 2, 3, 4].map((m) => <option key={m} value={m}>{m}</option>)}</select></Field>
        </div>
      )}
      <Field label="Publication" isSelect><select className={sel} value={pub} onChange={(e) => { setPub(e.target.value as Pub); setPrice(null); }}>{(Object.keys(PUB_LABEL) as Pub[]).map((p) => <option key={p} value={p}>{PUB_LABEL[p]}</option>)}</select></Field>
      <Field label="Price (USD)"><input type="number" min={0} step="0.01" className={A.input} value={price ?? (suggested / 100).toString()} onChange={(e) => setPrice(e.target.value)} /></Field>
      <p className="text-xs text-[#6E6A8A]">The price starts at the media kit rate. Change it to give a custom price.</p>
      <div className="flex justify-end gap-3">
        <button type="button" className={A.outline} onClick={onClose}>Cancel</button>
        <button type="button" className={A.primary} disabled={!pkg || cents <= 0} onClick={() => onSave({ id: uid(), channel, package_id: pkg, size: channel === 'print' ? size : undefined, months: channel === 'print' ? months : undefined, sends: channel === 'email' ? sends : undefined, app_weeks: channel === 'app' ? weeks : undefined, app_markets: channel === 'app' ? markets : undefined, publication: pub, price_cents: cents, name: label, description: '' })}>Save</button>
      </div>
    </Modal>
  );
}

function EditServiceModal({ service, onClose, onSave }: { service: ServiceLine; onClose: () => void; onSave: (p: Partial<ServiceLine>) => void }) {
  const [name, setName] = useState(service.name);
  const [description, setDescription] = useState(service.description);
  const [price, setPrice] = useState((service.price_cents / 100).toString());
  return (
    <Modal title="Service name & description" onClose={onClose}>
      <Field label="Service name"><input className={A.input} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div>
        <div className="mb-1 text-sm text-[#6E6A8A]">Service description</div>
        <textarea className={`${A.input} min-h-[180px]`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What the client gets. Start lines with a dash for a list." />
      </div>
      <Field label="Price (USD)"><input type="number" min={0} step="0.01" className={A.input} value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
      <div className="flex justify-end gap-3">
        <button type="button" className={A.outline} onClick={onClose}>Cancel</button>
        <button type="button" className={A.primary} disabled={!name.trim()} onClick={() => onSave({ name: name.trim(), description, price_cents: Math.round(Number(price) * 100) || service.price_cents })}>Save</button>
      </div>
    </Modal>
  );
}

function BillingControls({ billing, onChange }: { billing: ServiceBilling; onChange: (b: ServiceBilling) => void }) {
  const b = cleanBilling(billing);
  const set = (p: Partial<ServiceBilling>) => onChange({ ...b, ...p });
  const manual = b.start === 'manual';
  return (
    <div className="mt-4 space-y-3 border-t border-[#ECEAF4] pt-4">
      <span className="inline-block rounded-full border border-[#D8D5E6] px-3 py-1 text-xs text-[#261E5A]">{billingBadge(b)}</span>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Billed" isSelect>
          <select className={sel} value={b.cadence} onChange={(e) => set({ cadence: e.target.value as ServiceBilling['cadence'] })} disabled={manual}>
            <option value="monthly">Monthly, over the service term</option>
            <option value="one_time">One time</option>
          </select>
        </Field>
        <Field label="Invoice at" isSelect>
          <select className={sel} value={b.timing} onChange={(e) => set({ timing: e.target.value as ServiceBilling['timing'] })} disabled={manual || b.start === 'date'}>
            <option value="start">The start of the billing cycle</option>
            <option value="end">The end of the billing cycle</option>
          </select>
        </Field>
        <Field label="Billing day" isSelect>
          <select className={sel} value={b.day ?? ''} onChange={(e) => set({ day: e.target.value ? Number(e.target.value) : null })} disabled={manual || b.start === 'date'}>
            <option value="">Account default</option>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>Day {d} of each month</option>)}
          </select>
        </Field>
        <Field label="Starting" isSelect>
          <select className={sel} value={b.start} onChange={(e) => set({ start: e.target.value as ServiceBilling['start'] })}>
            <option value="next">On the next scheduled billing date</option>
            <option value="date">On a specific date</option>
            <option value="manual">Only after manual initiation</option>
          </select>
        </Field>
      </div>
      {b.start === 'date' && (
        <input type="date" aria-label="First invoice date" value={b.start_date} onChange={(e) => set({ start_date: e.target.value })} className="w-full border border-[#D8D5E6] text-sm text-[#261E5A]" />
      )}
      <p className="text-xs text-[#6E6A8A]">
        {b.start === 'next' && 'The first invoice goes out on the next billing day after the agreement takes effect.'}
        {b.start === 'date' && 'The first invoice goes out on this exact date. Later invoices follow monthly. Past dates are invoiced right away.'}
        {manual && 'Nothing is invoiced for this service until someone starts billing in Get Paid.'}
      </p>
    </div>
  );
}
