'use client';

import { useState } from 'react';
import EmbeddedPay from '@/app/agree/[token]/EmbeddedPay';

export default function SetupPay({ token, publishableKey }: { token: string; publishableKey: string }) {
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (done) return <div className="rounded-[14px] border border-[color:var(--ds-line)] bg-white p-6 shadow-sm text-[color:var(--ds-ink)]"><strong>Thank you.</strong> Your payment method is on file.</div>;
  return (
    <div className="rounded-[14px] border border-[color:var(--ds-line)] bg-white p-4 shadow-sm">
      <p className="px-2 pb-2 text-sm text-[color:var(--ds-body)]">Choose how you would like to pay: credit or debit card, bank account (ACH) or Link. Card payments carry a 3% processing fee. Bank payments carry a 1% fee, up to $5.</p>
      {err && <p style={{ color: '#b00020', padding: 8 }}>{err}</p>}
      <EmbeddedPay
        token={token}
        method="card"
        publishableKey={publishableKey}
        endpoint={`/api/pay-setup/${encodeURIComponent(token)}/checkout`}
        onError={setErr}
        onComplete={async (sid) => {
          const r = await fetch(`/api/pay-setup/${encodeURIComponent(token)}/complete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: sid }) });
          if (r.ok) setDone(true);
          else setErr('Your payment method was saved but we could not record it. Please contact us.');
        }}
      />
    </div>
  );
}
