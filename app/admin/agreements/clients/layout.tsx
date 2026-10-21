// Clients (Beta): the record that exists once a proposal is approved. Clients,
// Contacts and a client page with Summary, Upcoming invoices and Issued
// invoices, laid out like Anchor. Read-only: it reads existing records.

import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import ClientsNav from './ClientsNav';

export const dynamic = 'force-dynamic';

export default async function ClientsLayout({ children }: { children: React.ReactNode }) {
  if (!(await getCurrentAdmin())) redirect('/admin/login');
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6" data-anchor-ui="true" data-no-auto-open>
      <ClientsNav />
      {children}
    </div>
  );
}
