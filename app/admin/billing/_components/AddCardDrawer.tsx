'use client';

// app/admin/billing/_components/AddCardDrawer.tsx
//
// Admin-side "add / update card on file" modal for an already-signed
// agreement. SAVE-ONLY — nothing is charged here.
//
// Modeled on the sign wizard's StripePaymentBlock.tsx (Stripe Elements +
// PaymentElement), with two deliberate differences:
//   • the clientSecret comes from a SetupIntent
//     (POST /api/admin/agreements/[id]/setup-intent), not a PaymentIntent, and
//   • confirmation uses stripe.confirmSetup() instead of confirmPayment().
//
// After confirmSetup() resolves, Stripe only hands the browser a payment-method
// id (and not always even that), so the card snapshot is read server-side:
// POST /api/admin/agreements/[id]/setup-intent/confirm retrieves the
// SetupIntent with the payment method expanded and persists
// stripe_payment_method_id / card_type / card_number_last4 / card_expiration /
// stripe_customer_id on the agreement, then returns the snapshot for the
// caller to merge into its local state. No Stripe webhook involvement, so the
// "card added" UX is synchronous.
//
// Rendered ON TOP of an existing DrawerShell (z-50) at z-[60] so the invoice
// drawer underneath keeps its in-progress state.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { formatCardExpiration } from '@/lib/card-expiration';

/** Card snapshot persisted on the agreement, echoed back by the confirm route. */
export type SavedCardOnFile = {
  agreementId: string;
  customerId: string | null;
  paymentMethodId: string;
  cardType: string | null;
  cardLast4: string | null;
  cardExpiration: string | null;
};

type SetupIntentResp = {
  clientSecret: string;
  publishableKey: string;
  customerId: string;
  setupIntentId: string;
};

type ConfirmResp = {
  ok?: boolean;
  agreementId?: string;
  customerId?: string | null;
  paymentMethodId?: string;
  cardType?: string | null;
  cardLast4?: string | null;
  cardExpiration?: string | null;
  error?: string;
  detail?: string;
};

