import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { A } from '@/components/anchor/ui';

export const dynamic = 'force-dynamic';

type MethodState = { key: string; label: string; available: boolean; on: boolean };

const META_KEYS = new Set(['id', 'object', 'active', 'application', 'is_default', 'livemode', 'name', 'parent']);

const LABELS: Record<string, string> = {
  us_bank_account: 'ACH Direct Debit (US bank account)',
  card: 'Cards',
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
  link: 'Link',
  cashapp: 'Cash App Pay',
  affirm: 'Affirm',
  klarna: 'Klarna',
  afterpay_clearpay: 'Afterpay / Clearpay',
  amazon_pay: 'Amazon Pay',
  paypal: 'PayPal',
  wechat_pay: 'WeChat Pay',
  alipay: 'Alipay',
  customer_balance: 'Bank transfer (customer balance)',
};
const pretty = (k: string) => LABELS[k] ?? k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

async function load(): Promise<{ name: string; methods: MethodState[] } | { error: string }> {
  if (!isStripeConfigured()) return { error: 'Stripe is not configured.' };
  try {
    const list = await getStripe().paymentMethodConfigurations.list({ limit: 20 });
    const cfg = list.data.find((c) => c.is_default) ?? list.data[0];
    if (!cfg) return { error: 'No payment method configuration found in Stripe.' };
    const methods: MethodState[] = [];
    for (const [key, v] of Object.entries(cfg as unknown as Record<string, unknown>)) {
      if (META_KEYS.has(key) || !v || typeof v !== 'object') continue;
      const m = v as { available?: boolean; display_preference?: { value?: string } };
      if (typeof m.available !== 'boolean') continue;
      methods.push({ key, label: pretty(key), available: m.available, on: m.display_preference?.value === 'on' });
    }
    methods.sort((a, b) => Number(b.on) - Number(a.on) || Number(b.available) - Number(a.available) || a.label.localeCompare(b.label));
    return { name: cfg.name || 'Default configuration', methods };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not load payment methods from Stripe.' };
  }
}

export default async function PaymentOptionsPage() {
  if (!(await getCurrentAdmin())) redirect('/admin/login');
  const data = await load();
  const used = new Set(['card', 'us_bank_account']);
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6" data-anchor-ui="true" data-no-auto-open>
      <div>
        <h1 className={A.title}>Payment options</h1>
        <p className="mt-1 text-sm text-[color:var(--ds-body)]">Every payment method in your Stripe account, read live from Stripe.</p>
      </div>
      {'error' in data ? (
        <p className="rounded-lg border border-[color:var(--ds-line)] p-4 text-sm">{data.error}</p>
      ) : (
        <>
          <p className="text-xs text-[color:var(--ds-body)]">Configuration: {data.name}</p>
          <div className="overflow-hidden rounded-lg border border-[color:var(--ds-line)]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[color:var(--ds-line)] text-xs text-[color:var(--ds-body)]">
                  <th className="p-3 font-medium">Payment method</th>
                  <th className="p-3 font-medium">Stripe status</th>
                  <th className="p-3 font-medium">Used in Get Paid</th>
                </tr>
              </thead>
              <tbody>
                {data.methods.map((m) => (
                  <tr key={m.key} className="border-b border-[color:var(--ds-line)] last:border-0">
                    <td className="p-3 font-medium text-[color:var(--ds-ink)]">{m.label}</td>
                    <td className="p-3">{m.on && m.available ? 'On' : m.available ? 'Available, off' : 'Not available'}</td>
                    <td className="p-3">{used.has(m.key) ? (m.key === 'card' ? 'Yes (card, 3% surcharge)' : 'Yes (ACH debit)') : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <a className={A.small} href="https://dashboard.stripe.com/settings/payment_methods" target="_blank" rel="noreferrer">Manage in Stripe</a>
        </>
      )}
    </div>
  );
}
