// app/admin/billing/sign/[token]/page.tsx
//
// Server component: verifies HMAC token, loads agreement, renders SignWizard.
// This route is PUBLIC — no admin auth (the token IS the auth).

import { notFound } from 'next/navigation';
import { verifyToken } from '@/lib/sign-token';
import { getSql } from '@/lib/db';
import type { Agreement } from '@/lib/agreements';
import SignWizard from './SignWizard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type PageProps = { params: Promise<{ token: string }> };

export default async function SignPage({ params }: PageProps) {
  const { token } = await params;

  const parsed = verifyToken(token);
  if (!parsed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="bg-white rounded-md border border-gray-200 p-10 max-w-md text-center">
          <div className="text-3xl mb-3">⚠️</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Link expired or invalid
          </h1>
          <p className="text-sm text-gray-600">
            This signing link has expired or is not valid. Please contact{' '}
            <a href="mailto:tawanna@realtynewsnow.app" className="text-[#5a0e5f] hover:underline">
              tawanna@realtynewsnow.app
            </a>{' '}
            to request a new link.
          </p>
        </div>
      </div>
    );
  }

  const { agreementId } = parsed;

  let ag: Agreement | null = null;
  let lineItemRows: Array<{
    id: string;
    agreement_id: string;
    line_no: number;
    channel: 'print' | 'email' | 'app';
    package_id: string;
    package_label: string;
    ad_size: string | null;
    frequency: string | null;
    quantity: number;
    unit_cents: number;
    amount_cents: number;
    publication: string | null;
    start_date: string | null;
    end_date: string | null;
    pay_now: boolean;
    meta: Record<string, unknown>;
    preferred_send_dates: string[] | null;
  }> = [];
  try {
    const sql = getSql();
    const rows = await sql`SELECT * FROM agreements WHERE id = ${agreementId}` as unknown as Agreement[];

    lineItemRows = (await sql`
      SELECT
        id, agreement_id, line_no, channel, package_id, package_label,
        ad_size, frequency, quantity, unit_cents, amount_cents, publication,
        to_char(start_date, 'YYYY-MM-DD') AS start_date,
        to_char(end_date,   'YYYY-MM-DD') AS end_date,
        pay_now, meta,
        to_char(expiration_date, 'YYYY-MM-DD') AS expiration_date,
        to_char(renewal_reminder_date, 'YYYY-MM-DD') AS renewal_reminder_date,
        ad_timing_months, ad_timing_years, preferred_send_dates
      FROM agreement_line_items
      WHERE agreement_id = ${agreementId}
      ORDER BY line_no ASC
    `.catch(() => [] as unknown[])) as unknown as Array<{
    id: string;
    agreement_id: string;
    line_no: number;
    channel: 'print' | 'email' | 'app';
    package_id: string;
    package_label: string;
    ad_size: string | null;
    frequency: string | null;
    quantity: number;
    unit_cents: number;
    amount_cents: number;
    publication: string | null;
    start_date: string | null;
    end_date: string | null;
    pay_now: boolean;
    meta: Record<string, unknown>;
    preferred_send_dates: string[] | null;
  }>;
    ag = rows[0] ?? null;
  } catch {
    ag = null;
  }

  if (!ag) return notFound();

  if (ag.status === 'signed' || ag.status === 'active') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="bg-white rounded-md border border-emerald-200 p-10 max-w-md text-center">
          <div className="text-4xl mb-3">✓</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Already signed
          </h1>
          <p className="text-sm text-gray-600">
            This agreement has already been signed
            {ag.signer_name ? ` by ${ag.signer_name}` : ''}.
          </p>
          <a
            href={`/api/admin/agreements/${agreementId}/pdf`}
            className="inline-block mt-4 px-4 py-2 rounded-md bg-[#5a0e5f] text-white text-sm hover:opacity-90"
          >
            Download PDF
          </a>
        </div>
      </div>
    );
  }

  return <SignWizard ag={ag} token={token} lineItems={lineItemRows} />;
}
