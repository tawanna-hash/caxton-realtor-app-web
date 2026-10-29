// app/admin/mailing/five-points/page.tsx
//
// Five Points Board of REALTORS member roster (holding-stage mailing rows).

import { redirect } from 'next/navigation';
import { ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import HoldingClient from '../holding/HoldingClient';

export const dynamic = 'force-dynamic';

async function isAdmin(): Promise<boolean> {
  try {
    return (await getCurrentAdmin()) !== null;
  } catch {
    return false;
  }
}

export default async function FivePointsMembersPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  await ensureSchema();
  return (
    <HoldingClient
      audience={{
        source: 'five-points-board',
        label: 'Five Points Board',
        blurb:
          'Five Points Board of REALTORS (Williamson & Bastrop counties) members collected from the board’s public member directory. Click any row to edit details, validate the address, or verify the email.',
        syncLabel: 'Sync Five Points Board',
        syncScraperPath: 'scrape-five-points',
      }}
    />
  );
}
