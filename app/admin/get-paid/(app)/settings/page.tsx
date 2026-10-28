import Link from 'next/link';
import { A } from '@/components/anchor/ui';

export const dynamic = 'force-dynamic';

const TILES: Array<{ title: string; items: Array<{ label: string; href: string; text: string }> }> = [
  {
    title: 'Payments',
    items: [
      { label: 'Payment settings', href: '/admin/get-paid/payment-settings', text: 'Processing fees and Stripe Checkout options' },
      { label: 'Integrations', href: '/admin/integrations-beta', text: 'Stripe, QuickBooks and Gmail status' },
      { label: 'API keys', href: '/admin/integrations-beta/api-keys', text: 'Generate and revoke API keys' },
    ],
  },
  {
    title: 'Agreements',
    items: [
      { label: 'Agreement terms', href: '/admin/get-paid/agreement-terms', text: 'Edit terms with effective dates' },
      { label: 'Templates', href: '/admin/agreements/templates-beta', text: 'Reusable agreement templates' },
      { label: 'Contacts', href: '/admin/agreements/clients/contacts', text: 'People inside each partner organization' },
    ],
  },
  {
    title: 'Catalog and business',
    items: [
      { label: 'Bundles', href: '/admin/services-beta/bundles', text: 'Group services into one priced bundle' },
      { label: 'Deposit slip', href: '/admin/reports-beta/deposit-slip', text: 'Checks totalled for the bank deposit' },
      { label: 'Business details', href: '/admin/settings-beta/business-details', text: 'Business name, address and brand' },
      { label: 'Team', href: '/admin/settings-beta/team', text: 'Invite and manage team members' },
      { label: 'Notifications', href: '/admin/settings-beta/notifications', text: 'Which notifications your team and clients receive' },
    ],
  },
];

export default function GetPaidSettings() {
  return (
    <div className="space-y-6">
      {TILES.map((g) => (
        <section key={g.title} className="space-y-2">
          <h2 className="text-base font-semibold text-[color:var(--ds-ink)]">{g.title}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((i) => (
              <Link key={i.href} href={i.href} className={`${A.card} block p-4 transition-shadow hover:shadow-md`}>
                <div className="text-sm font-medium text-[color:var(--ds-ink)]">{i.label}</div>
                <div className="mt-1 text-xs text-[color:var(--ds-body)]">{i.text}</div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
