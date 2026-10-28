import { verifyPaymentSetupToken } from '@/lib/payment-setup-token';
import { getSql, ensureSchema } from '@/lib/db';
import { markApOpened } from '@/lib/server/ap-requests';
import { agreementSummary } from '@/lib/server/ap-email';
import { brandForPublication } from '@/lib/email-templates';
import { getPublishableKey, isStripeConfigured } from '@/lib/stripe';
import type { Agreement } from '@/lib/agreements';
import ApPay from './ApPay';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Payment setup', robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = verifyPaymentSetupToken(token);
  const shell = (children: React.ReactNode) => (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[color:var(--ds-page)] px-4 py-8" data-anchor-ui="true">
      <div className="mx-auto w-full max-w-2xl space-y-4">{children}</div>
    </div>
  );
  if (!v.ok || v.subject.kind !== 'agreement') return shell(<p>This link is not valid.</p>);
  await ensureSchema();
  const rows = (await getSql()`SELECT * FROM agreements WHERE id = ${v.subject.id}`) as unknown as Agreement[];
  const ag = rows[0];
  if (!ag) return shell(<p>This link is not valid.</p>);
  await markApOpened(ag.id);
  const summary = agreementSummary(ag);
  return shell(
    <>
      <p className="text-lg font-semibold text-[color:var(--ds-ink)]">{brandForPublication(ag.publication).brandName}</p>
      <h1 className="text-xl font-semibold text-[color:var(--ds-ink)]">Payment setup</h1>
      <div className="rounded-[14px] border border-[color:var(--ds-line)] bg-white p-6 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-[color:var(--ds-ink)]">Agreement details</p>
        {summary.map(([k, val]) => (
          <div key={k} className="flex justify-between gap-4 border-t border-[color:var(--ds-line)] py-2 text-sm first:border-t-0">
            <span className="text-[color:var(--ds-body)]">{k}</span>
            <strong className="text-right text-[color:var(--ds-ink)]">{val}</strong>
          </div>
        ))}
      </div>
      <p className="text-sm text-[color:var(--ds-body)]">The agreement is signed by the advertiser&apos;s authorized representative. Use this page to pay by bank account (ACH) or credit card.</p>
      {isStripeConfigured() ? <ApPay token={token} publishableKey={getPublishableKey() ?? ''} /> : <p>Online payment is not available right now.</p>}
    </>,
  );
}
