// app/admin/billing/sign/[token]/StripePaymentBlock.tsx
//
// Stripe Payment Element inline card capture for the Sign Wizard.
// PCI-scope is reduced — raw card never touches our server.
//
// Exposes an imperative handle so SignWizard's Step 5 submit can call
// confirmPayment() right before / after persisting the signature.

'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';

export interface StripePaymentHandle {
  /** Returns paymentIntentId on success; throws on failure. Safe to call when Stripe is disabled (no-op). */
  confirm(): Promise<{ paymentIntentId: string } | { skipped: true }>;
  isReady: boolean;
}

interface Props {
  token: string;
  /** Cents. If 0/missing the block renders an "ad rate required" message instead. */
  adRateCents: number;
  /** Force re-fetch the PaymentIntent when amount changes. */
  refreshKey?: string | number;
  /**
   * Called whenever the form's readiness changes. Parent should disable any
   * "Authorize Card" / submit button until `ready === true`.
   */
  onReadyChange?: (ready: boolean) => void;
}

interface PIResp {
  clientSecret: string;
  publishableKey: string;
  paymentIntentId: string;
  amountCents: number;
  baseCents: number;
  surchargeCents: number;
}

const StripePaymentBlock = forwardRef<StripePaymentHandle, Props>(function StripePaymentBlock(
  { token, adRateCents, refreshKey, onReadyChange },
  ref,
) {
  const [pi, setPi] = useState<PIResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);

  // Fetch PI when amount is valid
  useEffect(() => {
    let cancelled = false;
    if (!adRateCents || adRateCents <= 0) {
      setPi(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/sign/${token}/payment-intent`, { method: 'POST' })
      .then(async (r) => {
        const j = (await r.json()) as PIResp | { error: string; detail?: string };
        if (!r.ok) {
          const j2 = j as { error: string; detail?: string };
          const msg = j2.detail ? `${j2.error} — ${j2.detail}` : (j2.error ?? 'Failed to start payment');
          throw new Error(msg);
        }
        if (cancelled) return;
        setPi(j as PIResp);
        setStripePromise(loadStripe((j as PIResp).publishableKey));
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to start payment');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, adRateCents, refreshKey]);

  // Inner component (has access to Elements context)
  const Inner = useMemo(
    () =>
      forwardRef<StripePaymentHandle, { paymentIntentId: string; onReady?: (ready: boolean) => void }>(function Inner({ paymentIntentId, onReady }, innerRef) {
        const stripe = useStripe();
        const elements = useElements();
        const [confirming, setConfirming] = useState(false);
        const [innerError, setInnerError] = useState<string | null>(null);

        // Notify parent when Stripe + Elements are mounted (form is ready).
        useEffect(() => {
          onReady?.(!!stripe && !!elements);
        }, [stripe, elements, onReady]);

        useImperativeHandle(
          innerRef,
          (): StripePaymentHandle => ({
            isReady: !!stripe && !!elements,
            async confirm() {
              if (!stripe || !elements) throw new Error('Stripe not ready');
              setConfirming(true);
              setInnerError(null);
              try {
                const { error: submitErr } = await elements.submit();
                if (submitErr) throw new Error(submitErr.message ?? 'Card validation failed');

                const result = await stripe.confirmPayment({
                  elements,
                  redirect: 'if_required',
                });
                if (result.error) {
                  throw new Error(result.error.message ?? 'Payment failed');
                }
                return { paymentIntentId };
              } catch (e) {
                const msg = e instanceof Error ? e.message : 'Payment failed';
                setInnerError(msg);
                throw e;
              } finally {
                setConfirming(false);
              }
            },
          }),
          [stripe, elements, paymentIntentId],
        );

        return (
          <div className="space-y-3">
            <PaymentElement options={{ layout: 'tabs' }} />
            {confirming && <p className="text-sm text-gray-500">Authorizing card…</p>}
            {innerError && (
              <p className="text-sm text-red-600 bg-red-50 rounded-md p-2">{innerError}</p>
            )}
          </div>
        );
      }),
    [],
  );

  const innerRef = useRef<StripePaymentHandle>(null);
  useImperativeHandle(
    ref,
    (): StripePaymentHandle => ({
      get isReady() {
        return innerRef.current?.isReady ?? false;
      },
      async confirm() {
        if (!pi) {
          // Stripe not configured / amount missing — skip silently so Step 5 submit can fall back.
          return { skipped: true };
        }
        if (!innerRef.current) throw new Error('Payment form not ready');
        return innerRef.current.confirm();
      },
    }),
    [pi],
  );

  // Whenever PaymentIntent / Elements are torn down (e.g. amount changes
  // and we re-fetch), report not-ready so the parent disables Authorize.
  useEffect(() => {
    if (!pi || !stripePromise) {
      onReadyChange?.(false);
    }
  }, [pi, stripePromise, onReadyChange]);

  if (!adRateCents || adRateCents <= 0) {
    return (
      <div className="text-sm text-gray-600 bg-gray-50 rounded-md p-3 border border-gray-200">
        Select an ad size & frequency on the previous step to enable card payment.
      </div>
    );
  }

  if (loading) {
    return <div className="text-sm text-gray-500">Loading secure payment form…</div>;
  }

  if (error) {
    return (
      <div className="text-sm text-amber-800 bg-amber-50 rounded-md p-3 border border-amber-200">
        Card payment unavailable: {error}.<br />
        Your signature will still be saved. We&apos;ll follow up with an invoice link.
      </div>
    );
  }

  if (!pi || !stripePromise) return null;

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret: pi.clientSecret,
        appearance: { theme: 'stripe', labels: 'floating' },
      }}
    >
      <Inner ref={innerRef} paymentIntentId={pi.paymentIntentId} onReady={onReadyChange} />
    </Elements>
  );
});

export default StripePaymentBlock;
