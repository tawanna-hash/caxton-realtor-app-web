// app/admin/five-points-board/page.tsx
//
// Coming-soon stub for the Five Points Board audience segment. This page
// exists so the nav entry under Audience has a target; the actual
// roster integration will be wired in later.

import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Five Points Board · RealtyLine Austin Admin',
};

export default async function FivePointsBoardPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin/login');

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-center">
      <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-3">
        Admin · Audience
      </div>
      <h1 className="text-3xl text-gray-900 mb-3" style={{ fontFamily: 'Georgia, serif' }}>
        Five Points Board
      </h1>
      <p className="text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
        Coming soon. The Five Points Board roster will plug into this view as
        a managed audience segment alongside ABOR Members and App Subscribers.
      </p>
      <div className="mt-8 inline-block rounded-full bg-amber-50 border border-amber-200 px-4 py-1.5 text-xs font-semibold tracking-wide uppercase text-amber-800">
        Planned · Not Yet Available
      </div>
    </main>
  );
}
