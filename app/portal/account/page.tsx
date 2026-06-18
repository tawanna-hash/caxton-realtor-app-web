// app/portal/account/page.tsx
//
// Shows the advertiser their current contact info. Editable via POST to
// /api/portal/account. Server component renders form; client handles submit.

import { redirect } from 'next/navigation';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import AccountClient from './AccountClient';

import PageTitle from '@/components/ui/PageTitle';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function PortalAccountPage() {
  const user = await getCurrentPortalUser();
  if (!user) redirect('/portal/error?code=auth');

  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT id, name, company, phone, office_phone, website,
           address, city, state, zip, portal_email, email,
           footer_template
    FROM advertisers WHERE id = ${user.advertiser_id}
  `) as unknown as {
    id: number;
    name: string;
    company: string | null;
    phone: string | null;
    office_phone: string | null;
    website: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    portal_email: string | null;
    email: string | null;
    footer_template: string | null;
  }[];
  const initial = rows[0];

  return (
    <div className="space-y-6">
      <header>
        <div className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Portal</div>
        <PageTitle size="md">Account</PageTitle>
        <p className="text-gray-600 mt-1">Keep your contact info current. Changes are saved automatically.</p>
      </header>
      <AccountClient initial={initial} />
    </div>
  );
}
