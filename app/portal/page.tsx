// app/portal/page.tsx
//
// Portal overview — file count, open form assignments, open invoices,
// active agreements.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentPortalUser } from '@/lib/server/portal-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function PortalHome() {
  const user = await getCurrentPortalUser();
  if (!user) redirect('/portal/error?code=auth');

  await ensureSchema();
  const sql = getSql();

  const [files, forms, invoices, agreements] = (await Promise.all([
    sql`SELECT COUNT(*)::int AS n FROM portal_files WHERE advertiser_id = ${user.advertiser_id} AND visibility = 'visible'`,
    sql`SELECT COUNT(*)::int AS n FROM portal_form_assignments WHERE advertiser_id = ${user.advertiser_id} AND submitted_at IS NULL`,
    sql`
      SELECT COUNT(*)::int AS n, COALESCE(SUM(total_cents), 0)::int AS total_cents
      FROM invoices
      WHERE advertiser_id = ${user.advertiser_id} AND status IN ('issued', 'partial')
    `,
    sql`SELECT COUNT(*)::int AS n FROM agreements WHERE advertiser_id = ${user.advertiser_id} AND status = 'active'`,
  ])) as unknown as [
    { n: number }[],
    { n: number }[],
    { n: number; total_cents: number }[],
    { n: number }[],
  ];

  const open = forms[0]?.n ?? 0;
  const fmtUsd = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-8">
      <header>
        <div className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
          Welcome back
        </div>
        <h1 className="font-serif text-3xl text-gray-900">
          {user.name}
        </h1>
        <p className="text-gray-600 mt-1">
          Session ends {new Date(user.session_expires_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} or when you close your browser.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card label="Files" value={files[0]?.n ?? 0} href="/portal/files" />
        <Card label="Forms to complete" value={open} href="/portal/forms" tone={open > 0 ? 'attention' : 'neutral'} />
        <Card label="Open invoices" value={invoices[0]?.n ?? 0} sub={fmtUsd(invoices[0]?.total_cents ?? 0)} />
        <Card label="Active agreements" value={agreements[0]?.n ?? 0} />
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="font-serif text-xl text-gray-900 mb-3">
          What you can do here
        </h2>
        <ul className="space-y-2 text-gray-700 text-sm">
          <li>• <Link href="/portal/files" className="text-blue-700 hover:underline">View files</Link> we&apos;ve shared with you (agreements, invoices, proofs, photos).</li>
          <li>• <Link href="/portal/forms" className="text-blue-700 hover:underline">Complete forms</Link> requested by your account manager.</li>
          <li>• <Link href="/portal/account" className="text-blue-700 hover:underline">Update your contact info</Link>.</li>
        </ul>
      </section>
    </div>
  );
}

function Card({ label, value, sub, href, tone = 'neutral' }: {
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
  tone?: 'neutral' | 'attention';
}) {
  const ring = tone === 'attention' ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white';
  const body = (
    <div className={`rounded-xl border p-4 ${ring}`}>
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className="font-serif text-3xl text-gray-900 mt-1">
        {value}
      </div>
      {sub && <div className="text-sm text-gray-600 mt-1">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
