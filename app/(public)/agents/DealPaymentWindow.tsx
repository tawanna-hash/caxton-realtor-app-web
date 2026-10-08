'use client';

import { useEffect, useState } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { X } from 'lucide-react';

type Intent = { clientSecret: string; publishableKey: string; paymentIntentId: string };

function PayForm({ dealId, paymentIntentId, onPaid, kind }: { dealId: string; paymentIntentId: string; onPaid: () => void; kind: 'deal' | 'extension' }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pay = async () => {
    if (!stripe || !elements || busy) return;
    setBusy(true);
    setError('');
    const result = await stripe.confirmPayment({ elements, redirect: 'if_required', confirmParams: { return_url: window.location.href } });
    if (result.error) { setError(result.error.message ?? 'The payment did not go through.'); setBusy(false); return; }
    const res = await fetch('/api/closing-time/billing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: kind === 'deal' ? 'confirm' : 'extension_confirm', dealId, paymentIntentId }) });
    if (!res.ok) { setError('The payment went through but could not be confirmed. Please contact support before trying again.'); setBusy(false); return; }
    onPaid();
  };
  return (
    <div>
      <PaymentElement />
      {error && <p className="mt-3 text-[13px] text-[#661102]" role="alert">{error}</p>}
      <button type="button" disabled={!stripe || busy} onClick={pay} className="mt-4 w-full hover:!bg-[#EFEAF8] hover:!text-[#301D5D]">{busy ? 'Processing' : kind === 'deal' ? 'Pay $12 And Open Deal' : 'Pay $5 And Extend Deal'}</button>
    </div>
  );
}

export default function DealPaymentWindow({ dealId, onPaid, onCancel, kind = 'deal', extensions = 0 }: { dealId: string; onPaid: () => void; onCancel: () => void; kind?: 'deal' | 'extension'; extensions?: number }) {
  const [intent, setIntent] = useState<Intent | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      const res = await fetch('/api/closing-time/billing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(kind === 'deal' ? { action: 'intent', dealId } : { action: 'extension_intent', dealId, extensions }) });
      const data = await res.json().catch(() => ({}));
      if (!live) return;
      if (!res.ok || !data.clientSecret) { setError(data?.error?.message ?? data?.error ?? 'Payments are not available right now.'); return; }
      setStripePromise(loadStripe(data.publishableKey));
      setIntent(data);
    })().catch(() => live && setError('Payments are not available right now.'));
    return () => { live = false; };
  }, [dealId, kind, extensions]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-label="Open this deal">
      <div className="w-full max-w-md rounded-xl border border-[#E6E5EC] bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold text-[#301D5D]">{kind === 'deal' ? 'Open This Deal' : 'Extend This Deal'}</h2>
            <p className="mt-1 text-[13px] text-[#4A4757]">{kind === 'deal' ? 'Your two free deals are used. $12 covers this deal from start to finish.' : 'Your free extension is used. $5 keeps this deal open 14 more days.'}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onCancel} className="!border-0 !bg-transparent !p-1 text-[#7A7787] hover:!bg-[#EFEAF8] hover:!text-[#301D5D]"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-4">
          {error && <p className="text-[13px] text-[#661102]" role="alert">{error}</p>}
          {!error && !intent && <p className="text-[13px] text-[#7A7787]">Loading payment form</p>}
          {intent && stripePromise && (
            <Elements stripe={stripePromise} options={{ clientSecret: intent.clientSecret, appearance: { theme: 'stripe', variables: { colorPrimary: '#301D5D', fontFamily: 'Inter, sans-serif', borderRadius: '8px' } } }}>
              <PayForm dealId={dealId} paymentIntentId={intent.paymentIntentId} onPaid={onPaid} kind={kind} />
            </Elements>
          )}
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-[#7A7787]">{kind === 'deal' ? 'Two free deals in total, for the life of your account. ' : 'The first extension on a deal is free. Each one after that is $5. '}Deals close automatically two weeks after the closing date, or 180 days after opening if no closing date is entered. No refunds.</p>
      </div>
    </div>
  );
}
