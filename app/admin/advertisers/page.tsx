// app/admin/advertisers/page.tsx
//
// The legacy "Advertisers" card view was merged into the CRM workspace at
// /admin/crm. This route now exists only to keep old deep links + bookmarks
// working — it permanently redirects to the unified page.

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function AdvertisersPage() {
  redirect('/admin/crm');
}
