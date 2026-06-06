import { redirect } from 'next/navigation';

// Default landing page for /admin. The login flow handles auth gating;
// unauthenticated visitors that hit /admin/crm will be bounced to /admin/login
// by middleware as usual.
export default function AdminRootPage() {
  redirect('/admin/crm');
}
