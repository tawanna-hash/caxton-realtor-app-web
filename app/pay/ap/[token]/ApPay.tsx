'use client';

import { useState } from 'react';
import EmbeddedPay from '@/app/agree/[token]/EmbeddedPay';

export default function ApPay({ token, publishableKey }: { token: string; publishableKey: string }) {
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (done) return <div style={{ background: '#fff', borderRadius: 12, padding: 16 }}><strong>Thank you.</strong> Your payment details were added.</div>;
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 8 }}>
      {err && <p style={{ color: '#b00020', padding: 8 }}>{err}</p>}
      <EmbeddedPay
        token={token}
        method="bank"
        publishableKey={publishableKey}
        endpoint={`/api/pay-ap/${encodeURIComponent(token)}/checkout`}
        onError={setErr}
        onComplete={async (sid) => {
          const r = await fetch(`/api/pay-ap/${encodeURIComponent(token)}/complete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: sid }) });
          if (r.ok) setDone(true);
          else setErr('Payment went through but we could not record it. Please contact us.');
        }}
      />
    </div>
  );
}
