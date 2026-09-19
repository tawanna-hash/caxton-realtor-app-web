// app/admin/team/page.tsx
//
// Admin · Team. Owner-only roster of everyone with dashboard login access —
// add new admins (emailed a set-password link), deactivate/reactivate, or
// permanently delete an account. This is the compliance/security surface
// for "who currently has access, and how do we remove someone who's left."

import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { isOwnerAdmin } from '@/lib/server/auth/owner';
import { query } from '@/lib/server/db/neon';
import PageTitle from '@/components/ui/PageTitle';
import TeamClient from './TeamClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface AdminRow {
  id: string;
  email: string;
  full_name: string;
  active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export default async function AdminTeamPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin/login');

  if (!isOwnerAdmin(admin)) {
    return (
      <main className="content-admin-shell">
        <header className="mb-8 sm:mb-10">
          <div className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
            Admin · Team
          </div>
          <PageTitle size="md">Team</PageTitle>
        </header>
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-gray-600">
          Only the account owner can view or manage admin access.
        </div>
      </main>
    );
  }

  const rows = await query<AdminRow>(
    `SELECT id, email, full_name, active, last_login_at::text AS last_login_at,
            created_at::text AS created_at
       FROM admins
      ORDER BY full_name ASC`,
  );

  const admins = rows.map((r) => ({
    id: r.id,
    email: r.email,
    fullName: r.full_name,
    active: r.active,
    lastLoginAt: r.last_login_at,
    createdAt: r.created_at,
    isOwner: isOwnerAdmin({ email: r.email }),
  }));

  return (
    <main className="content-admin-shell">
      <header className="mb-8 sm:mb-10">
        <div className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
          Admin · Team
        </div>
        <PageTitle size="md">Team</PageTitle>
        <p className="text-gray-600 mt-2">
          Everyone with login access to this dashboard. Add a new admin, or remove
          access for someone who&apos;s no longer with the company.
        </p>
      </header>
      <TeamClient initialAdmins={admins} />
    </main>
  );
}
