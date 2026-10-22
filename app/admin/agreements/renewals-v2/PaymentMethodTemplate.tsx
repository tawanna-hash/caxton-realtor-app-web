'use client';

// Built-in Payment Method Setup email template. The brand, sender, domain and
// billing contact follow the selected market (Austin -> RealtyLine Austin,
// San Antonio -> Newsline San Antonio). Staff fill the client fields, preview the
// branded email, copy it, or send a test to themselves.

import { useEffect, useMemo, useState } from 'react';
import { A } from '@/components/anchor/ui';
import {
  MARKET_BRANDS,
  renderPaymentMethodHtml,
  type PaymentMethodFields,
  type TemplateMarket,
} from '@/lib/agreements-v2/payment-method-template';

const FIELDS: Array<[keyof PaymentMethodFields, string, string]> = [
  ['client_first_name', 'Client first name', 'Jane'],
  ['agreement_name_or_number', 'Agreement name or number', 'AGR-1042'],
  ['payment_terms', 'Payment amount or calculation', '$1,880 per month'],
  ['billing_schedule', 'Billing schedule', 'Monthly on the 1st'],
  ['payment_setup_url', 'Secure payment setup link', 'https://…'],
];

export default function PaymentMethodTemplate({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [market, setMarket] = useState<TemplateMarket>('austin');
  const [fields, setFields] = useState<PaymentMethodFields>({});
  const [copied, setCopied] = useState<string | null>(null);
  const out = useMemo(() => renderPaymentMethodHtml(market, fields), [market, fields]);
  const [view, setView] = useState<'preview' | 'text'>('preview');
  const [testTo, setTestTo] = useState('tawanna@myrealtyline.com');
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<{ ok: boolean; t: string } | null>(null);

  type Opt = { id: string; label: string; has_method: boolean; market: TemplateMarket; fields: PaymentMethodFields; to: string | null };
  const [opts, setOpts] = useState<Opt[] | null>(null);
  const [agId, setAgId] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkMsg, setLinkMsg] = useState<{ ok: boolean; t: string } | null>(null);
  useEffect(() => {
    if (!open || opts) return;
    fetch('/api/admin/agreements-v2/payment-method-template', { credentials: 'include' }).then((r) => r.json()).then((j) => setOpts(j.agreements ?? [])).catch(() => setOpts([]));
  }, [open, opts]);

  function pickAgreement(id: string) {
    setAgId(id); setLinkMsg(null);
    const o = opts?.find((x) => x.id === id);
    if (o) { setMarket(o.market); setFields((f) => ({ ...o.fields, payment_setup_url: f.payment_setup_url && agId === id ? f.payment_setup_url : '' })); }
  }

  async function createLink() {
    if (!agId) return;
    setLinking(true); setLinkMsg(null);
    try {
      const r = await fetch('/api/admin/agreements-v2/payment-method-template', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'link', agreement_id: agId }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setLinkMsg({ ok: false, t: j.error ?? 'Could not create the link.' }); return; }
      setMarket(j.market); setFields((f) => ({ ...f, ...j.fields, client_first_name: f.client_first_name || j.fields.client_first_name }));
      setLinkMsg({ ok: true, t: `Secure link created — valid until ${new Date(j.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.` });
    } catch { setLinkMsg({ ok: false, t: 'Could not create the link.' }); } finally { setLinking(false); }
  }

  async function sendTest() {
    setSending(true); setSendMsg(null);
    try {
      const r = await fetch('/api/admin/agreements-v2/payment-method-template', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ market, fields, to: testTo }) });
      const j = await r.json().catch(() => ({}));
      setSendMsg(r.ok ? { ok: true, t: `Test sent to ${j.to} from ${j.from}.` } : { ok: false, t: j.detail ?? j.error ?? 'Test could not be sent.' });
    } catch { setSendMsg({ ok: false, t: 'Test could not be sent.' }); } finally { setSending(false); }
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function copy(label: string, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(null), 1800); } catch { setCopied('Copy failed'); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label="Payment Method Setup template" onClick={onClose}>
      <div className="w-full max-w-4xl space-y-5 rounded-[12px] bg-white p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--ds-ink)]">Payment Method Setup</h2>
            <p className={A.subtitle}>The company name, sender and contact details follow the client&apos;s market.</p>
          </div>
          <button type="button" className={A.small} onClick={onClose}>Close</button>
        </div>

        <div className="grid gap-5 md:grid-cols-[260px_1fr]">
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[color:var(--ds-body)]">Client agreement</span>
              <select className={A.input} value={agId} onChange={(e) => pickAgreement(e.target.value)}>
                <option value="">{opts === null ? 'Loading agreements…' : 'Choose a client agreement'}</option>
                {(opts ?? []).map((o) => <option key={o.id} value={o.id}>{o.label}{o.has_method ? ' · method on file' : ''}</option>)}
              </select>
            </label>
            <button type="button" className={`${A.outline} w-full`} disabled={!agId || linking} onClick={createLink}>{linking ? 'Creating link…' : 'Create secure setup link'}</button>
            {linkMsg && <p className={`text-xs ${linkMsg.ok ? 'text-[#065F46]' : 'text-red-700'}`}>{linkMsg.t}</p>}
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[color:var(--ds-body)]">Market</span>
              <select className={A.input} value={market} onChange={(e) => setMarket(e.target.value as TemplateMarket)}>
                {Object.values(MARKET_BRANDS).map((b) => <option key={b.market} value={b.market}>{b.label} — {b.brand}</option>)}
              </select>
            </label>
            {FIELDS.map(([key, label, ph]) => (
              <label key={key} className="block space-y-1">
                <span className="text-xs font-medium text-[color:var(--ds-body)]">{label}</span>
                <input className={A.input} placeholder={ph} value={fields[key] ?? ''} onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))} />
              </label>
            ))}
            <p className="text-xs text-[color:var(--ds-body)]">Blank fields keep their {'{{placeholder}}'}. The secure link opens a branded page that hands off to Stripe to save a card or bank account (with Stripe&apos;s bank authorization). No charge is made.</p>
          </div>

          <div className="space-y-3">
            <div className="rounded-[10px] border border-[color:var(--ds-line)] p-3 text-sm">
              <div><span className="text-[color:var(--ds-body)]">From: </span><span className="text-[color:var(--ds-ink)]">{out.from}</span></div>
              <div className="mt-1"><span className="text-[color:var(--ds-body)]">Subject: </span><span className="font-medium text-[color:var(--ds-ink)]">{out.subject}</span></div>
            </div>
            <div className="flex gap-2">
              {(['preview', 'text'] as const).map((k) => (
                <button key={k} type="button" onClick={() => setView(k)} className={`rounded-full px-3 py-1 text-xs font-medium ${view === k ? 'bg-[color:var(--ds-primary)] text-white' : 'border border-[color:var(--ds-line)] text-[color:var(--ds-body)]'}`}>{k === 'preview' ? 'Email preview' : 'Plain text'}</button>
              ))}
            </div>
            {view === 'preview'
              ? <iframe title="Email preview" srcDoc={out.html} sandbox="" className="h-[460px] w-full rounded-[10px] border border-[color:var(--ds-line)] bg-white" />
              : <pre className="max-h-[460px] overflow-y-auto whitespace-pre-wrap rounded-[10px] border border-[color:var(--ds-line)] bg-[color:var(--ds-page)] p-4 font-sans text-sm leading-relaxed text-[color:var(--ds-ink)]">{out.body}</pre>}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={A.outline} onClick={() => copy('Subject copied', out.subject)}>Copy subject</button>
              <button type="button" className={A.primary} onClick={() => copy('Email copied', out.body)}>Copy email</button>
              <button type="button" className={A.outline} onClick={() => copy('HTML copied', out.html)}>Copy HTML</button>
              {copied && <span className="text-sm text-[color:var(--ds-body)]">{copied}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--ds-line)] pt-3">
              <input className={`${A.input} max-w-[280px]`} type="email" aria-label="Test recipient" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
              <button type="button" className={A.primary} disabled={sending || !testTo.trim()} onClick={sendTest}>{sending ? 'Sending…' : 'Send test'}</button>
              {sendMsg && <span className={`text-sm ${sendMsg.ok ? 'text-[#065F46]' : 'text-red-700'}`}>{sendMsg.t}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
