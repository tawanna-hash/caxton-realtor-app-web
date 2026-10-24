'use client';

// Anchor-style single-page agreement builder: details, services, note, reference
// fields, billing timeline panel, client preview, save as template, send.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { A, RowMenu } from '@/components/anchor/ui';
import { DEFAULT_BILLING, DEFAULT_PAYMENT, billingBadge, cleanBilling, termMonths, type ServiceBilling } from '@/lib/agreements-v2/service-billing';
import {
  EMPTY_DOC, defaultPriceCents, discountedCents, docProblems, docTotalCents, optionDefs, optionOf, orderedServices, quotePayload,
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
const discountNote = (s: Pick<ServiceLine, 'discount'>) => (s.discount ? (s.discount.type === 'pct' ? `${s.discount.value}% off` : `$${s.discount.value} off`) : '');
const uid = () => Math.random().toString(36).slice(2, 10);

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[10px] bg-white shadow-xl">
        <div className="relative bg-[color:var(--ds-selected)] px-4 py-5 text-center sm:px-6">
          <h2 className="text-lg font-semibold text-[color:var(--ds-ink)]">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="absolute right-4 top-4 text-xl leading-none text-[color:var(--ds-ink)]">×</button>
        </div>
        <div className="space-y-4 px-4 py-5 sm:px-6 sm:py-6">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, isSelect }: { label: string; children: React.ReactNode; isSelect?: boolean }) {
  return (
    <label className="relative block">
      <span className="pointer-events-none absolute -top-2 left-3 z-10 bg-white px-1 text-xs text-[color:var(--ds-primary)]">{label}</span>
      {children}
      
    </label>
  );
}

const sel = `${A.input} appearance-none pr-9`;

