// app/admin/billing/sign/[token]/done/page.tsx
//
// Success page shown after the advertiser completes the sign wizard.

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Agreement Signed — RealtyLine' };

type PageProps = { params: Promise<{ token: string }>; searchParams: Promise<{ id?: string }> };

export default async function SignDonePage({ params, searchParams }: PageProps) {
  const { token } = await params;
  // id is kept for display purposes but PDF now uses the token route
  const { id } = await searchParams;

  return (
    <div className="min-h-screen bg-white flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-xl border border-emerald-200 shadow-sm p-10 text-center space-y-5">
          <div className="text-5xl">✅</div>

          <div>
            <div
              className="inline-block px-3 py-0.5 rounded text-white text-xs font-bold tracking-[0.2em] uppercase mb-3"
              style={{ background: '#dc2626' }}
            >
              RealtyLine
            </div>
            <h1 className="text-2xl text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>
              Agreement Signed!
            </h1>
          </div>

          <p className="text-sm text-gray-600 leading-relaxed">
            Thank you for signing your Advertising Agreement with RealtyLine.
            Your agreement has been digitally signed and is now on file.
          </p>

          {id && (
            <p className="text-xs text-gray-400">Agreement #{id}</p>
          )}

          <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-4 text-sm text-emerald-800">
            <strong>What happens next:</strong>
            <ul className="list-disc list-inside mt-2 space-y-1 text-left">
              <li>You&apos;ll receive a confirmation email shortly</li>
              <li>Your ad will run per the insertion order you reviewed</li>
              <li>Invoices will be sent monthly to your billing email</li>
            </ul>
          </div>

          <a
            href={`/api/sign/${token}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block w-full py-3 rounded-lg text-white font-medium text-sm hover:opacity-90 transition-opacity"
            style={{ background: '#dc2626' }}
          >
            Download Signed Agreement PDF
          </a>

          <p className="text-xs text-gray-400">
            Questions? Contact{' '}
            <a href="mailto:tawanna@myrealtyline.com" className="text-[#dc2626] hover:underline">
              tawanna@myrealtyline.com
            </a>
          </p>

          {/* Admin return path. The standalone sign-flow layout intentionally
              has no AppShell, so we surface a direct link back to /admin/billing
              for staff who arrive here to verify a signed agreement. The link
              is harmless for advertisers — they hit /admin/login if not signed in. */}
          <div className="pt-2 border-t border-gray-100">
            <a
              href="/admin/billing"
              className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
            >
              Back to Billing
            </a>
          </div>
        </div>

        {/* Token for debugging — visible only in dev */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4 text-xs text-gray-400 text-center font-mono break-all">
            token: {token}
          </div>
        )}
      </div>
    </div>
  );
}