export function AddCardDrawer({
  agreementId,
  agreementLabel,
  currentCard,
  onClose,
  onSaved,
}: {
  agreementId: string;
  /** e.g. "Acme Realty · print_ad" — shown as context in the header. */
  agreementLabel?: string | null;
  /** Existing card snapshot, when the agreement already has one. */
  currentCard?: { cardType: string | null; cardLast4: string | null; cardExpiration: string | null } | null;
  onClose: () => void;
  /** Fired after the card is persisted on the agreement. */
  onSaved: (card: SavedCardOnFile) => void | Promise<void>;
}) {
  const [intent, setIntent] = useState<SetupIntentResp | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The SetupIntent is fetched once per mount (this modal is always mounted
  // fresh for one agreement), so `loading`/`error` start in the right state and
  // are only written from async callbacks — no synchronous setState in-effect.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/agreements/${agreementId}/setup-intent`, { method: 'POST' })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as
          | SetupIntentResp
          | { error?: string; detail?: string };
        if (!response.ok) {
          const bad = data as { error?: string; detail?: string };
          throw new Error(
            bad.detail ? `${bad.error ?? 'Could not start card setup'} — ${bad.detail}` : (bad.error ?? 'Could not start card setup'),
          );
        }
        if (cancelled) return;
        const ok = data as SetupIntentResp;
        setIntent(ok);
        setStripePromise(loadStripe(ok.publishableKey));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not start card setup');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agreementId]);

  const existingExp = formatCardExpiration(currentCard?.cardExpiration);
  const hasExistingCard = Boolean(currentCard?.cardLast4 || currentCard?.cardType);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium">Card on file</div>
            <h2 className="text-lg text-gray-900">{hasExistingCard ? 'Update card on file' : 'Add card on file'}</h2>
            {agreementLabel && <div className="mt-0.5 truncate text-xs text-gray-500">{agreementLabel}</div>}
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-gray-500 hover:text-gray-700">
            ×
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          {hasExistingCard && (
            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
              Replacing current card: {currentCard?.cardType ?? 'Card'} ••••{currentCard?.cardLast4 ?? '????'}
              {existingExp ? ` · exp ${existingExp}` : ''}
            </div>
          )}
          <p className="text-xs text-gray-600">
            The card is saved for future off-session charges. <strong>Nothing is charged now.</strong>
          </p>

          {loading && <p className="text-sm text-gray-500">Loading secure card fields…</p>}
          {error && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Card setup unavailable: {error}
            </div>
          )}

          {!loading && !error && intent && stripePromise && (
            <Elements
              stripe={stripePromise}
              options={{ clientSecret: intent.clientSecret, appearance: { theme: 'stripe', labels: 'floating' } }}
            >
              <SetupForm
                agreementId={agreementId}
                setupIntentId={intent.setupIntentId}
                onClose={onClose}
                onSaved={onSaved}
              />
            </Elements>
          )}

          {!loading && (error || !intent) && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SetupForm({
  agreementId,
  setupIntentId,
  onClose,
  onSaved,
}: {
  agreementId: string;
  setupIntentId: string;
  onClose: () => void;
  onSaved: (card: SavedCardOnFile) => void | Promise<void>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [elementReady, setElementReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [innerError, setInnerError] = useState<string | null>(null);

  const canSave = useMemo(() => Boolean(stripe && elements && elementReady && !saving), [stripe, elements, elementReady, saving]);

  const save = useCallback(async () => {
    if (!stripe || !elements) {
      setInnerError('Secure card fields are not ready. Please wait or reopen this dialog.');
      return;
    }
    setSaving(true);
    setInnerError(null);
    try {
      const { error: submitErr } = await elements.submit();
      if (submitErr) throw new Error(submitErr.message ?? 'Card validation failed');

      const result = await stripe.confirmSetup({ elements, redirect: 'if_required' });
      if (result.error) throw new Error(result.error.message ?? 'Card could not be saved');

      // Persist server-side: the browser cannot read brand / last4 / expiry.
      const response = await fetch(`/api/admin/agreements/${agreementId}/setup-intent/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setupIntentId }),
      });
      const data = (await response.json().catch(() => ({}))) as ConfirmResp;
      if (!response.ok || !data.paymentMethodId) {
        throw new Error(data.detail ?? data.error ?? `Could not save card (HTTP ${response.status})`);
      }

      await onSaved({
        agreementId: data.agreementId ?? agreementId,
        customerId: data.customerId ?? null,
        paymentMethodId: data.paymentMethodId,
        cardType: data.cardType ?? null,
        cardLast4: data.cardLast4 ?? null,
        cardExpiration: data.cardExpiration ?? null,
      });
      onClose();
    } catch (e) {
      setInnerError(e instanceof Error ? e.message : 'Card could not be saved');
    } finally {
      setSaving(false);
    }
  }, [stripe, elements, agreementId, setupIntentId, onSaved, onClose]);

  return (
    <div className="space-y-3">
      {!elementReady && !innerError && <p className="text-sm text-gray-500">Loading secure card fields…</p>}
      <PaymentElement
        options={{ layout: 'tabs' }}
        onLoaderStart={() => {
          setElementReady(false);
          setInnerError(null);
        }}
        onReady={() => {
          setElementReady(true);
          setInnerError(null);
        }}
        onLoadError={(event) => {
          setElementReady(false);
          setInnerError(event.error?.message ?? 'Secure card fields failed to load. Please reload the page.');
        }}
      />
      {innerError && <p className="rounded-md bg-red-50 p-2 text-sm text-red-600">{innerError}</p>}
      <div className="flex justify-end gap-2 border-t border-gray-200 pt-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => void save()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving card…' : 'Save card'}
        </button>
      </div>
    </div>
  );
}

export default AddCardDrawer;
