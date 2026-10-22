// Client Payment Method Setup page — public, reached from the signed link in
// the Payment Method Setup email. Branded by market (RealtyLine Austin /
// Newsline San Antonio). The button hands off to Stripe's hosted setup page;
// Stripe returns here with ?session_id= and we save the method on the agreement.
import type { Metadata } from 'next';
import { verifyPaymentSetupToken } from '@/lib/payment-setup-token';
import { loadSetupAgreement, marketForAgreement, saveFromCheckoutSession, type SavedMethod } from '@/lib/server/payment-setup';
import { brandForMarket } from '@/lib/agreements-v2/payment-method-template';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Add your payment method', robots: { index: false, follow: false } };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const money = (c: number | null | undefined) => (c == null ? null : (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' }));
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

function Shell({ brand, children }: { brand: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#F3F4F7] px-4 py-10">
      <div className="mx-auto max-w-xl overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="bg-[#301D5D] px-7 py-5 text-xl font-bold text-white">{brand}</div>
        <div className="space-y-5 px-7 py-7 text-[15px] leading-relaxed text-[#16132D]">{children}</div>
      </div>
    </main>
  );
}

function Note({ tone, children }: { tone: 'ok' | 'warn' | 'err'; children: React.ReactNode }) {
  const c = tone === 'ok' ? 'bg-[#E7F6EE] text-[#065F46]' : tone === 'warn' ? 'bg-[#FFF7E6] text-[#7A4B00]' : 'bg-[#FDECEC] text-[#9B1C1C]';
  return <div className={`rounded-xl px-4 py-3 text-sm ${c}`} role="status">{children}</div>;
}

export default async function PaymentSetupPage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;
  const v = verifyPaymentSetupToken(token);
  if (!v.ok) {
    const b = brandForMarket(null);
    return (
      <Shell brand="Payment method setup">
        <h1 className="text-xl font-semibold">{v.reason === 'expired' ? 'This link has expired' : 'This link is not valid'}</h1>
        <p>Please ask us for a new secure setup link. Reply to the email you received, or contact <a className="underline" href={`mailto:${b.billing_contact_email}`}>{b.billing_contact_email}</a>.</p>
      </Shell>
    );
  }
  const ag = await loadSetupAgreement(v.agreementId);
  if (!ag || ag.status === 'cancelled') {
    return <Shell brand="Payment method setup"><h1 className="text-xl font-semibold">This link is not valid</h1><p>Please ask us for a new secure setup link.</p></Shell>;
  }
  const brand = marketForAgreement(ag);
  const first = (ag.rep_name ?? '').trim().split(/\s+/)[0] || null;

  const sessionId = one(sp.session_id);
  let saved: SavedMethod | { error: string } | null = null;
  if (/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
    try { saved = await saveFromCheckoutSession(ag, sessionId); } catch (e) { console.error('[pay/setup] save failed', e); saved = { error: 'We could not confirm your setup. Please try again.' }; }
  }

  if (saved && !('error' in saved)) {
    return (
      <Shell brand={brand.brand}>
        <h1 className="text-2xl font-semibold">{saved.status === 'pending' ? 'Bank account submitted' : 'Payment method saved'}</h1>
        <Note tone={saved.status === 'pending' ? 'warn' : 'ok'}>
          {saved.label} ending in {saved.last4 ?? '••••'} {saved.status === 'pending' ? 'is waiting on bank verification. Stripe will email you if anything else is needed.' : 'is now on file for your advertising account.'}
        </Note>
        <p>You were not charged. Future payments will follow the amounts and billing schedule in your advertising agreement.</p>
        <p className="text-sm text-[#4E4B66]">Questions or changes? Contact <a className="underline" href={`mailto:${brand.billing_contact_email}`}>{brand.billing_contact_email}</a>.</p>
        <p className="text-sm text-[#4E4B66]">Thank you,<br />Tawanna Verock<br />{brand.brand}</p>
      </Shell>
    );
  }

  const err = saved && 'error' in saved ? saved.error
    : one(sp.error) === 'unavailable' ? 'Secure setup is temporarily unavailable. Please try again in a few minutes.'
    : one(sp.error) ? 'This link is not valid. Please ask us for a new one.' : null;
  const rate = money(ag.total_monthly_rate_cents ?? ag.amount_cents);
  const rows: Array<[string, string | null]> = [
    ['Advertiser', ag.company_name],
    ['Advertising', [ag.ad_size, ag.frequency].filter(Boolean).join(' · ') || null],
    ['Amount', rate ? `${rate}${ag.total_monthly_rate_cents ? ' per month' : ''}` : null],
    ['Term', ag.start_date ? `${new Date(ag.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}${ag.end_date ? ` – ${new Date(ag.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}` : ''}` : null],
  ];

  return (
    <Shell brand={brand.brand}>
      <h1 className="text-2xl font-semibold">Add your payment method</h1>
      {err && <Note tone="err">{err}</Note>}
      {one(sp.canceled) && !err && <Note tone="warn">Setup was not finished. You can start again whenever you&apos;re ready.</Note>}
      <p>{first ? `Hi ${first}, please` : 'Please'} add the card or bank account you&apos;d like to use for your {brand.brand} advertising.</p>
      <p><strong>You will not be charged now.</strong> Future payments will follow the amounts and billing schedule in your advertising agreement.</p>
      {rows.some(([, v]) => v) && (
        <dl className="divide-y divide-[#E2DFEC] border-y border-[#E2DFEC] text-sm">
          {rows.filter(([, v]) => v).map(([k, val]) => (
            <div key={k} className="flex justify-between gap-4 py-2"><dt className="text-[#4E4B66]">{k}</dt><dd className="text-right font-semibold">{val}</dd></div>
          ))}
        </dl>
      )}
      <form method="post" action={`/api/pay/setup/${token}`}>
        <button type="submit" className="w-full rounded-xl bg-[#301D5D] px-6 py-3.5 text-[15px] font-semibold text-white hover:bg-[#3D2775] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#301D5D]/30">Securely add payment method</button>
      </form>
      <p className="text-xs text-[#4E4B66]">You&apos;ll continue to Stripe, our payment processor, to enter a card or connect a bank account. {brand.brand} never sees your full card or bank account number.</p>
      <div className="rounded-xl bg-[#EEE8FD] px-4 py-3 text-xs leading-relaxed">
        <strong>Authorization.</strong> By saving a payment method, you authorize {brand.brand} to save it and use it for payments under your advertising agreement, according to the amounts and billing schedule stated there. To change your payment method or revoke authorization for future charges, contact <a className="underline" href={`mailto:${brand.billing_contact_email}`}>{brand.billing_contact_email}</a>.
      </div>
      <p className="text-sm text-[#4E4B66]">{brand.sender_email} · {brand.domain}</p>
    </Shell>
  );
}
