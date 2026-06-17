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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-xl border border-red-200 p-10 max-w-md text-center">
          <div className="text-3xl mb-3">⚠️</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2" style={{ fontFamily: 'Georgia, serif' }}>
            Link expired or invalid
          </h1>
          <p className="text-sm text-gray-600">
            This signing link has expired or is not valid. Please contact{' '}
            <a href="mailto:tawanna@myrealtyline.com" className="text-[#dc2626] hover:underline">
              tawanna@myrealtyline.com
            </a>{' '}
            to request a new link.
          </p>
        </div>
      </div>
    );
  }

  const { agreementId } = parsed;

  let ag: Agreement | null = null;
  try {
    const sql = getSql();
    const rows = await sql`SELECT * FROM agreements WHERE id = ${agreementId}` as unknown as Agreement[];
    ag = rows[0] ?? null;
  } catch {
    ag = null;
  }

  if (!ag) return notFound();

  if (ag.status === 'signed' || ag.status === 'active') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-xl border border-emerald-200 p-10 max-w-md text-center">
          <div className="text-4xl mb-3">✓</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2" style={{ fontFamily: 'Georgia, serif' }}>
            Already signed
          </h1>
          <p className="text-sm text-gray-600">
            This agreement has already been signed
            {ag.signer_name ? ` by ${ag.signer_name}` : ''}.
          </p>
          <a
            href={`/api/admin/agreements/${agreementId}/pdf`}
            className="inline-block mt-4 px-4 py-2 rounded bg-[#dc2626] text-white text-sm hover:opacity-90"
          >
            Download PDF
          </a>
        </div>
      </div>
    );
  }

  return <SignWizard ag={ag} token={token} />;
}
