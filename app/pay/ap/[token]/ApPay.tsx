'use client';

import { useState } from 'react';
import EmbeddedPay from '@/app/agree/[token]/EmbeddedPay';

export default function ApPay({ token, publishableKey }: { token: string; publishableKey: string }) {
  const [done, setDone] = useState(false);
  const [method, setMethod] = useState<'bank' | 'card'>('bank');
  const [err, setErr] = useState<string | null>(null);
  if (done) return <div style={{ background: '#fff', borderRadius: 12, padding: 16 }}><strong>Thank you.</strong> Your payment details were added.</div>;
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 8 }}>
      <div style={{ display: 'flex', gap: 8, padding: 8 }}>
        {(['bank', 'card'] as const).map((m) => (
          <button key={m} type="button" onClick={() => { setErr(null); setMethod(m); }}
            style={{ flex: 1, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, border: `2px solid ${method === m ? '#7a1f2b' : '#ddd'}`, background: method === m ? '#fbf1f2' : '#fff' }}>
            {m === 'bank' ? 'Bank account (1% fee, max $5)' : 'Credit card (3% fee)'}
          </button>
        ))}
      </div>
      {err && <p style={{ color: '#b00020', padding: 8 }}>{err}</p>}
      <EmbeddedPay
        key={method}
        token={token}
        method={method}
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
