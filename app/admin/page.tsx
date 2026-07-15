import { redirect } from 'next/navigation';

// Default landing page for /admin. Publisher dashboard shows per-market
// health at a glance; drill in to /admin/crm, /admin/ads/*, /admin/magazines
// from the market cards. Unauthenticated visitors are bounced to
// /admin/login by middleware as usual.
export default function AdminRootPage() {
  redirect('/admin/dashboard');
}
