/* eslint-disable @typescript-eslint/no-unused-vars, react-hooks/set-state-in-effect -- pre-existing lint debt, unrelated to the pill-shape change */
'use client';

// Billing Hub (Beta): one client and one agreement at a time, with five tabs:
// Billing Hub, Agreement, Payment Methods, Invoices, Activity Log, plus the
// Billing Control drawer and the "Bill client" screen. Laid out like Anchor's
// Billing Hub.

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CardCvcElement, CardExpiryElement, CardNumberElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { A, FilterChip, RowMenu, SearchBox } from '@/components/anchor/ui';
import { computeNextRun, type RecurringFrequency } from '@/lib/recurring-invoices';
import { day, money, useJson, GROUP_LABEL, groupOf, marketsOf, type Adv, type Inv, type Sch } from '../agreements/clients/data';
import SortCaret from '@/components/anchor/SortCaret';
import AllInvoices, { type InvoiceIntent } from './AllInvoices';
import RecurringPanel from './RecurringPanel';
import StatementsPanel from './StatementsPanel';
import PaymentLinksPanel from './PaymentLinksPanel';
import StripeTransactionsPanel from './StripeTransactionsPanel';

type AuditEntry = { event: string; timestamp: string; user_email?: string; details?: string };
type Agr = {
  id: string; advertiser_id: number | null; status: string; type: string | null; ad_size: string | null; frequency: string | null;
  ad_rate_cents: number | null; amount_cents: number | null; total_monthly_rate_cents: number | null; start_date: string | null; end_date: string | null;
  signed_at: string | null; created_at: string | null; eblast_packages: string[] | null; audit_log: AuditEntry[] | null;
  card_type: string | null; card_number_last4: string | null; card_expiration: string | null; cardholder_name: string | null; sent_to_email: string | null;
};
type FullInv = Inv & { payments?: Array<{ payment_date: string | null; payment_method: string | null; fee_cents?: number | null }>; issued_at?: string | null; paid_at?: string | null; created_at?: string | null; audit_log?: AuditEntry[]; bill_to_name?: string | null };
type Product = { id: string | number; name: string; description?: string | null; unit_price_cents?: number | null; price_cents?: number | null; active?: boolean | null; billing_type?: string | null };
type Tab = 'hub' | 'agreement' | 'payment' | 'invoices' | 'recurring' | 'statements' | 'paymentlinks' | 'stripe' | 'activity';
const TABS: Array<[Tab, string]> = [['agreement', 'Agreement'], ['payment', 'Payment method'], ['invoices', 'Invoices'], ['recurring', 'Recurring invoices'], ['statements', 'Statements'], ['stripe', 'Stripe transactions'], ['activity', 'Activity Log']];
const none: never[] = [];
const cap = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const dt = (v: string) => new Date(v).toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const NOT_DRAFT = (i: Inv) => i.status !== 'draft';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="relative block">
      <span className="absolute -top-2 left-5 z-10 bg-[#F3F4F7] px-1 text-[11px] text-[color:var(--ds-body)]">{label}</span>
      {children}
    </label>
  );
}
const selectCls = 'w-full appearance-none rounded-md border border-[color:var(--ds-ink)]/60 bg-white px-5 py-3.5 pr-10 text-sm text-[color:var(--ds-ink)] focus:border-[color:var(--ds-primary)] focus:outline-none';
const Caret = () => null; // caret is now drawn globally on every select (app/globals.css)

