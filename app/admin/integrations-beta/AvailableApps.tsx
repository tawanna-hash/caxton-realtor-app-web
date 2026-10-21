'use client';

import { useEffect, useState } from 'react';
import { A } from '@/components/anchor/ui';

type Status = { stripe: boolean; stripe_mode: string | null; gmail_configured: boolean };

function Card({ name, blurb, badge, action }: { name: string; blurb: string; badge: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-between rounded-[10px] bg-white p-4">
      <div>
        <div className="flex items-center justify-between"><h3 className="text-base font-medium text-[color:var(--ds-ink)]">{name}</h3><span className="rounded-full bg-[color:var(--ds-page)] px-2.5 py-0.5 text-xs text-[color:var(--ds-body)]">{badge}</span></div>
        <p className="mt-1 text-sm text-[color:var(--ds-body)]">{blurb}</p>
      </div>
      <div className="mt-4">{action}</div>
    </div>
  );
}

export default function AvailableApps() {
  const [s, setS] = useState<Status | null>(null);
  useEffect(() => { fetch('/api/admin/integrations-status', { cache: 'no-store' }).then((r) => r.json()).then(setS).catch(() => setS(null)); }, []);
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-base font-medium text-[color:var(--ds-ink)]">Payments</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card name="Stripe" blurb="Card and ACH payments, payment links and payouts for invoices." badge={s ? (s.stripe ? `Connected (${s.stripe_mode})` : 'Not configured') : '…'} action={<a className={A.small} href="/admin/payouts-beta">View payouts</a>} />
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-base font-medium text-[color:var(--ds-ink)]">Accounting software</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card name="QuickBooks Online" blurb="Sync agreements and Stripe payments to your books." badge="Not built yet" action={<button className={A.small} disabled>Connect to QuickBooks</button>} />
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-base font-medium text-[color:var(--ds-ink)]">Communications</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card name="Gmail" blurb="Connect a Gmail mailbox so event emails can be scanned for the calendar. Sending client email through Gmail is off in Beta." badge={s ? (s.gmail_configured ? 'Available' : 'Not configured') : '…'} action={<a className={A.small} href="/api/admin/gmail-auth/start" aria-disabled={s ? !s.gmail_configured : true}>Connect Gmail</a>} />
        </div>
      </section>
    </div>
  );
}
