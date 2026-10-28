import { verifyPaymentSetupToken } from '@/lib/payment-setup-token';
import { getSql, ensureSchema } from '@/lib/db';
import { getPublishableKey, isStripeConfigured } from '@/lib/stripe';
import SetupPay from './SetupPay';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Update payment method', robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = verifyPaymentSetupToken(token);
  const shell = (children: React.ReactNode) => (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[color:var(--ds-page)] px-4 py-8" data-anchor-ui="true">
      <div className="mx-auto w-full max-w-2xl space-y-4">{children}</div>
    </div>
  );
  if (!v.ok || v.subject.kind !== 'client') return shell(<p>This link is not valid.</p>);
  await ensureSchema();
  const rows = (await getSql()`SELECT name FROM advertisers WHERE id = ${v.subject.id}`) as unknown as Array<{ name: string }>;
  if (!rows[0]) return shell(<p>This link is not valid.</p>);
  return shell(
    <>
      <h1 className="text-xl font-semibold text-[color:var(--ds-ink)]">Update payment method</h1>
      <p className="text-sm text-[color:var(--ds-body)]">Account: <strong>{rows[0].name}</strong>. Add a bank account (ACH) or credit card to keep on file. Nothing is charged today.</p>
      {isStripeConfigured() ? <SetupPay token={token} publishableKey={getPublishableKey() ?? ''} /> : <p>Online payment setup is not available right now.</p>}
    </>,
  );
}
