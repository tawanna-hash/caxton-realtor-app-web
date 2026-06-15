// app/admin/billing/page.tsx
//
// Legacy redirect. The billing workspace has been split into two sibling
// pages: /admin/agreements (contracts + renewals) and /admin/invoices
// (billable charges). Anything that still links to /admin/billing — old
// emails, bookmarks, cron lifecycle emails — lands on Agreements.
//
// The public sign wizard at /admin/billing/sign/[token] is unaffected
// because Next.js only matches this file for the exact /admin/billing
// path.

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function BillingRedirectPage() {
  redirect('/admin/agreements');
}
