'use client';

import { useMemo, useRef } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';

type Props = {
  token: string;
  method: 'card' | 'link' | 'bank';
  publishableKey: string;
  onComplete: (sessionId: string) => void;
  onError: (message: string) => void;
};

export default function EmbeddedPay({ token, method, publishableKey, onComplete, onError }: Props) {
  const stripe = useMemo(() => loadStripe(publishableKey), [publishableKey]);
  const sid = useRef('');
  const options = useMemo(() => ({
    fetchClientSecret: async () => {
      const res = await fetch(`/api/agree-v2/${encodeURIComponent(token)}/checkout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.clientSecret) {
        onError(j.error || 'Could not start checkout.');
        throw new Error(j.error || 'checkout failed');
      }
      sid.current = j.sessionId;
      return j.clientSecret as string;
    },
    onComplete: () => onComplete(sid.current),
  }), [token, method, onComplete, onError]);
  return (
    <EmbeddedCheckoutProvider stripe={stripe} options={options}>
      <EmbeddedCheckout />
    </EmbeddedCheckoutProvider>
  );
}