const wantsAll = () => {
  if (typeof window === 'undefined') return false;
  const sc = new URLSearchParams(window.location.search).get('scope');
  if (sc === 'client') return false;
  return sc === 'all' || window.location.pathname.endsWith('/billing-hub/invoices');
};
export default function BillingHub() {
  const advs = useJson('/api/admin/advertisers', (j) => (j.advertisers ?? []) as Adv[], none as Adv[]);
  const [clientId, setClientId] = useState<number | null>(null);
  const [agreementId, setAgreementId] = useState('');
  const [tab, setTab] = useState<Tab>('agreement');
  const [bill, setBill] = useState<null | { mode: 'charge' | 'credit'; seed?: { description: string; unit_cents: number } }>(null);
  const [control, setControl] = useState(false);
  const [noPick, setNoPick] = useState(false);
  const [version, setVersion] = useState(0);
  const [intent, setIntent] = useState<InvoiceIntent | null>(null);

  const clients = useMemo(() => [...advs.data].sort((a, b) => a.name.localeCompare(b.name)), [advs.data]);
  useEffect(() => {
    if (clientId != null || clients.length === 0) return;
    const p = new URLSearchParams(window.location.search);
    const fromUrl = Number(p.get('clientId'));
    const wanted = p.get('agreementId') ?? '';
    const t = p.get('tab') ?? (window.location.pathname.endsWith('/billing-hub/invoices') ? 'invoices' : null); if (TABS.some(([k]) => k === t)) setTab(t as Tab);
    // Legacy Get Paid invoice links: ?invoice=<id> opens that invoice, ?create=1 starts a new one.
    const invoiceId = p.get('invoice') ?? p.get('edit') ?? p.get('focus') ?? p.get('id');
    if (invoiceId && !fromUrl) {
      setTab('invoices');
      fetch(`/api/admin/invoices/${invoiceId}`, { credentials: 'include' }).then((r) => r.json())
        .then((j) => { const c = clients.find((x) => x.id === j.invoice?.advertiser_id); if (c) { setClientId(c.id); setIntent({ edit: invoiceId }); } else setNoPick(true); })
        .catch(() => setNoPick(true));
      return;
    }
    if (p.get('create') === '1') {
      setTab('invoices');
      const amt = p.get('amount_cents');
      setIntent({ create: { advertiser_id: fromUrl || null, agreement_id: p.get('agreement_id') ?? '', amount_cents: amt ? Number(amt) : null } });
    }
    if (wantsAll() && !fromUrl && !wanted) { setClientId(clients[0].id); return; }
    const pick = (id?: number | null) => { const c = clients.find((x) => x.id === id); if (c) setClientId(c.id); else setNoPick(true); };
    if (wanted && !fromUrl) {
      // Deep link from Agreements (Beta): find the agreement's client first.
      fetch('/api/admin/agreements', { credentials: 'include' }).then((r) => r.json())
        .then((j) => { const a = ((j.agreements ?? []) as Agr[]).find((x) => x.id === wanted); setAgreementId(a ? wanted : ''); pick(a?.advertiser_id); })
        .catch(() => pick(null));
      return;
    }
    pick(fromUrl);
    setAgreementId(wanted);
  }, [clients, clientId]);

  const client = clients.find((c) => c.id === clientId) ?? null;
  // Keep the selected partner, tab and agreement in the URL so a refresh (or shared link) returns to the same view.
  useEffect(() => {
    if (clientId == null) return;
    const u = new URL(window.location.href);
    u.searchParams.set('clientId', String(clientId));
    u.searchParams.set('tab', tab);
    if (agreementId) u.searchParams.set('agreementId', agreementId); else u.searchParams.delete('agreementId');
    ['invoice', 'edit', 'focus', 'id', 'create', 'amount_cents', 'agreement_id'].forEach((k) => u.searchParams.delete(k));
    const next = `${u.pathname}${u.search}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', next);
  }, [clientId, tab, agreementId]);
  const agr = useJson(`/api/admin/agreements?advertiser_id=${clientId ?? ''}&v=${version}`, (j) => (j.agreements ?? []) as Agr[], none as Agr[]);
  const inv = useJson(`/api/admin/invoices?advertiser_id=${clientId ?? ''}&v=${version}`, (j) => ((j.invoices ?? []) as FullInv[]).map((i) => ({
    ...i,
    // The API returns issued_at / ISO due_date; the table needs plain calendar dates (Central time).
    issue_date: i.issue_date ?? (i.issued_at ?? i.created_at ? new Date((i.issued_at ?? i.created_at) as string).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) : null),
    due_date: i.due_date ? i.due_date.slice(0, 10) : null,
  })), none as FullInv[]);
  const sch = useJson(`/api/admin/recurring-invoices?advertiser_id=${clientId ?? ''}&v=${version}`, (j) => (j.schedules ?? []) as Sch[], none as Sch[]);
  const today = new Date().toISOString().slice(0, 10);
  const isActiveAgr = (a: Agr) => !!a.signed_at && !['expired', 'cancelled', 'canceled', 'void', 'declined', 'draft', 'terminated'].includes(String(a.status).toLowerCase()) && (!a.end_date || a.end_date.slice(0, 10) >= today);
  const agreements = agr.data.filter((a) => a.advertiser_id === clientId && isActiveAgr(a));
  const agreement = agreements.find((a) => a.id === agreementId) ?? agreements[0] ?? null;
  const invoices = inv.data.filter((i) => i.advertiser_id == null || i.advertiser_id === clientId).filter((i) => !agreementId || i.agreement_id === agreementId);
  const schedules = sch.data.filter((s) => s.advertiser_id === clientId && s.status !== 'ended').filter((s) => !agreementId || s.agreement_id === agreementId);

  if (advs.loading) return <p className="text-sm text-[color:var(--ds-body)]">Loading…</p>;
  if (advs.error) return <div className={A.error}>{advs.error}</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 pt-2">
        <div className={`grid min-w-0 flex-1 grid-cols-1 gap-4 ${client ? 'sm:grid-cols-2' : 'sm:max-w-[50%]'}`}>
        <Field label="Client">
          <span className="relative block">
            <select aria-label="Client" className={selectCls} value={clientId ?? ''} onChange={(e) => { setClientId(e.target.value ? Number(e.target.value) : null); setAgreementId(''); }}>
              {clientId == null && <option value="" disabled>Select a client</option>}
              {clients.filter((c) => groupOf(c.status) === 'active' || c.id === clientId).map((c) => <option key={c.id} value={c.id}>{c.name}{marketsOf(c.publication).length ? ` (${marketsOf(c.publication).join(', ')})` : ''}{groupOf(c.status) !== 'active' ? ` · ${GROUP_LABEL[groupOf(c.status)]}` : ''}</option>)}
            </select><Caret />
          </span>
        </Field>
        {client && <Field label="Agreement">
          <span className="relative block">
            <select aria-label="Agreement" className={selectCls} value={agreement?.id ?? ''} onChange={(e) => setAgreementId(e.target.value)}>
              {agreements.length === 0 && <option value="">No active agreement</option>}
              {agreements.map((a) => <option key={a.id} value={a.id}>Agreement · {[a.ad_size, a.start_date ? `${day(a.start_date)}${a.end_date ? ` – ${day(a.end_date)}` : ''}` : null].filter(Boolean).join(' · ') || a.id.slice(0, 8)}</option>)}
            </select><Caret />
          </span>
        </Field>}
              </div>
        {client && <button type="button" onClick={() => setControl(true)} className={A.outline}>Billing Control</button>}
        <span id="create-invoice-slot" className="contents" />
      </div>
      {!client && <p className="py-24 text-center text-sm text-[color:var(--ds-ink)]">Please choose a client to start billing</p>}

      {client && <div role="tablist" className="flex flex-wrap gap-x-8 border-b border-[color:var(--ds-line)]">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={{ border: 0, borderBottom: '2px solid', background: 'transparent', borderRadius: 0 }}
            className={`-mb-px pb-3 text-[15px] ${tab === k ? 'border-[color:var(--ds-primary)] font-medium text-[color:var(--ds-ink)]' : 'border-transparent text-[color:var(--ds-body)] hover:text-[color:var(--ds-ink)]'}`}>{l}</button>
        ))}
      </div>}

      {client && tab === 'agreement' && <AgreementTab client={client} agreement={agreement ?? agreements[0] ?? null} />}
      {client && tab === 'payment' && <PaymentTab client={client} agreement={agreement ?? agreements.find((a) => a.signed_at) ?? agreements[0] ?? null} onSaved={() => setVersion((v) => v + 1)} />}
      {client && tab === 'invoices' && <InvoicesTab client={client} invoices={invoices} agreements={agreements} intent={intent} onIntentDone={() => setIntent(null)} />}
      {client && tab === 'recurring' && <RecurringPanel clientId={client.id} />}
      {client && tab === 'statements' && <StatementsPanel />}
      {client && tab === 'paymentlinks' && <PaymentLinksPanel clientId={client.id} />}
      {client && tab === 'stripe' && <StripeTransactionsPanel clientId={client.id} clientName={client.name} />}
      {client && tab === 'activity' && <ActivityTab invoices={invoices} agreements={agreement ? [agreement] : agr.data.filter((a) => a.advertiser_id === clientId)} />}

      {control && <ControlDrawer onClose={() => setControl(false)} onBill={(m, seed) => { setControl(false); setBill({ mode: m, seed }); }} />}
      {bill && client && <BillScreen client={client} agreementId={agreementId || null} mode={bill.mode} seed={bill.seed} onClose={() => setBill(null)} onDone={() => { setBill(null); setVersion((v) => v + 1); }} />}
    </div>
  );
}

/* ---------------- Agreement tab ---------------- */
function AgreementTab({ client, agreement }: { client: Adv; agreement: Agr | null }) {
  if (!agreement) return <p className="py-10 text-center text-sm text-[color:var(--ds-ink)]">This partner has no agreement yet.</p>;
  const approved = (agreement.audit_log ?? []).find((e) => /sign|approv|upload/i.test(e.event)) ?? null;
  const main = [client.first_name, client.last_name].filter(Boolean).join(' ');
  const services: Array<{ name: string; desc: string; price: number | null; note: string }> = [];
  if (agreement.ad_size) services.push({ name: `${agreement.ad_size} advertising`, desc: [agreement.type ? cap(agreement.type) : null, agreement.frequency ? cap(agreement.frequency) : null].filter(Boolean).join(' · '), price: agreement.ad_rate_cents ?? agreement.total_monthly_rate_cents, note: agreement.frequency?.toLowerCase().includes('month') ? 'Billed monthly' : 'Can be billed once' });
  for (const p of agreement.eblast_packages ?? []) services.push({ name: p, desc: 'E-blast package', price: null, note: 'Can be billed once' });
  if (services.length === 0 && agreement.amount_cents) services.push({ name: 'Agreement total', desc: '', price: agreement.amount_cents, note: 'Can be billed once' });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-3">
        <Link href={`/admin/agreements/renewals-v2?tab=sent`} className={`${A.primary} px-7`}>Edit</Link>
        <RowMenu items={[{ label: 'Open agreements', href: '/admin/agreements/renewals-v2' }]} />
      </div>
      <div className="mx-auto max-w-[620px] space-y-4">
        <div className="relative overflow-hidden rounded-[10px] bg-white">
          <div className="h-6 bg-[color:var(--ds-primary)]" />
          <div className="absolute left-1/2 top-0 h-[84px] w-[84px] -translate-x-1/2 overflow-hidden rounded-full border-4 border-white bg-white shadow">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/rnn-logo.jpg" alt="" className="h-full w-full object-cover" />
          </div>
          <div className="px-6 pb-6 pt-[62px]">
            <h2 className="text-center text-base font-semibold text-[color:var(--ds-ink)]">Agreement between</h2>
            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-[color:var(--ds-line)] pt-4 text-xs text-[color:var(--ds-ink)]">
              <div className="space-y-1"><div>Tawanna Verock</div><div>Caxton Publications Inc</div><div>tawanna@myrealtyline.com</div></div>
              <div className="space-y-1 text-right"><div>{main || client.name}</div><div>{client.name}</div><div>{client.contact_email ?? agreement.sent_to_email ?? ''}</div></div>
            </div>
            {approved && <p className="mt-4 border-t border-[color:var(--ds-line)] pt-3 text-[11px] text-[color:var(--ds-body)]">Agreement {approved.event.replace(/_/g, ' ')} {approved.user_email ? `by ${approved.user_email} ` : ''}on {dt(approved.timestamp)}</p>}
          </div>
        </div>
        <div className="rounded-[10px] bg-white p-6">
          <h3 className="text-lg font-semibold text-[color:var(--ds-ink)]">Services Provided</h3>
          <div className="mt-4 space-y-3">
            {services.map((s, i) => (
              <div key={i} className="rounded-[10px] border border-[color:var(--ds-line)] p-4">
                <div className="text-base text-[color:var(--ds-ink)]">{s.name}</div>
                {s.desc && <div className="mt-1 text-xs text-[color:var(--ds-body)]">{s.desc}</div>}
                {s.price != null && <div className="mt-2 text-xl text-[color:var(--ds-ink)]">{money(s.price)}</div>}
                <ul className="mt-3 border-t border-[color:var(--ds-line)] pt-2 text-xs text-[color:var(--ds-ink)]"><li className="ml-4 list-disc">{s.note}</li></ul>
              </div>
            ))}
            {services.length === 0 && <p className="text-sm text-[color:var(--ds-body)]">No services on this agreement.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Payment Methods tab ---------------- */
function CardForm({ agreementId, onSaved }: { agreementId: string; onSaved: () => void }) {
  const stripe = useStripe(); const elements = useElements();
  const [name, setName] = useState(''); const [zip, setZip] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  useEffect(() => {
    fetch(`/api/admin/agreements/${agreementId}/setup-intent`, { method: 'POST' }).then((r) => r.json()).then((j) => setSecret(j.clientSecret ?? null)).catch(() => setSecret(null));
  }, [agreementId]);
  const box = 'rounded-[8px] border border-[color:var(--ds-line)] bg-white px-4 py-4';
  async function connect() {
    if (!stripe || !elements || !secret) return;
    const num = elements.getElement(CardNumberElement); if (!num) return;
    setBusy(true); setMsg(null);
    try {
      const r = await stripe.confirmCardSetup(secret, { payment_method: { card: num, billing_details: { name, address: { postal_code: zip } } } });
      if (r.error) throw new Error(r.error.message ?? 'Card could not be saved');
      const res = await fetch(`/api/admin/agreements/${agreementId}/setup-intent/confirm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ setupIntentId: r.setupIntent.id }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.detail ?? j.error ?? 'Could not save card');
      setMsg({ ok: true, t: 'Card connected.' }); onSaved();
    } catch (e) { setMsg({ ok: false, t: e instanceof Error ? e.message : 'Card could not be saved' }); } finally { setBusy(false); }
  }
  const style = { style: { base: { fontSize: '16px', color: '#16132D' } } };
  return (
    <div id="add-payment-method" className="max-w-[640px] space-y-5 rounded-[12px] bg-white p-6">
      <input className={`${box} w-full text-base`} placeholder="Name on card" value={name} onChange={(e) => setName(e.target.value)} />
      <div className={box}><CardNumberElement options={{ ...style, placeholder: 'Card number' }} /></div>
      <div className="grid grid-cols-3 gap-3">
        <div className={box}><CardExpiryElement options={style} /></div>
        <div className={box}><CardCvcElement options={style} /></div>
        <input className={`${box} w-full text-base`} placeholder="Zip code" value={zip} onChange={(e) => setZip(e.target.value)} />
      </div>
      <div className="flex items-center justify-between gap-4 text-xs text-[color:var(--ds-ink)]">
        <span>Card payments are processed securely by Stripe.</span>
        <button type="button" className={A.primary} disabled={busy || !secret || !name.trim()} onClick={connect}>{busy ? 'Connecting…' : 'Connect card'}</button>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? 'text-[#065F46]' : 'text-red-700'}`}>{msg.t}</p>}
    </div>
  );
}

function PaymentTab({ client, agreement, onSaved }: { client: Adv; agreement: Agr | null; onSaved: () => void }) {
  const [method, setMethod] = useState<'card' | 'ach'>('card');
  const [stripe, setStripe] = useState<Promise<Stripe | null> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!agreement) return;
    fetch(`/api/admin/agreements/${agreement.id}/setup-intent`, { method: 'POST' }).then((r) => r.json()).then((j) => { if (j.publishableKey) setStripe(loadStripe(j.publishableKey)); }).catch(() => {});
  }, [agreement]);
  async function paymentLink(send: boolean) {
    setNotice(null);
    let to: string | undefined;
    if (send) {
      to = window.prompt('Send the payment method link to which email?', (client as { billing_email?: string | null; contact_email?: string | null }).billing_email ?? (client as { contact_email?: string | null }).contact_email ?? '') ?? undefined;
      if (!to) return;
    }
    const r = await fetch(`/api/admin/advertisers/${client.id}/payment-link`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ send, to }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setNotice(j.error ?? 'Could not create the link.'); return; }
    if (send) { setNotice(`Payment method link emailed to ${j.to}.`); return; }
    try { await navigator.clipboard.writeText(j.url); setNotice('Payment method link copied. Paste it into a message to the client.'); } catch { setNotice(`Payment method link: ${j.url}`); }
  }
  const onFile = agreement?.card_number_last4;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[color:var(--ds-ink)]">Add or remove payment methods. Any overdue invoices will be reprocessed when a new method is selected.</p>
        <div className="flex gap-3"><button type="button" className={A.outline} onClick={() => paymentLink(false)}>Copy payment link</button><button type="button" className={A.outline} onClick={() => paymentLink(true)}>Email payment link</button><button type="button" className={A.primary} onClick={() => { setMethod('card'); document.getElementById('add-payment-method')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>Add payment method</button></div>
      </div>
      {notice && <p className="text-sm text-[color:var(--ds-body)]">{notice}</p>}
      {onFile && (
        <div className="max-w-[640px] rounded-[12px] bg-white p-5 text-sm">
          <div className="font-medium text-[color:var(--ds-ink)]">{cap(agreement?.card_type ?? 'Card')} ending in {onFile}</div>
          <div className="text-xs text-[color:var(--ds-body)]">{agreement?.cardholder_name ?? ''}{agreement?.card_expiration ? ` · Expires ${agreement.card_expiration}` : ''}</div>
        </div>
      )}
      <div className="grid max-w-[640px] grid-cols-2 gap-3">
        {([['card', 'Card', 'fee paid by client'], ['ach', 'Secure ACH', '']] as const).map(([k, l, s]) => (
          <button key={k} type="button" onClick={() => setMethod(k)} style={{ background: '#fff' }} className={`flex items-center justify-between rounded-[8px] border px-4 py-3 text-sm text-[color:var(--ds-ink)] ${method === k ? 'border-2 border-[color:var(--ds-primary)]' : 'border-transparent'}`}>
            <span>{l}</span><span className="text-[10px] text-[color:var(--ds-body)]">{s}</span>
          </button>
        ))}
      </div>
      {!agreement ? <p className="text-sm text-[color:var(--ds-body)]">Add an agreement before connecting a card.</p> : method === 'card' ? (
        stripe ? <Elements stripe={stripe}><CardForm agreementId={agreement.id} onSaved={onSaved} /></Elements> : <p className="text-sm text-[color:var(--ds-body)]">Loading card form…</p>
      ) : <p className="max-w-[640px] text-sm text-[color:var(--ds-body)]">Secure ACH is not enabled for this account yet.</p>}
      <p className="flex items-center gap-4 text-[10px] text-[color:var(--ds-body)]">Bank-level security and privacy. <span className="text-xs font-semibold tracking-wide">VISA</span><span className="text-xs font-semibold tracking-wide">DISCOVER</span><span className="text-xs font-semibold tracking-wide">AMEX</span><span className="text-xs font-semibold tracking-wide">MASTERCARD</span></p>
    </div>
  );
}

/* ---------------- Invoices tab ---------------- */
function InvoicesTab({ client, invoices, agreements, intent, onIntentDone }: { client: Adv; invoices: FullInv[]; agreements: Agr[]; intent: InvoiceIntent | null; onIntentDone: () => void }) {
  const [scope, setScope] = useState<'client' | 'all'>(intent || wantsAll() ? 'all' : 'client');
  const [shareNote, setShareNote] = useState('');
  const shareHistory = async () => {
    setShareNote('');
    try {
      const r = await fetch(`/api/admin/advertisers/${client.id}/history-link`, { credentials: 'include' });
      const j = await r.json();
      if (!r.ok || !j.url) throw new Error(j.error || 'Could not create the link.');
      try { await navigator.clipboard.writeText(j.url); setShareNote('Link copied. Anyone with it can view this partner\'s invoice history.'); }
      catch { window.prompt('Copy this link to share invoice history:', j.url); setShareNote('Link ready.'); }
    } catch (e) { setShareNote(e instanceof Error ? e.message : 'Could not create the link.'); }
  };
  // Remember "This partner" vs "All partners" across refreshes.
  useEffect(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.get('scope') === scope) return;
    u.searchParams.set('scope', scope);
    window.history.replaceState(null, '', `${u.pathname}${u.search}`);
  }, [scope]);
  const [focusQ, setFocusQ] = useState('');
  const [payIntent, setPayIntent] = useState<InvoiceIntent | null>(null);
  const [q, setQ] = useState(''); const [st, setSt] = useState<string[]>([]);
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [addOpen, setAddOpen] = useState(false);
  const [sort, setSort] = useState<{ k: 'number' | 'issue' | 'due' | 'total'; dir: 1 | -1 }>({ k: 'number', dir: -1 });
  const statuses = [...new Set(invoices.map((i) => i.status))].map((s) => ({ value: s, label: cap(s) }));
  const cardOf = (i: FullInv) => { const a = agreements.find((x) => x.id === i.agreement_id) ?? agreements.find((x) => x.card_number_last4); return a?.card_number_last4 ? `${cap(a.card_type ?? 'Card')} ••${a.card_number_last4}` : null; };
  const lastPay = (i: FullInv) => (i.payments ?? []).reduce<{ payment_date: string | null; payment_method: string | null; fee_cents?: number | null } | null>((m, p) => (!m || (p.payment_date ?? '') >= (m.payment_date ?? '') ? p : m), null);
  const methodOf = (i: FullInv) => { const m = lastPay(i)?.payment_method?.trim(); return m ? (m === 'wave_import' ? 'Wave import' : m === 'unspecified' ? null : m) : null; };
  const info = (i: FullInv) => (i.status === 'paid' ? `Paid in full${lastPay(i)?.payment_date ? ` · ${day(lastPay(i)?.payment_date?.slice(0, 10))}` : ''}` : i.status === 'void' ? 'Voided' : !cardOf(i) ? 'Missing payment method' : 'Awaiting payment');
  const rows = invoices.filter((i) => i.status !== 'draft' || true).filter((i) => (st.length === 0 || st.includes(i.status)) && (!q.trim() || (i.number ?? '').toLowerCase().includes(q.trim().toLowerCase())) && (!from || (i.issue_date ?? '') >= from) && (!to || (i.issue_date ?? '') <= to))
    .sort((a, b) => { const v = (i: FullInv) => (sort.k === 'number' ? i.number ?? '' : sort.k === 'issue' ? i.issue_date ?? '' : sort.k === 'due' ? i.due_date ?? '' : String(i.total_cents).padStart(12, '0')); return sort.dir * v(a).localeCompare(v(b)); });
  const th = (k: typeof sort.k, l: string, right = false) => <th className={right ? 'text-right' : ''}><button type="button" style={{ border: 0, background: 'transparent', padding: 0 }} className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--ds-body)]" onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }))}>{l}<SortCaret dir={sort.k === k ? (sort.dir === 1 ? 'asc' : 'desc') : undefined} /></button></th>;
  const scopeSwitch = (
    <div role="group" aria-label="Invoice scope" className="flex items-center gap-2">
      {([['client', 'This partner'], ['all', 'All partners']] as const).map(([k, l]) => (
        <button key={k} type="button" aria-pressed={scope === k} onClick={() => setScope(k)} className={`rounded-md border px-4 py-1.5 text-sm ${scope === k ? 'border-[color:var(--ds-primary)]' : 'bg-white border-[color:var(--ds-line)] text-[color:var(--ds-body)] hover:bg-[color:var(--ds-selected)] hover:text-[color:var(--ds-primary)]'}`}>{l}</button>
      ))}
    </div>
  );
  if (scope === 'all') return <div className="space-y-4"><div className="flex flex-wrap items-center gap-3">{scopeSwitch}<span id="invoice-search-slot" className="contents" /></div><AllInvoices intent={payIntent ?? intent} initialQuery={focusQ} onIntentDone={() => { if (payIntent) setPayIntent(null); else onIntentDone(); }} /></div>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {scopeSwitch}
        <button type="button" className={A.small} onClick={() => void shareHistory()}>Share invoice history</button>
        {shareNote && <span role="status" className="text-xs text-[color:var(--ds-body)]">{shareNote}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={setQ} label="Search invoices" />
        <div role="group" aria-label="Open or closed invoices" className="flex items-center gap-2">
          {([['open', 'Open'], ['closed', 'Closed']] as const).map(([k, l]) => {
            const on = k === 'open' ? st.length > 0 && st.every((x) => !['paid', 'void'].includes(x)) : st.length > 0 && st.every((x) => ['paid', 'void'].includes(x));
            const vals = statuses.map((x) => x.value).filter((v) => (k === 'closed') === ['paid', 'void'].includes(v));
            return <button key={k} type="button" aria-pressed={on} onClick={() => setSt(on ? [] : vals)} className={`rounded-md border px-4 py-1.5 text-sm ${on ? 'border-[color:var(--ds-primary)] bg-[color:var(--ds-selected)] text-[color:var(--ds-ink)]' : 'border-[color:var(--ds-line)] bg-white text-[color:var(--ds-body)] hover:bg-[color:var(--ds-selected)]'}`}>{l}</button>;
          })}
        </div>
        <FilterChip<string> title="Invoice status" options={statuses} value={st} onApply={setSt} summary="Invoice status" />
        <div className="relative">
          <button type="button" onClick={() => setAddOpen((o) => !o)} style={{ background: 'transparent' }} className="rounded-md border border-dashed border-[color:var(--ds-body)] px-4 py-2 text-sm text-[color:var(--ds-body)]">Add filter &#8853;</button>
          {addOpen && (
            <div className="absolute z-20 mt-2 w-64 space-y-2 rounded-[12px] border border-[color:var(--ds-line)] bg-white p-3 shadow-lg">
              <div className="text-xs font-medium text-[color:var(--ds-ink)]">Invoice issue date</div>
              <input type="date" className={A.input} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
              <input type="date" className={A.input} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
              <button type="button" className={A.small} onClick={() => { setFrom(''); setTo(''); setAddOpen(false); }}>Clear</button>
            </div>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className={`${A.table} min-w-[820px]`}>
          <thead><tr>{th('number', 'Invoice ID')}<th>Client name</th><th>Invoice status</th><th>Additional information</th><th>Payment method</th><th className="text-right">Card fee</th>{th('issue', 'Issue date')}{th('due', 'Due date')}{th('total', 'Total', true)}<th /></tr></thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id}>
                <td><Link href={`/admin/billing-hub/invoice/${i.id}/preview`} className="font-semibold text-[color:var(--ds-ink)] hover:underline">{i.number ?? '—'}</Link></td>
                <td className="text-[color:var(--ds-ink)]">{client.name}</td>
                <td><span className="rounded-md border border-[color:var(--ds-body)] px-2 py-0.5 text-[11px] text-[color:var(--ds-body)]">{cap(i.status === 'sent' ? 'issued' : i.status)}</span></td>
                <td className="text-[color:var(--ds-ink)]">{info(i)}</td>
                <td className="text-[color:var(--ds-ink)]">{(i.status === 'paid' ? methodOf(i) : cardOf(i)) ?? '—'}</td>
                <td className="whitespace-nowrap text-right text-[color:var(--ds-ink)]">{(() => { const f = (i.payments ?? []).reduce((s, p) => s + Number(p.fee_cents ?? 0), 0); return f > 0 ? money(f) : '—'; })()}</td>
                <td className="whitespace-nowrap text-[color:var(--ds-ink)]">{day(i.issue_date)}</td>
                <td className="whitespace-nowrap text-[color:var(--ds-ink)]">{day(i.due_date)}</td>
                <td className="text-right text-[color:var(--ds-ink)]">{money(i.total_cents)}</td>
                <td className="whitespace-nowrap text-right"><button type="button" disabled={['paid', 'void', 'draft'].includes(i.status)} title={['paid', 'void', 'draft'].includes(i.status) ? `This invoice is ${i.status}.` : undefined} className={`${A.small} mr-2`} onClick={() => { setFocusQ(i.number ?? ''); setPayIntent({ pay: i.id }); setScope('all'); }}>Receive payment</button><RowMenu items={[{ label: 'View invoice', href: `/admin/billing-hub/invoice/${i.id}/preview` }, { label: 'Edit invoice', onClick: () => { setFocusQ(i.number ?? ''); setScope('all'); } }]} /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-[color:var(--ds-body)]">No invoices to show.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Activity Log tab ---------------- */
function ActivityTab({ invoices, agreements }: { invoices: FullInv[]; agreements: Agr[] }) {
  const [q, setQ] = useState(''); const [types, setTypes] = useState<string[]>([]); const [notif, setNotif] = useState(true); const [open, setOpen] = useState<string | null>(null);
  type Ev = { key: string; at: string; kind: 'agreement' | 'invoice' | 'notification'; text: string; link?: { label: string; href: string }; detail?: string };
  // Delivered invoice emails (Resend events) so the Notification filter has invoice sends, not only agreement emails.
  const mail = useJson('/api/admin/invoices/email-status', (j) => (j.rows ?? []) as Array<{ id: string; to: string[]; subject: string; created_at: string; last_event: string }>, [] as Array<{ id: string; to: string[]; subject: string; created_at: string; last_event: string }>);
  const events = useMemo<Ev[]>(() => {
    const out: Ev[] = [];
    const seenMail = new Set<string>();
    for (const i of invoices) {
      const num = (i.number ?? '').trim(); if (!num) continue;
      const link = { label: num, href: `/admin/billing-hub/invoice/${i.id}/preview` };
      for (const m of mail.data) {
        if (seenMail.has(m.id) || !(m.subject ?? '').includes(num)) continue;
        seenMail.add(m.id);
        const reminder = /remind/i.test(m.subject);
        out.push({ key: `m-${m.id}`, at: m.created_at, kind: 'notification', text: `${reminder ? 'A payment reminder' : 'Invoice'} for {link} was emailed to ${(m.to ?? []).join(', ') || 'the client'}${m.last_event ? ` (${m.last_event})` : ''}.`, link, detail: m.subject });
      }
    }
    for (const a of agreements) for (const [n, e] of (a.audit_log ?? []).entries()) {
      const label = e.event.replace(/_/g, ' ');
      out.push({ key: `a-${a.id}-${n}`, at: e.timestamp, kind: /email|_sent|remind/i.test(e.event) ? 'notification' : 'agreement', text: `Agreement ${label}${e.user_email ? ` by ${e.user_email}` : ''}.`, detail: e.details });
    }
    for (const i of invoices) {
      const link = { label: i.number ?? 'invoice', href: `/admin/billing-hub/invoice/${i.id}/preview` };
      if (i.issued_at || i.issue_date) out.push({ key: `i-${i.id}`, at: i.issued_at ?? `${i.issue_date}T12:00:00`, kind: 'invoice', text: 'Invoice {link} was issued.', link });
      if (i.paid_at) out.push({ key: `p-${i.id}`, at: i.paid_at, kind: 'invoice', text: 'Invoice {link} was paid in full.', link });
      for (const [n, e] of (i.audit_log ?? []).entries()) {
        if (/email|sent|remind/i.test(e.event)) out.push({ key: `n-${i.id}-${n}`, at: e.timestamp, kind: 'notification', text: `An invoice notification was emailed for {link}.`, link, detail: e.details });
      }
    }
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [invoices, agreements, mail.data]);
  const shown = events.filter((e) => (notif || e.kind !== 'notification') && (types.length === 0 || types.includes(e.kind)) && (!q.trim() || e.text.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[240px] flex-1"><SearchBox value={q} onChange={setQ} label="Search activity" /></div>
        <FilterChip<string> title="Activity type" options={[{ value: 'agreement', label: 'Agreement' }, { value: 'invoice', label: 'Invoice' }, { value: 'notification', label: 'Notification' }]} value={types} onApply={setTypes} summary="Activity type" />
        <label className="inline-flex items-center gap-3 text-sm text-[color:var(--ds-ink)]">Show sent notifications
          <button type="button" role="switch" aria-checked={notif} onClick={() => setNotif((n) => !n)} style={{ border: 0, padding: 0 }} className={`relative h-6 w-11 rounded-full ${notif ? 'bg-[color:var(--ds-primary)]' : 'bg-[color:var(--ds-line)]'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${notif ? 'left-[22px]' : 'left-0.5'}`} /></button>
        </label>
      </div>
      <ol className="relative">
        {shown.map((e, idx) => {
          const [pre, post] = e.text.split('{link}');
          const last = idx === shown.length - 1;
          return (
            <li key={e.key} className="grid grid-cols-[150px_20px_1fr] items-start gap-x-3 pb-4">
              <div className="pt-3.5 text-right text-xs text-[color:var(--ds-ink)]">{dt(e.at)}</div>
              <div className="relative flex h-full justify-center">
                <span className="mt-[18px] h-2 w-2 rounded-full bg-[#C9CCD6]" />
                {!last && <span className="absolute left-1/2 top-[30px] bottom-[-16px] w-px -translate-x-1/2 bg-[#D5D8E0]" />}
              </div>
              <div className="rounded-[10px] bg-white px-4 py-3 text-sm text-[color:var(--ds-ink)]">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-3">
                    <span aria-hidden="true" className="text-[color:var(--ds-body)]">{e.kind === 'notification' ? '\u2709' : '\u25A4'}</span>
                    <span>{pre}{e.link && <Link href={e.link.href} className="text-[color:var(--ds-primary)]">{e.link.label}</Link>}{post}</span>
                  </span>
                  {e.detail && <button type="button" aria-label="Show details" style={{ border: 0, background: 'transparent' }} className="text-[10px] text-[color:var(--ds-body)]" onClick={() => setOpen(open === e.key ? null : e.key)}>{open === e.key ? '\u25B2' : '\u25BC'}</button>}
                </div>
                {open === e.key && e.detail && <p className="mt-2 pl-8 text-xs text-[color:var(--ds-body)]">{e.detail}</p>}
              </div>
            </li>
          );
        })}
        {shown.length === 0 && <li className="py-10 text-center text-sm text-[color:var(--ds-body)]">No activity to show.</li>}
      </ol>
    </div>
  );
}

/* ---------------- Billing Control drawer ---------------- */
function ControlDrawer({ onClose, onBill }: { onClose: () => void; onBill: (mode: 'charge' | 'credit', seed?: { description: string; unit_cents: number }) => void }) {
  const prods = useJson('/api/admin/products-services', (j) => ((j.products ?? j.items ?? j.services ?? []) as Product[]), none as Product[]);
  const [open, setOpen] = useState(true);
  const list = prods.data.filter((p) => p.active !== false);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside role="dialog" aria-label="Billing Control" className="flex h-full w-full max-w-[360px] flex-col bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[color:var(--ds-line)] px-4 py-4"><h2 className="text-base font-semibold text-[color:var(--ds-ink)]">Billing Control</h2><button type="button" aria-label="Close" onClick={onClose} style={{ border: 0, background: 'transparent' }}>&#10005;</button></div>
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-3 text-sm font-semibold text-[color:var(--ds-ink)]">Manual services</div>
          <button type="button" onClick={() => setOpen((o) => !o)} style={{ border: 0, borderRadius: 0, background: '#F3F4F7' }} className="flex w-full items-center justify-between px-4 py-2 text-sm text-[color:var(--ds-ink)]">One time<span>{open ? '⌃' : '⌄'}</span></button>
          {open && (prods.loading ? <p className="px-4 py-3 text-sm text-[color:var(--ds-body)]">Loading…</p> : list.length === 0 ? <p className="px-4 py-3 text-sm text-[color:var(--ds-body)]">No services yet.</p> : list.map((p) => {
            const cents = p.unit_price_cents ?? p.price_cents ?? 0;
            return (
              <div key={String(p.id)} className="flex items-center justify-between gap-3 border-b border-[color:var(--ds-line)] px-4 py-3">
                <div><div className="text-sm text-[color:var(--ds-ink)]">{p.name}</div><div className="text-xs text-[color:var(--ds-body)]">{money(cents)}</div></div>
                <button type="button" className={`${A.primary} !px-5 !py-1.5 !text-xs`} onClick={() => onBill('charge', { description: p.name, unit_cents: cents })}>Bill</button>
              </div>
            );
          }))}
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-[color:var(--ds-line)] p-4">
          <button type="button" className={A.outline} onClick={() => onBill('charge')}>Add Charge</button>
          <button type="button" className={A.outline} onClick={() => onBill('credit')}>Add Credit</button>
        </div>
      </aside>
    </div>
  );
}

/* ---------------- Bill client screen ---------------- */
type Line = { description: string; qty: number; unit: string; credit: boolean };
function BillScreen({ client, agreementId, mode, seed, onClose, onDone }: { client: Adv; agreementId: string | null; mode: 'charge' | 'credit'; seed?: { description: string; unit_cents: number }; onClose: () => void; onDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [how, setHow] = useState('date'); const [issue, setIssue] = useState(today);
  const [lines, setLines] = useState<Line[]>(seed ? [{ description: seed.description, qty: 1, unit: (seed.unit_cents / 100).toFixed(2), credit: false }] : mode === 'credit' ? [{ description: 'Credit', qty: 1, unit: '', credit: true }] : []);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const cents = (l: Line) => Math.round(Number(l.unit || 0) * 100) * l.qty * (l.credit ? -1 : 1);
  const total = lines.reduce((n, l) => n + cents(l), 0);
  const valid = lines.length > 0 && lines.every((l) => l.description.trim() && Number(l.unit) > 0 && l.qty > 0) && total > 0;
  const setLine = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, n) => (n === i ? { ...l, ...p } : l)));
  async function submit() {
    setBusy(true); setErr(null);
    try {
      const line_items = lines.map((l) => ({ description: l.description.trim(), qty: l.qty, unit_cents: Math.round(Number(l.unit) * 100) * (l.credit ? -1 : 1) }));
      const future = issue > today;
      const r = future
        ? await fetch('/api/admin/recurring-invoices', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ advertiser_id: client.id, agreement_id: agreementId, name: lines[0].description.trim(), frequency: 'monthly', max_occurrences: 1, start_date: issue, line_items, amount_cents: total }) })
        : await fetch('/api/admin/invoices', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ advertiser_id: client.id, agreement_id: agreementId, status: 'sent', line_items }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not bill the client.'); } finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#E9EAF0]">
      <div className="flex items-center justify-between bg-white px-4 py-3">
        <div className="flex items-center gap-4"><button type="button" aria-label="Close" onClick={onClose} style={{ border: 0, background: 'transparent' }}>&#10005;</button><span className="h-6 w-px bg-[color:var(--ds-line)]" /><h2 className="text-base font-semibold text-[color:var(--ds-ink)]">Bill client - {client.name}</h2></div>
        <div className="flex items-center gap-3"><span className="text-sm text-[color:var(--ds-body)]">&#128206; Attach Files</span><button type="button" className={A.primary} disabled={!valid || busy} onClick={submit}>{busy ? 'Billing…' : 'Bill now →'}</button></div>
      </div>
      <div className="p-5">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-4">
            <label className="relative block w-72"><span className="mb-1 block px-1 text-xs font-medium text-[color:var(--ds-body)]">Choose how to bill</span>
              <select className={selectCls} value={how} onChange={(e) => setHow(e.target.value)}><option value="date">Bill on date</option></select><Caret /></label>
            <label className="relative block w-72"><span className="mb-1 block px-1 text-xs font-medium text-[color:var(--ds-body)]">Issue date</span>
              <input type="date" min={today} className={selectCls} value={issue} onChange={(e) => setIssue(e.target.value)} /></label>
          </div>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px_140px_auto] items-center gap-3 rounded-[10px] bg-white p-3">
              <input className={A.input} placeholder={l.credit ? 'Credit description' : 'Charge description'} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
              <input className={A.input} type="number" min={1} aria-label="Quantity" value={l.qty} onChange={(e) => setLine(i, { qty: Math.max(1, Number(e.target.value) || 1) })} />
              <input className={A.input} type="number" min={0} step="0.01" aria-label={l.credit ? 'Credit amount' : 'Price'} placeholder={l.credit ? 'Credit $' : 'Price $'} value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} />
              <button type="button" aria-label="Remove" onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))} style={{ border: 0, background: 'transparent' }}>&#10005;</button>
            </div>
          ))}
          <button type="button" onClick={() => setLines((ls) => [...ls, { description: '', qty: 1, unit: '', credit: false }])} style={{ background: 'transparent' }} className="flex w-full items-center gap-2 rounded-[10px] border border-dashed border-[color:var(--ds-primary)] px-4 py-3 text-sm font-medium text-[color:var(--ds-primary)]">&#8853; Add charge</button>
          <button type="button" onClick={() => setLines((ls) => [...ls, { description: 'Credit', qty: 1, unit: '', credit: true }])} style={{ background: 'transparent', border: 0 }} className="text-sm font-medium text-[color:var(--ds-primary)]">&#8853; Add credit</button>
          {lines.length > 0 && <div className="flex justify-end rounded-[10px] bg-white px-4 py-3 text-sm text-[color:var(--ds-ink)]">Total&nbsp;<span className="font-semibold">{money(total)}</span></div>}
          {err && <p className="text-sm text-red-700">{err}</p>}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Bill clients in bulk ---------------- */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let q = false;
  for (let n = 0; n < text.length; n++) {
    const ch = text[n];
    if (q) { if (ch === '"' && text[n + 1] === '"') { cur += '"'; n++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[n + 1] === '\n') n++; row.push(cur); cur = ''; if (row.some((c) => c.trim())) rows.push(row); row = []; }
    else cur += ch;
  }
  row.push(cur); if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

function BulkDialog({ clients, onClose, onDone }: { clients: Adv[]; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<string[] | null>(null);
  const example = 'client,description,quantity,unit_price\nExample Client,Monthly ad package,1,1500.00\n';
  async function run() {
    if (!file) return;
    setBusy(true); setErr(''); setRes(null);
    try {
      const rows = parseCsv(await file.text());
      const head = rows.shift()?.map((h) => h.trim().toLowerCase()) ?? [];
      const col = (n: string) => head.indexOf(n);
      if ([col('client'), col('description'), col('quantity'), col('unit_price')].some((c) => c < 0)) { setErr('The file needs the columns client, description, quantity and unit_price.'); return; }
      const byClient = new Map<number, { name: string; items: Array<{ description: string; qty: number; unit_cents: number }> }>();
      const problems: string[] = [];
      rows.forEach((r, n) => {
        const name = (r[col('client')] ?? '').trim();
        const c = clients.find((x) => x.name.trim().toLowerCase() === name.toLowerCase());
        const qty = Number(r[col('quantity')]); const unit = Number((r[col('unit_price')] ?? '').replace(/[$,]/g, ''));
        const desc = (r[col('description')] ?? '').trim();
        if (!c) { problems.push(`Row ${n + 2}: no client named "${name}".`); return; }
        if (!desc || !(qty > 0) || !Number.isFinite(unit)) { problems.push(`Row ${n + 2}: description, quantity or unit price is missing or invalid.`); return; }
        const g = byClient.get(c.id) ?? { name: c.name, items: [] };
        g.items.push({ description: desc, qty, unit_cents: Math.round(unit * 100) }); byClient.set(c.id, g);
      });
      if (problems.length) { setErr('Nothing was billed. Fix these rows and upload again.'); setRes(problems); return; }
      if (byClient.size === 0) { setErr('The file has no line items.'); return; }
      const out: string[] = [];
      for (const [id, g] of byClient) {
        const r = await fetch('/api/admin/invoices', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ advertiser_id: id, status: 'sent', line_items: g.items }) });
        const j = await r.json().catch(() => ({}));
        out.push(r.ok ? `${g.name}: invoice created.` : `${g.name}: ${j.error || 'could not create the invoice.'}`);
      }
      setRes(out); onDone();
    } finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Bill clients in bulk">
      <div className="w-full max-w-xl overflow-hidden rounded-[10px] bg-white">
        <div className="relative bg-[#F3F4F7] px-6 py-4 text-center text-base font-medium text-[color:var(--ds-ink)]">Bill clients in bulk
          <button type="button" aria-label="Close" onClick={onClose} style={{ border: 0, background: 'transparent' }} className="absolute right-4 top-3 text-lg text-[color:var(--ds-ink)]">&times;</button>
        </div>
        <div className="space-y-4 p-6 text-sm text-[color:var(--ds-ink)]">
          <p>Import a list of line items to create invoices in bulk. Invoices are issued but not emailed to clients.</p>
          <label className="flex h-24 cursor-pointer items-center justify-center rounded-[10px] border border-[color:var(--ds-line)] text-center">
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRes(null); setErr(''); }} />
            <span><span className="text-[color:var(--ds-primary)] underline">{file ? file.name : 'Choose a csv file'}</span>{!file && ' to upload a list of line items.'}</span>
          </label>
          <div className="text-right"><a className="text-[color:var(--ds-primary)] underline" href={`data:text/csv;charset=utf-8,${encodeURIComponent(example)}`} download="bulk-billing-example.csv">Download example file</a></div>
          {err && <div className={A.error}>{err}</div>}
          {res && <ul className="max-h-40 space-y-1 overflow-auto text-xs text-[color:var(--ds-body)]">{res.map((r, n) => <li key={n}>{r}</li>)}</ul>}
          <div className="flex justify-center gap-3"><button type="button" className={A.outline} onClick={onClose}>Close</button><button type="button" className={A.primary} disabled={!file || busy} onClick={run}>{busy ? 'Billing…' : 'Bill clients'}</button></div>
        </div>
      </div>
    </div>
  );
}
