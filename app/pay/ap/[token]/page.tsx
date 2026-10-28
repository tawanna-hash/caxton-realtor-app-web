import { verifyPaymentSetupToken } from '@/lib/payment-setup-token';
import { getSql, ensureSchema } from '@/lib/db';
import { markApOpened } from '@/lib/server/ap-requests';
import { agreementSummary } from '@/lib/server/ap-email';
import { termsTextFor } from '@/lib/server/agreement-terms-store';
import { getPublishableKey, isStripeConfigured } from '@/lib/stripe';
import type { Agreement } from '@/lib/agreements';
import ApPay from './ApPay';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Payment setup', robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = verifyPaymentSetupToken(token);
  const shell = (children: React.ReactNode) => (
    <main style={{ background: '#F5F4F9', minHeight: '100vh', padding: '24px 12px', fontFamily: 'Arial,sans-serif', color: '#262626' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>{children}</div>
    </main>
  );
  if (!v.ok || v.subject.kind !== 'agreement') return shell(<p>This link is not valid.</p>);
  await ensureSchema();
  const rows = (await getSql()`SELECT * FROM agreements WHERE id = ${v.subject.id}`) as unknown as Agreement[];
  const ag = rows[0];
  if (!ag) return shell(<p>This link is not valid.</p>);
  await markApOpened(ag.id);
  const terms = await termsTextFor(null);
  const summary = agreementSummary(ag);
  return shell(
    <>
      <h1 style={{ fontSize: 22, color: '#301D5D' }}>Payment setup</h1>
      <div style={{ background: '#fff', borderRadius: 12, padding: 16, margin: '12px 0' }}>
        {summary.map(([k, val]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14 }}>
            <span style={{ color: '#6b6b6b' }}>{k}</span>
            <strong>{val}</strong>
          </div>
        ))}
        <details style={{ marginTop: 12, fontSize: 13 }}>
          <summary style={{ cursor: 'pointer', color: '#301D5D' }}>Read the terms of service</summary>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', maxHeight: 320, overflowY: 'auto', fontSize: 12 }}>{terms}</pre>
        </details>
      </div>
      <p style={{ fontSize: 13, color: '#6b6b6b' }}>The agreement is signed by the advertiser&apos;s authorized representative. Use this page to pay by bank account (ACH) or credit card.</p>
      {isStripeConfigured() ? <ApPay token={token} publishableKey={getPublishableKey() ?? ''} /> : <p>Online payment is not available right now.</p>}
    </>,
  );
}