/** True when the builder is open inside the pop-up (iframe). */
const inPopup = () => typeof window !== 'undefined' && window.self !== window.top;
/** Leave the builder: close the pop-up when embedded, otherwise go to the page. */
function leaveTo(router: { push: (p: string) => void }, path: string) {
  if (inPopup()) window.parent.postMessage({ type: 'builder-close', to: path }, window.location.origin);
  else router.push(path);
}

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
  const [activeOpt0, setActiveOpt] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const opts = doc.options?.length ? doc.options : ['Option 1'];
  const activeOpt = Math.min(activeOpt0, opts.length - 1);
  const activeServices = doc.services.filter((x) => optionOf(x, opts.length) === activeOpt);

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
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [sendMenu, setSendMenu] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [sentInfo, setSentInfo] = useState<{ to: string; link: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const update = useCallback((patch: Partial<BuilderDoc>) => {
    dirty.current = true;
    setCreatedId(null);
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
          if (j.draft) { setDoc({ ...EMPTY_DOC, ...j.draft.doc, name: j.draft.doc.name || j.draft.name || '', payment: { ...DEFAULT_PAYMENT, ...(j.draft.doc.payment ?? {}) } }); if (draft) setDraftId(draft); }
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
          body: JSON.stringify({ action: 'timeline', doc: { ...doc, services: activeServices, options: [opts[activeOpt] ?? 'Option 1'] }, sign_date: signDate }),
        });
        setTimeline(await r.json());
        setMonth(0);
      } catch { setTimeline({ ok: false, reason: 'Could not build the timeline.' }); }
    }, 400);
    return () => window.clearTimeout(t);
  }, [panel, doc, signDate, activeOpt]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = docTotalCents({ services: activeServices });
  const problems = useMemo(() => docProblems({ ...doc, options: opts }), [doc]); // eslint-disable-line react-hooks/exhaustive-deps
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

  /** Creates the agreement and saves its details. Nothing is emailed. */
  async function createAgreement(): Promise<string> {
    const q = await fetch('/api/admin/quotes', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(quotePayload({ ...doc, options: opts }, firstPub)),
    });
    const qj = await q.json();
    if (!q.ok) throw new Error(qj.error || qj.message || `Could not create the agreement (HTTP ${q.status})`);
    const agreementId = (qj.agreement ?? qj).id as string;
    const m = await fetch(`/api/admin/agreements-v2/${agreementId}`, {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'save_meta',
        meta: {
          name: doc.name, intro: doc.intro, note: doc.note, ask_address: doc.ask_address,
          expires_days: doc.expires ? doc.expires_days : null,
          refs: doc.refs,
          services: orderedServices({ services: doc.services, options: opts }).map((sv, i) => ({ line_no: i + 1, name: sv.name, description: sv.description, billing: { ...cleanBilling(sv.billing), term_months: termMonths(sv) }, ...(sv.optional ? { optional: true } : {}), ...(sv.discount ? { discount_note: discountNote(sv) } : {}) })),
          payment: doc.payment,
          options: optionDefs({ services: doc.services, options: opts }),
        },
      }),
    });
    if (!m.ok) throw new Error('The agreement was created but its details could not be saved.');
    setCreatedId(agreementId);
    return agreementId;
  }

  async function finishDraft() {
    if (draftId) await fetch('/api/admin/agreements-v2/builder', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: draftId }) });
  }

  async function send() {
    setBusy(true); setError(null);
    let agreementId: string | null = createdId;
    try {
      agreementId = agreementId ?? (await createAgreement());
      const s = await fetch(`/api/admin/new-partner-v2/${agreementId}`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'send' }),
      });
      const sj = await s.json();
      if (!s.ok || sj.ok === false) throw new Error(sj.error || 'The agreement was created but the email did not send.');
      await finishDraft();
      setDraftId(null);
      let link: string | null = null;
      try {
        const pr = await fetch(`/api/admin/new-partner-v2/${agreementId}`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'preview' }) });
        const pj = await pr.json();
        if (pr.ok && pj.link) link = pj.link as string;
      } catch { /* the link is optional on this screen */ }
      setSendOpen(false);
      setSentInfo({ to: (sj.sent_to as string | undefined) ?? doc.name ?? 'your partner', link });
    } catch (e) {
      setSendOpen(false);
      setError(`${e instanceof Error ? e.message : 'Send failed.'}${agreementId ? ' The agreement is saved in Partners; you can send it from there.' : ''}`);
    } finally { setBusy(false); }
  }

  /** Share by link: creates the agreement and shows the partner link. No email is sent. */
  async function share() {
    setBusy(true); setError(null);
    try {
      const id = createdId ?? (await createAgreement());
      const r = await fetch(`/api/admin/new-partner-v2/${id}`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'preview' }),
      });
      const j = await r.json();
      if (!r.ok || !j.link) throw new Error(j.error || 'Could not create the link.');
      setShareLink(j.link as string);
      await finishDraft();
      setDraftId(null);
    } catch (e) {
      setShareOpen(false);
      setError(e instanceof Error ? e.message : 'Could not create the link.');
    } finally { setBusy(false); }
  }

  async function discard() {
    setBusy(true);
    try { await finishDraft(); } finally { leaveTo(router, '/admin/agreements/renewals-v2'); }
  }

  const svcLabel = (s: ServiceLine) => s.name || 'Service';

  return (
    <div className="min-h-screen bg-[color:var(--ds-page)]" data-anchor-ui="true" data-no-auto-open>
      {/* Top bar */}
      <div className="sticky top-0 z-40 flex flex-wrap items-center gap-3 border-b border-[color:var(--ds-line)] bg-white px-4 py-3">
        <button type="button" aria-label="Close builder" onClick={() => leaveTo(router, '/admin/agreements/renewals-v2')} style={{ border: 0, background: 'transparent' }} className="text-2xl leading-none text-[color:var(--ds-ink)]">×</button>
        <h1 className={A.title}>Create agreement</h1>
        {saveState !== 'idle' && (
          <span className="rounded-full border border-green-600 px-2.5 py-0.5 text-xs text-green-700">{saveState === 'saving' ? 'Saving…' : 'Draft saved'}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <RowMenu label="More actions" items={[
            { label: panel ? 'Hide billing timeline' : 'Show billing timeline', onClick: () => setPanel((p) => !p) },
            { label: 'Save as template', onClick: () => { setTplName(doc.name); setTplOpen(true); } },
            { label: 'Discard draft', onClick: () => setDiscardOpen(true), danger: true },
          ]} />
          <button type="button" className={A.outline} onClick={() => setPreviewOpen(true)}>Preview</button>
          <div className="relative flex">
            <button type="button" className={A.primary} disabled={problems.length > 0 || busy} onClick={() => setSendOpen(true)} title={problems[0]}>Send</button>
            <button type="button" aria-label="More send options" aria-haspopup="menu" aria-expanded={sendMenu} className={`${A.primary} ml-px px-3 text-base leading-none`} disabled={problems.length > 0 || busy} onClick={() => { setSendMenu((o) => !o); }}>▾</button>
            {sendMenu && (
              <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-56 rounded-[10px] border border-[color:var(--ds-line)] bg-white p-1 shadow-lg">
                <button type="button" role="menuitem" className="w-full rounded-[10px] px-3 py-2 text-left text-sm text-[color:var(--ds-ink)]" style={{ border: 0, background: 'transparent' }} onClick={() => { setSendMenu(false); setSendOpen(true); }}>Send now by email</button>
                <button type="button" role="menuitem" className="w-full rounded-[10px] px-3 py-2 text-left text-sm text-[color:var(--ds-ink)]" style={{ border: 0, background: 'transparent' }} onClick={() => { setSendMenu(false); setShareOpen(true); }}>Share by link</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 lg:flex-row">
        {panel && (
          <aside className="w-full shrink-0 self-start lg:w-[380px] rounded-[10px] bg-white" aria-label="Billing timeline">
            <div className="flex items-start justify-between p-4">
              <div><h2 className="font-semibold text-[color:var(--ds-ink)]">Billing timeline</h2><p className="text-xs text-[color:var(--ds-body)]">For automatically billed services</p></div>
              <button type="button" aria-label="Close" onClick={() => setPanel(false)} className="text-xl leading-none text-[color:var(--ds-ink)]">×</button>
            </div>
            <div className="px-4">
              <Field label="Simulate sign date">
                <input type="date" value={signDate} onChange={(e) => setSignDate(e.target.value || today())} className="mt-0 w-full border border-[color:var(--ds-primary)] text-sm text-[color:var(--ds-ink)]" />
              </Field>
            </div>
            {timeline && !timeline.ok && <p className="p-4 text-sm text-[color:var(--ds-body)]">{timeline.reason}</p>}
            {timeline && timeline.ok && (
              <div className="p-4">
                <div className="grid grid-cols-3 gap-2 text-xs text-[color:var(--ds-body)]">
                  <div><div>First invoice</div><div className="text-lg font-semibold text-[color:var(--ds-ink)]">{money(timeline.first_invoice.cents)}</div><div>{fmtDay(timeline.first_invoice.date)}</div></div>
                  <div><div>Annual recurring</div><div className="text-lg font-semibold text-[color:var(--ds-ink)]">{money(timeline.recurring_annual_cents)}</div><div>per year</div></div>
                  <div><div>Contract value</div><div className="text-lg font-semibold text-[color:var(--ds-ink)]">{money(timeline.total_cents)}</div><div>{timeline.invoices.length} invoices</div></div>
                </div>
                <div className="mt-4 flex rounded-full bg-[color:var(--ds-page)] p-1 text-sm" role="tablist">
                  {([['overview', 'Overview'], ['service', 'By service'], ['invoice', 'By invoice']] as const).map(([k, l]) => (
                    <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`flex-1 rounded-[10px] px-2 py-1.5 ${tab === k ? 'bg-white font-medium text-[color:var(--ds-ink)] shadow' : 'text-[color:var(--ds-body)]'}`} style={{ border: 0 }}>{l}</button>
                  ))}
                </div>
                {tab === 'overview' && (() => {
                  const max = Math.max(...timeline.invoices.map((i) => i.total), 1);
                  return (
                    <div className="mt-4 flex h-40 items-end gap-1.5 border-b border-[color:var(--ds-line)]">
                      {timeline.invoices.slice(0, 12).map((i) => (
                        <div key={i.date} className="flex flex-1 flex-col items-center justify-end" title={`${fmtDay(i.date)} ${money(i.total)}`}>
                          <div className="w-full rounded-t bg-[color:var(--ds-primary)]" style={{ height: `${Math.max(6, (i.total / max) * 100)}%` }} />
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {tab === 'overview' && <div className="mt-1 flex gap-1.5 text-[10px] text-[color:var(--ds-body)]">{timeline.invoices.slice(0, 12).map((i) => <span key={i.date} className="flex-1 text-center">{new Date(`${i.date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</span>)}</div>}
                {tab === 'service' && (
                  <ul className="mt-4 space-y-3 text-sm">
                    {timeline.services.map((sv, i) => (
                      <li key={i}>
                        <div className="font-medium text-[color:var(--ds-ink)]">{sv.label}</div>
                        {sv.manual ? <p className="mt-1 text-xs text-[color:var(--ds-body)]">Billed manually. Nothing is scheduled.</p> : (
                          <div className="mt-1 flex flex-wrap gap-1">{sv.dates.slice(0, 12).map((d) => <span key={d} className="rounded-full bg-[color:var(--ds-selected)] px-2 py-0.5 text-xs text-[color:var(--ds-ink)]">{new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</span>)}</div>
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
                        <span className="text-sm font-semibold text-[color:var(--ds-ink)]">{new Date(`${inv.date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })}</span>
                        <button type="button" aria-label="Next invoice" disabled={month >= timeline.invoices.length - 1} onClick={() => setMonth((m) => m + 1)} className={`${A.small} disabled:opacity-40`}>›</button>
                      </div>
                      <div className="mt-3 rounded-[10px] bg-[color:var(--ds-page)] p-4 text-sm">
                        <div className="text-xs text-[color:var(--ds-body)]">{fmtDay(inv.date)} · due {fmtDay(inv.due)}</div>
                        {inv.items.map((it, i) => <div key={i} className="mt-2 flex justify-between gap-3 text-[color:var(--ds-ink)]"><span>{it.label}</span><span>{money(it.cents)}</span></div>)}
                        <div className="mt-3 flex justify-between border-t border-[color:var(--ds-line)] pt-2 font-semibold text-[color:var(--ds-ink)]"><span>Total</span><span>{money(inv.total)}</span></div>
                      </div>
                    </div>
                  );
                })()}
                {timeline.manual_labels.length > 0 && <p className="mt-3 text-xs text-[color:var(--ds-body)]">Billed manually, not in this schedule: {timeline.manual_labels.join(', ')}.</p>}
                <p className="mt-4 text-xs text-[color:var(--ds-body)]">Partners who pay by card are charged {money(timeline.card_today_cents)} (3% surcharge included) when they sign. Invoices apply to partners who pay by check.</p>
              </div>
            )}
          </aside>
        )}

        <main className="mx-auto w-full max-w-2xl space-y-6">
          {error && <div className={A.error} role="alert">{error}</div>}

          {/* Agreement details */}
          <section className={`${A.card} overflow-visible`}>
            <h2 className="border-b border-[color:var(--ds-line)] px-6 py-4 text-lg font-semibold text-[color:var(--ds-ink)]">Agreement details</h2>
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
              <hr className="border-[color:var(--ds-line)]" />
              <Field label="Agreement effective date" isSelect>
                <select className={sel} value={doc.effective} onChange={(e) => update({ effective: e.target.value as BuilderDoc['effective'] })}>
                  <option value="acceptance">On acceptance</option>
                  <option value="date">On a specific date</option>
                </select>
              </Field>
              {doc.effective === 'date' && (
                <input type="date" aria-label="Effective date" min={today()} value={doc.effective_date} onChange={(e) => update({ effective_date: e.target.value })} className="w-full border border-[color:var(--ds-line)] text-sm text-[color:var(--ds-ink)]" />
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
              <p className="-mt-3 text-xs text-[color:var(--ds-body)]">Use {'{first_name}'} and {'{company}'} to personalize.</p>
              <label className="flex items-center gap-3 text-sm text-[color:var(--ds-ink)]">
                <input type="checkbox" className="h-4 w-4 accent-[color:var(--ds-primary)]" checked={doc.expires} onChange={(e) => update({ expires: e.target.checked })} />
                Set an expiration for this agreement
                {doc.expires && (
                  <span className="ml-2 inline-flex items-center gap-2">
                    <input type="number" min={1} max={365} aria-label="Days until expiry" value={doc.expires_days} onChange={(e) => update({ expires_days: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })} className="w-20 rounded-[10px] border border-[color:var(--ds-line)] px-2 py-1 text-sm" />
                    days after sending
                  </span>
                )}
              </label>
            </div>
          </section>

          {/* Services */}
          <section className={A.card}>
            <h2 className="border-b border-[color:var(--ds-line)] px-6 py-4 text-lg font-semibold text-[color:var(--ds-ink)]">Services provided</h2>
            <div className="space-y-3 p-6">
              <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Packages">
                {opts.map((name, o) => (
                  <button key={o} type="button" role="tab" aria-selected={o === activeOpt} onClick={() => { setActiveOpt(o); setRenaming(false); }} className={`rounded-[10px] border px-4 py-2 text-sm ${o === activeOpt ? 'border-[color:var(--ds-primary)] bg-[color:var(--ds-selected)] font-medium text-[color:var(--ds-ink)]' : 'border-[color:var(--ds-line)] text-[color:var(--ds-body)]'}`}>
                    {name || `Option ${o + 1}`} <span className="ml-1 text-xs">{money(docTotalCents({ services: doc.services, options: opts }, o))}</span>
                  </button>
                ))}
                {opts.length < 4 && <button type="button" className={A.small} onClick={() => { update({ options: [...opts, `Option ${opts.length + 1}`] }); setActiveOpt(opts.length); }}>+ Add package</button>}
              </div>
              {opts.length > 1 && <p className="text-xs text-[color:var(--ds-body)]">The client picks one package, then approves it. Each package has its own services and total.</p>}
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {renaming ? (
                  <>
                    <input className={`${A.input} max-w-xs`} value={opts[activeOpt]} onChange={(e) => update({ options: opts.map((n, o) => (o === activeOpt ? e.target.value : n)) })} aria-label="Package name" />
                    <button type="button" className={A.small} onClick={() => setRenaming(false)}>Done</button>
                  </>
                ) : (
                  <>
                    <RowMenu label="Package options" items={[
                      { label: 'Rename package', onClick: () => setRenaming(true) },
                      { label: 'Duplicate package', disabled: opts.length >= 4, onClick: () => { if (opts.length >= 4) return; const idx = opts.length; update({ options: [...opts, `${opts[activeOpt]} copy`], services: [...doc.services, ...activeServices.map((x) => ({ ...x, id: uid(), option: idx }))] }); setActiveOpt(idx); } },
                      ...(opts.length > 1 ? [{ label: 'Remove package', danger: true, onClick: () => { update({ options: opts.filter((_, o) => o !== activeOpt), services: doc.services.filter((x) => optionOf(x, opts.length) !== activeOpt).map((x) => ({ ...x, option: optionOf(x, opts.length) > activeOpt ? optionOf(x, opts.length) - 1 : optionOf(x, opts.length) })) }); setActiveOpt(0); } }] : []),
                    ]} />
                  </>
                )}
              </div>
              {activeServices.length === 0 && <p className="text-sm text-[color:var(--ds-body)]">No services yet. Add the products this agreement covers.</p>}
              {doc.services.map((s, i) => optionOf(s, opts.length) !== activeOpt ? null : (
                <div key={s.id} className="rounded-[10px] bg-[color:var(--ds-page)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-[color:var(--ds-ink)]">{svcLabel(s)}{s.optional && <span className="ml-2 rounded-full border border-[color:var(--ds-line)] px-2 py-0.5 text-[10px] font-normal text-[color:var(--ds-body)]">Optional</span>}</div>
                      {s.discount && s.list_cents ? <div className="text-xs text-green-700">{discountNote(s)}</div> : null}
                      {s.description && <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-[color:var(--ds-body)]">{s.description}</p>}
                    </div>
                    <div className="text-right font-semibold text-[color:var(--ds-ink)]">{s.discount && s.list_cents ? <div className="text-xs font-normal text-[color:var(--ds-body)] line-through">{money(s.list_cents)}</div> : null}{money(s.price_cents)}</div>
                  </div>
                  <BillingControls billing={s.billing ?? DEFAULT_BILLING} onChange={(b) => update({ services: doc.services.map((x) => (x.id === s.id ? { ...x, billing: b } : x)) })} />
                  <div className="mt-3 flex items-center gap-2">
                    <button type="button" className={A.small} onClick={() => setEditIdx(i)}>Edit service</button>
                    <RowMenu items={[{ label: 'Remove service', onClick: () => update({ services: doc.services.filter((x) => x.id !== s.id) }), danger: true }]} />
                  </div>
                </div>
              ))}
              <button type="button" className="text-sm font-medium text-[color:var(--ds-primary)]" style={{ border: 0, background: 'transparent' }} onClick={() => setAddOpen(true)} disabled={!catalog}>+ Create service</button>
              {doc.services.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--ds-line)] pt-3 text-sm text-[color:var(--ds-ink)]">
                  <span>Billing schedule display for automatic services</span>
                  <div className="inline-flex rounded-full bg-[color:var(--ds-page)] p-1" role="group" aria-label="Billing schedule display">
                    {([['timeline', 'Timeline'], ['occurrence', 'By billing occurrence']] as const).map(([k, l]) => (
                      <button key={k} type="button" aria-pressed={doc.payment.schedule_view === k} onClick={() => update({ payment: { ...doc.payment, schedule_view: k } })} className={`rounded-[10px] px-4 py-1.5 text-xs ${doc.payment.schedule_view === k ? 'bg-white font-medium text-[color:var(--ds-ink)] shadow' : 'text-[color:var(--ds-body)]'}`} style={{ border: 0 }}>{l}</button>
                    ))}
                  </div>
                </div>
              )}
              {doc.services.length > 0 && <div className="flex justify-between border-t border-[color:var(--ds-line)] pt-3 text-sm font-semibold text-[color:var(--ds-ink)]"><span>{opts.length > 1 ? `${opts[activeOpt] || 'Package'} total` : 'Agreement total'}</span><span>{money(total)}</span></div>}
            </div>
          </section>

          {/* Note */}
          <section className={A.card}>
            <div className="space-y-4 p-6">
              <label className="flex items-center gap-3 text-sm text-[color:var(--ds-ink)]">
                <input type="checkbox" className="h-4 w-4 accent-[color:var(--ds-primary)]" checked={doc.ask_address} onChange={(e) => update({ ask_address: e.target.checked })} />
                Ask my client to provide their address
              </label>
              <div>
                <div className="mb-1 text-sm text-[color:var(--ds-ink)]">Add a note to your agreement (optional)</div>
                <textarea className={`${A.input} min-h-[160px]`} value={doc.note} placeholder="Add here anything you need that's not specified elsewhere" onChange={(e) => update({ note: e.target.value })} />
              </div>
            </div>
          </section>

          {/* Payment settings */}
          <section className={A.card}>
            <h2 className="border-b border-[color:var(--ds-line)] px-6 py-4 text-lg font-semibold text-[color:var(--ds-ink)]">Payment settings</h2>
            <div className="space-y-6 p-6 text-sm text-[color:var(--ds-ink)]">
              <div>
                <div className="mb-2 font-medium">Payment methods the client can choose</div>
                <label className="flex items-center gap-3"><input type="checkbox" className="h-4 w-4 accent-[color:var(--ds-primary)]" checked={doc.payment.card} onChange={(e) => update({ payment: { ...doc.payment, card: e.target.checked } })} />Credit card <span className="text-[color:var(--ds-body)]">(3% surcharge added, charged when they sign)</span></label>
                <label className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[color:var(--ds-ink)]">Annual price increase
                  <input type="number" min={0} max={2} step="0.25" className={`${A.input} w-24`} value={doc.payment.annual_increase_pct || ''} placeholder="0" onChange={(e) => update({ payment: { ...doc.payment, annual_increase_pct: Math.min(2, Math.max(0, Number(e.target.value) || 0)) } })} aria-label="Annual price increase percent" />
                  <span className="text-[color:var(--ds-body)]">% each year after the first (limit 2%). Applies to services that run longer than 12 months.</span>
                </label>
                <label className="mt-2 flex items-center gap-3"><input type="checkbox" className="h-4 w-4 accent-[color:var(--ds-primary)]" checked={doc.payment.bank_now} onChange={(e) => update({ payment: { ...doc.payment, bank_now: e.target.checked } })} />Bank account (ACH), pay now <span className="text-[color:var(--ds-body)]">(debited at signing, partner pays the bank fee: 0.8%, max $5)</span></label>
                <label className="mt-2 flex items-center gap-3"><input type="checkbox" className="h-4 w-4 accent-[color:var(--ds-primary)]" checked={doc.payment.bank_invoice} onChange={(e) => update({ payment: { ...doc.payment, bank_invoice: e.target.checked } })} />Invoiced, pay each invoice by bank (print only, due within 20 days) <span className="text-[color:var(--ds-body)]">(any product; nothing charged at signing)</span></label>
                <label className="mt-2 flex items-center gap-3"><input type="checkbox" className="h-4 w-4 accent-[color:var(--ds-primary)]" checked={doc.payment.check} onChange={(e) => update({ payment: { ...doc.payment, check: e.target.checked } })} />Check <span className="text-[color:var(--ds-body)]">(print: invoiced, due within 20 days. eBlast and app: needs your approval, and service is held until the check is received)</span></label>
              </div>
              <Field label="Number of days until the payment is due" isSelect>
                <select className={sel} value={doc.payment.due_days ?? ''} onChange={(e) => update({ payment: { ...doc.payment, due_days: e.target.value === '' ? null : Number(e.target.value) } })}>
                  <option value="">Account default</option>
                  <option value={0}>Upon receipt of invoice</option>
                  {[1, 2, 3, 5, 7, 10, 14, 15, 20, 30, 45, 60].map((d) => <option key={d} value={d}>{d} {d === 1 ? 'day' : 'days'}</option>)}
                </select>
              </Field>
              <label className="flex items-center gap-3"><input type="checkbox" className="h-4 w-4 accent-[color:var(--ds-primary)]" checked={doc.payment.show_schedule} onChange={(e) => update({ payment: { ...doc.payment, show_schedule: e.target.checked } })} />Show the billing schedule to the client</label>
            </div>
          </section>

          {/* Reference fields */}
          <section className={A.card}>
            <button type="button" className="flex w-full items-center justify-between px-6 py-4 text-left" style={{ border: 0, background: 'transparent' }} aria-expanded={refsOpen} aria-haspopup="true" onClick={() => setRefsOpen((o) => !o)}>
              <span className="text-lg font-semibold text-[color:var(--ds-ink)]">Reference fields</span>
              <span className={`text-[color:var(--ds-ink)] ${refsOpen ? 'rotate-180' : ''}`} aria-hidden="true">⌃</span>
            </button>
            {refsOpen && (
              <div className="space-y-4 border-t border-[color:var(--ds-line)] p-6">
                {doc.refs.map((r, i) => (
                  <div key={i} className="space-y-3">
                    <div className="flex items-center gap-3">
                      <input className={A.input} placeholder="Reference field name" value={r.name} onChange={(e) => update({ refs: doc.refs.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} />
                      <input className={A.input} placeholder="Value" value={r.value} onChange={(e) => update({ refs: doc.refs.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)) })} />
                      <button type="button" aria-label="Remove reference field" className="text-xl text-[color:var(--ds-ink)]" style={{ border: 0, background: 'transparent' }} onClick={() => update({ refs: doc.refs.filter((_, k) => k !== i) })}>×</button>
                    </div>
                    <div className="inline-flex rounded-full bg-[color:var(--ds-page)] p-1 text-sm" role="group" aria-label="Visibility">
                      {([true, false] as const).map((cf) => (
                        <button key={String(cf)} type="button" aria-pressed={r.client_facing === cf} onClick={() => update({ refs: doc.refs.map((x, k) => (k === i ? { ...x, client_facing: cf } : x)) })} className={`rounded-[10px] px-4 py-1.5 ${r.client_facing === cf ? 'bg-white font-medium text-[color:var(--ds-ink)] shadow' : 'text-[color:var(--ds-body)]'}`} style={{ border: 0 }}>{cf ? 'Client-facing' : 'Internal'}</button>
                      ))}
                    </div>
                  </div>
                ))}
                <button type="button" className="text-sm font-medium text-[color:var(--ds-primary)]" style={{ border: 0, background: 'transparent' }} onClick={() => update({ refs: [...doc.refs, { name: '', value: '', client_facing: false }] })}>⊕ Add reference field</button>
              </div>
            )}
          </section>

          {templates.length > 0 && (
            <p className="text-sm text-[color:var(--ds-body)]">Start from a saved template: {templates.map((t) => <a key={t.id} href={`/admin/agreements/renewals-v2/new?template=${t.id}${inPopup() ? '&embed=1' : ''}`} className="mr-3 text-[color:var(--ds-primary)] underline">{t.name}</a>)}</p>
          )}
        </main>
      </div>

      {/* Add service */}
      {addOpen && catalog && <ServiceModal catalog={catalog} onClose={() => setAddOpen(false)} onSave={(s) => { update({ services: [...doc.services, { ...s, option: activeOpt }] }); setAddOpen(false); }} />}

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
          <p className="text-xs text-[color:var(--ds-body)]">Saves the services, message, note and reference fields. The client is not saved.</p>
          <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row"><button type="button" className={A.outline} onClick={() => setTplOpen(false)}>Cancel</button><button type="button" className={A.primary} disabled={!tplName.trim() || busy} onClick={saveTemplate}>Save</button></div>
        </Modal>
      )}

      {/* Client preview */}
      {previewOpen && (
        <PreviewModal
          doc={{ ...doc, services: activeServices }}
          intro={doc.intro.replace('{first_name}', doc.new_client?.contact?.split(' ')[0] || 'there').replace('{company}', doc.new_client?.name || client?.name || 'your company')}
          preparedFor={doc.new_client?.name || client?.name || ''}
          total={total}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      {/* Share by link */}
      {sentInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Agreement sent">
          <div className="w-full max-w-4xl overflow-hidden rounded-[10px] bg-white shadow-xl">
            <div className="relative px-4 py-8 text-center sm:px-8">
              <button type="button" aria-label="Close" onClick={() => leaveTo(router, '/admin/agreements/renewals-v2?tab=sent')} className="absolute right-4 top-4 text-xl leading-none text-[color:var(--ds-ink)]">×</button>
              <svg className="mx-auto" width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true"><circle cx="32" cy="32" r="22" stroke="#047857" strokeWidth="4" opacity=".7" /><path d="M22 33l7 7 14-15" stroke="#047857" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <h2 className="mt-4 text-2xl font-semibold text-[color:var(--ds-ink)]">Agreement Sent</h2>
              <p className="mt-1 text-base text-[color:var(--ds-ink)]">Your agreement was emailed to {sentInfo.to}</p>
            </div>
            <div className="bg-[color:var(--ds-page)] px-4 py-6 sm:px-8">
              <h3 className="text-center text-xl font-semibold text-[color:var(--ds-ink)]">What&apos;s Next?</h3>
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { t: 'Share', d: 'Use a different channel to share this agreement', b: copied ? 'Link Copied' : 'Copy Link', disabled: !sentInfo.link, go: async () => { if (sentInfo.link) { await navigator.clipboard.writeText(sentInfo.link); setCopied(true); } } },
                  { t: 'Monitor', d: 'Keep track of the approval process', b: 'Review Progress', go: () => leaveTo(router, '/admin/agreements/renewals-v2?tab=sent') },
                  { t: 'Create Another Agreement', d: 'Ready to send another one? Go for it', b: 'Create Agreement', go: () => { window.location.href = `/admin/agreements/renewals-v2/new${inPopup() ? '?embed=1' : ''}`; } },
                  { t: 'Back To My Dashboard', d: 'Go back to your dashboard and continue working', b: 'Go To Dashboard', go: () => leaveTo(router, '/admin') },
                ].map((c) => (
                  <div key={c.t} className="flex flex-col items-center rounded-[10px] bg-white p-4 text-center">
                    <div className="text-sm font-semibold text-[color:var(--ds-ink)]">{c.t}</div>
                    <p className="mt-2 flex-1 text-xs text-[color:var(--ds-body)]">{c.d}</p>
                    <button type="button" className={`${A.outline} mt-4`} disabled={'disabled' in c && c.disabled} onClick={() => { void c.go(); }}>{c.b}</button>
                  </div>
                ))}
              </div>
            </div>
            <p className="px-4 py-4 text-center text-sm text-[color:var(--ds-ink)] sm:px-8"><span className="font-semibold">Did you know?</span> You can update an agreement. Once approved, you can add new services or make changes to services and terms.</p>
          </div>
        </div>
      )}
      {shareOpen && (
        <Modal title="Share by link" onClose={() => { if (busy) return; setShareOpen(false); if (shareLink) leaveTo(router, '/admin/agreements/renewals-v2'); }}>
          {!shareLink ? (
            <>
              <p className="text-sm text-[color:var(--ds-ink)]">This creates the agreement for {client?.name ?? doc.new_client?.name} and gives you a link to share yourself. No email is sent. Total {money(total)}.</p>
              <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row"><button type="button" className={A.outline} disabled={busy} onClick={() => setShareOpen(false)}>Cancel</button><button type="button" className={A.primary} disabled={busy} onClick={share}>{busy ? 'Creating…' : 'Create link'}</button></div>
            </>
          ) : (
            <>
              <p className="text-sm text-[color:var(--ds-ink)]">Your link is ready. The agreement is also listed under New partners.</p>
              <input className={A.input} readOnly value={shareLink} aria-label="Agreement link" onFocus={(e) => e.currentTarget.select()} />
              <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
                <button type="button" className={A.outline} onClick={async () => { await navigator.clipboard.writeText(shareLink); setCopied(true); }}>{copied ? 'Copied' : 'Copy link'}</button>
                <button type="button" className={A.primary} onClick={() => leaveTo(router, '/admin/agreements/renewals-v2')}>Done</button>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* Discard draft */}
      {discardOpen && (
        <Modal title="Discard draft" onClose={() => !busy && setDiscardOpen(false)}>
          <p className="text-sm text-[color:var(--ds-ink)]">This permanently deletes this draft. Agreements already created are not affected.</p>
          <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row"><button type="button" className={A.outline} disabled={busy} onClick={() => setDiscardOpen(false)}>Cancel</button><button type="button" className={A.primary} disabled={busy} onClick={discard}>Discard</button></div>
        </Modal>
      )}

      {/* Send */}
      {sendOpen && (
        <Modal title="Send agreement" onClose={() => !busy && setSendOpen(false)}>
          <p className="text-sm text-[color:var(--ds-ink)]">
            This creates the agreement for {client?.name ?? doc.new_client?.name} and emails the review link to {client?.contact_email ?? doc.new_client?.email}. Total {money(total)}.
          </p>
          <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row"><button type="button" className={A.outline} disabled={busy} onClick={() => setSendOpen(false)}>Cancel</button><button type="button" className={A.primary} disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Send'}</button></div>
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Ad size" isSelect><select className={sel} value={size} onChange={(e) => { setSize(e.target.value); setPrice(null); }}>{catalog.print.find((p) => p.id === pkg)?.sizes.map((s) => <option key={s.size} value={s.size}>{s.size}</option>)}</select></Field>
          <Field label="Months"><input type="number" min={1} max={24} className={A.input} value={months} onChange={(e) => { setMonths(Math.max(1, Math.min(24, Number(e.target.value) || 1))); setPrice(null); }} /></Field>
        </div>
      )}
      {channel === 'email' && <Field label="Sends"><input type="number" min={1} max={52} className={A.input} value={sends} onChange={(e) => { setSends(Math.max(1, Math.min(52, Number(e.target.value) || 1))); setPrice(null); }} /></Field>}
      {channel === 'app' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Weeks"><input type="number" min={1} max={52} className={A.input} value={weeks} onChange={(e) => { setWeeks(Math.max(1, Math.min(52, Number(e.target.value) || 1))); setPrice(null); }} /></Field>
          <Field label="Markets" isSelect><select className={sel} value={markets} onChange={(e) => { setMarkets(Number(e.target.value) as 1 | 2 | 3 | 4); setPrice(null); }}>{[1, 2, 3, 4].map((m) => <option key={m} value={m}>{m}</option>)}</select></Field>
        </div>
      )}
      <Field label="Publication" isSelect><select className={sel} value={pub} onChange={(e) => { setPub(e.target.value as Pub); setPrice(null); }}>{(Object.keys(PUB_LABEL) as Pub[]).map((p) => <option key={p} value={p}>{PUB_LABEL[p]}</option>)}</select></Field>
      <Field label="Price (USD)"><input type="number" min={0} step="0.01" className={A.input} value={price ?? (suggested / 100).toString()} onChange={(e) => setPrice(e.target.value)} /></Field>
      <p className="text-xs text-[color:var(--ds-body)]">The price starts at the media kit rate. Change it to give a custom price.</p>
      <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
        <button type="button" className={A.outline} onClick={onClose}>Cancel</button>
        <button type="button" className={A.primary} disabled={!pkg || cents <= 0} onClick={() => onSave({ id: uid(), channel, package_id: pkg, size: channel === 'print' ? size : undefined, months: channel === 'print' ? months : undefined, sends: channel === 'email' ? sends : undefined, app_weeks: channel === 'app' ? weeks : undefined, app_markets: channel === 'app' ? markets : undefined, publication: pub, price_cents: cents, name: label, description: '' })}>Save</button>
      </div>
    </Modal>
  );
}

function EditServiceModal({ service, onClose, onSave }: { service: ServiceLine; onClose: () => void; onSave: (p: Partial<ServiceLine>) => void }) {
  const [name, setName] = useState(service.name);
  const [description, setDescription] = useState(service.description);
  const [price, setPrice] = useState(((service.list_cents ?? service.price_cents) / 100).toString());
  const [dType, setDType] = useState<'pct' | 'amount'>(service.discount?.type ?? 'pct');
  const [dValue, setDValue] = useState(service.discount ? service.discount.value.toString() : '');
  const [optional, setOptional] = useState(service.optional === true);
  const list = Math.round(Number(price) * 100) || 0;
  const disc = Number(dValue) > 0 ? { type: dType, value: Number(dValue) } : undefined;
  const final = discountedCents(list, disc);
  return (
    <Modal title="Edit service" onClose={onClose}>
      <Field label="Service name"><input className={A.input} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div>
        <div className="mb-1 text-sm text-[color:var(--ds-body)]">Service description</div>
        <textarea className={`${A.input} min-h-[140px]`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What the client gets. Start lines with a dash for a list." />
      </div>
      <Field label="Price (USD)"><input type="number" min={0} step="0.01" className={A.input} value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Discount type" isSelect><select className={sel} value={dType} onChange={(e) => setDType(e.target.value as 'pct' | 'amount')}><option value="pct">Percent off</option><option value="amount">Dollars off</option></select></Field>
        <Field label={dType === 'pct' ? 'Percent' : 'Dollars'}><input type="number" min={0} step="0.01" className={A.input} value={dValue} onChange={(e) => setDValue(e.target.value)} placeholder="No discount" /></Field>
      </div>
      <p className="text-sm text-[color:var(--ds-ink)]">The client pays <strong>{money(final)}</strong>{disc ? <span className="text-[color:var(--ds-body)]"> ({money(list)} before the discount)</span> : null}</p>
      <label className="flex items-center gap-3 text-sm text-[color:var(--ds-ink)]"><input type="checkbox" className="h-4 w-4 accent-[color:var(--ds-primary)]" checked={optional} onChange={(e) => setOptional(e.target.checked)} />Optional service <span className="text-[color:var(--ds-body)]">(the client can decline it when approving)</span></label>
      <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
        <button type="button" className={A.outline} onClick={onClose}>Cancel</button>
        <button type="button" className={A.primary} disabled={!name.trim() || final <= 0} onClick={() => onSave({ name: name.trim(), description, price_cents: final, list_cents: disc ? list : undefined, discount: disc, optional: optional || undefined })}>Save</button>
      </div>
    </Modal>
  );
}

function BillingControls({ billing, onChange }: { billing: ServiceBilling; onChange: (b: ServiceBilling) => void }) {
  const b = cleanBilling(billing);
  const set = (p: Partial<ServiceBilling>) => onChange({ ...b, ...p });
  const manual = b.start === 'manual';
  return (
    <div className="mt-4 space-y-3 border-t border-[color:var(--ds-line)] pt-4">
      <span className="inline-block rounded-full border border-[color:var(--ds-line)] px-3 py-1 text-xs text-[color:var(--ds-ink)]">{billingBadge(b)}</span>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Billed" isSelect>
          <select className={sel} value={b.cadence} onChange={(e) => set({ cadence: e.target.value as ServiceBilling['cadence'] })} disabled={manual}>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly, over the service term</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
            <option value="one_time">One time</option>
            <option value="stages">In stages</option>
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
      {b.cadence === 'weekly' && (
        <Field label="Billing weekday" isSelect>
          <select className={sel} value={b.weekday ?? ''} onChange={(e) => set({ weekday: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">Any day</option>
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d, i) => <option key={d} value={i + 1}>{d}s</option>)}
          </select>
        </Field>
      )}
      {b.hourly && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Hourly rate ($)"><input type="number" min={0} step="0.01" className={A.input} value={b.hourly.rate_cents / 100} onChange={(e) => set({ hourly: { ...b.hourly!, rate_cents: Math.round(Number(e.target.value || 0) * 100) } })} /></Field>
          <Field label="Hours pre-approved per period"><input type="number" min={0} step="0.5" className={A.input} value={b.hourly.cap_hours} onChange={(e) => set({ hourly: { ...b.hourly!, cap_hours: Number(e.target.value || 0) } })} /></Field>
        </div>
      )}
      {b.cadence === 'stages' && (
        <div className="space-y-2">
          {(b.stages ?? [{ pct: 50, trigger: 'acceptance' as const }, { pct: 50, trigger: 'manual' as const }]).map((g, i, arr) => (
            <div key={i} className="grid grid-cols-2 gap-3">
              <Field label={`Stage ${i + 1} percent`}><input type="number" min={0} max={100} className={A.input} value={g.pct} onChange={(e) => set({ stages: arr.map((x, j) => (j === i ? { ...x, pct: Number(e.target.value || 0) } : x)) })} /></Field>
              <Field label="Starts" isSelect>
                <select className={sel} value={g.trigger} onChange={(e) => set({ stages: arr.map((x, j) => (j === i ? { ...x, trigger: e.target.value as 'acceptance' | 'manual' } : x)) })}>
                  <option value="acceptance">On agreement acceptance</option>
                  <option value="manual">Manually</option>
                </select>
              </Field>
            </div>
          ))}
        </div>
      )}
      {b.cadence === 'one_time' && (
        <label className="flex items-center gap-3 text-sm text-[color:var(--ds-ink)]"><input type="checkbox" className="h-4 w-4 accent-[color:var(--ds-primary)]" checked={!!b.on_acceptance} onChange={(e) => set({ on_acceptance: e.target.checked || undefined })} />Bill on agreement acceptance</label>
      )}
      {b.start === 'date' && (
        <input type="date" aria-label="First invoice date" value={b.start_date} onChange={(e) => set({ start_date: e.target.value })} className="w-full border border-[color:var(--ds-line)] text-sm text-[color:var(--ds-ink)]" />
      )}
      <p className="text-xs text-[color:var(--ds-body)]">
        {b.start === 'next' && 'The first invoice goes out on the next billing day after the agreement takes effect.'}
        {b.start === 'date' && 'The first invoice goes out on this exact date. Later invoices follow monthly. Past dates are invoiced right away.'}
        {manual && 'Nothing is invoiced for this service until someone starts billing in Billing.'}
      </p>
    </div>
  );
}

const PREVIEW_STEPS = ['Introduction', 'Review services', 'Review terms of service', 'Review additional terms', 'Sign & approve'] as const;

function PreviewModal({ doc, intro, preparedFor, total, onClose }: { doc: BuilderDoc; intro: string; preparedFor: string; total: number; onClose: () => void }) {
  const [step, setStep] = useState(-1);
  const [mobile, setMobile] = useState(false);
  const brand = doc.services[0]?.publication === 'san_antonio' ? 'Newsline San Antonio' : 'RealtyLine';
  const pay = doc.payment ?? DEFAULT_PAYMENT;
  const methods = [pay.card ? 'credit card' : null, pay.check ? 'check' : null, pay.bank_now ? 'bank (ACH) now' : null, pay.bank_invoice ? 'bank (ACH) on invoices' : null].filter(Boolean).join(' or ');
  const due = pay.due_days === 0 ? 'Payment is due upon receipt of invoice.' : pay.due_days != null ? `Payment is due ${pay.due_days} ${pay.due_days === 1 ? 'day' : 'days'} after each invoice is issued.` : 'Payment is due on the account default schedule after each invoice is issued.';
  const body = (
    <div className="space-y-4 text-sm text-[color:var(--ds-ink)]">
      {step === 0 && <p className="whitespace-pre-line rounded-[10px] bg-white p-5">{intro}</p>}
      {step === 1 && (
        <>
          {doc.services.map((sv) => (
            <div key={sv.id} className="rounded-[10px] bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{sv.name || 'Service'}</span>
                <span className="flex items-center gap-3"><span className="rounded-full border border-[color:var(--ds-primary)] px-2.5 py-0.5 text-xs">{billingBadge(sv.billing ?? DEFAULT_BILLING).replace(', automatically', '')}</span><span className="font-semibold">{money(sv.price_cents)}</span></span>
              </div>
              {sv.description && <p className="mt-3 whitespace-pre-line text-[color:var(--ds-body)]">{sv.description}</p>}
            </div>
          ))}
          {doc.refs.filter((r) => r.client_facing && r.name).map((r, i) => <div key={i} className="flex justify-between rounded-[10px] bg-white px-5 py-3 text-xs"><span className="text-[color:var(--ds-body)]">{r.name}</span><span>{r.value}</span></div>)}
          <div className="flex justify-between rounded-[10px] bg-white px-5 py-3 font-semibold"><span>Agreement total</span><span>{money(total)}</span></div>
          {doc.note && <p className="whitespace-pre-line rounded-[10px] bg-white p-5 text-[color:var(--ds-body)]">{doc.note}</p>}
        </>
      )}
      {step === 2 && <p className="rounded-[10px] bg-white p-5 text-[color:var(--ds-body)]">The advertising terms for the selected products appear here for the client to read before paying. They are the same terms shown on the live signing page.</p>}
      {step === 3 && (
        <div className="space-y-4 rounded-[10px] bg-white p-5">
          <div><div className="font-semibold">Effective date of agreement</div><div className="text-[color:var(--ds-body)]">{doc.effective === 'date' && doc.effective_date ? fmtDay(doc.effective_date) : 'On acceptance'}</div></div>
          <div><div className="font-semibold">Payment terms</div><div className="text-[color:var(--ds-body)]">{due} Accepted: {methods || 'none'}.</div></div>
          {doc.ask_address && <div><div className="font-semibold">Address</div><div className="text-[color:var(--ds-body)]">You will be asked for your address before signing.</div></div>}
          {doc.expires && <div><div className="font-semibold">Expiration</div><div className="text-[color:var(--ds-body)]">This agreement expires {doc.expires_days} days after it is sent.</div></div>}
        </div>
      )}
      {step === 4 && (
        <div className="rounded-[10px] bg-white p-5">
          <div className="mb-3 inline-flex rounded-full bg-[color:var(--ds-page)] p-1 text-xs"><span className="rounded-full bg-white px-4 py-1.5 font-medium shadow">Type</span><span className="px-4 py-1.5 text-[color:var(--ds-body)]">Draw</span></div>
          <div className="border-b border-[color:var(--ds-line)] py-6 text-2xl italic text-[color:var(--ds-placeholder)]">Type your name…</div>
          <p className="mt-3 text-xs text-[color:var(--ds-body)]">On the live page the client picks how to pay, then signs. Preview only; nothing is saved.</p>
        </div>
      )}
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Client preview">
      <div className="flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-[10px] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[color:var(--ds-line)] px-5 py-3 text-sm text-[color:var(--ds-ink)]">
          <span>You are in preview mode. No activity will be saved.</span>
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-full bg-[color:var(--ds-page)] p-1 text-xs" role="group" aria-label="Device">
              {([[false, 'Desktop'], [true, 'Mobile']] as const).map(([m, l]) => <button key={l} type="button" aria-pressed={mobile === m} onClick={() => setMobile(m)} className={`rounded-[10px] px-3 py-1 ${mobile === m ? 'bg-white font-medium shadow' : 'text-[color:var(--ds-body)]'}`} style={{ border: 0 }}>{l}</button>)}
            </div>
            <button type="button" aria-label="Close preview" onClick={onClose} className="text-xl leading-none" style={{ border: 0, background: 'transparent' }}>×</button>
          </div>
        </div>
        <div className="flex flex-1 items-start justify-center overflow-y-auto bg-[color:var(--ds-page)] p-6">
          <div className={`flex min-h-[70%] w-full flex-col rounded-xl bg-[color:var(--ds-selected)] ${mobile ? 'max-w-sm' : 'max-w-4xl'}`}>
            {step === -1 ? (
              <div className="p-10">
                <h2 className="text-3xl font-bold text-[color:var(--ds-ink)]">{doc.name || 'Agreement for review'}</h2>
                <h3 className="mt-6 text-xl font-semibold text-[color:var(--ds-ink)]">Prepared for {preparedFor}</h3>
                <p className="mt-2 text-sm text-[color:var(--ds-body)]">{brand} has sent you this agreement for your review and approval.</p>
                <button type="button" className={`${A.primary} mt-8`} onClick={() => setStep(0)}>Get started →</button>
              </div>
            ) : (
              <div className={`flex flex-1 ${mobile ? 'flex-col' : ''}`}>
                <nav className={`${mobile ? 'border-b' : 'w-60 shrink-0 border-r'} border-[color:var(--ds-line)] bg-white p-5 text-sm`} aria-label="Agreement steps">
                  <div className="mb-4 font-semibold text-[color:var(--ds-ink)]">{brand}</div>
                  <ul className={mobile ? 'flex flex-wrap gap-2' : 'space-y-3'}>
                    {PREVIEW_STEPS.map((l, i) => <li key={l}><button type="button" onClick={() => setStep(i)} className={`text-left ${i === step ? 'font-semibold text-[color:var(--ds-primary)]' : 'text-[color:var(--ds-body)]'}`} style={{ border: 0, background: 'transparent' }}>{l}</button></li>)}
                  </ul>
                </nav>
                <div className="flex flex-1 flex-col p-6">
                  <h3 className="mb-4 text-2xl font-semibold text-[color:var(--ds-ink)]">{PREVIEW_STEPS[step]}</h3>
                  <div className="flex-1">{body}</div>
                  <div className="mt-6 flex justify-end">
                    {step < PREVIEW_STEPS.length - 1 ? <button type="button" className={A.primary} onClick={() => setStep(step + 1)}>Next</button> : <button type="button" className={A.primary} disabled>Approve agreement</button>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
