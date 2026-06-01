// app/admin/billing/sign/[token]/done/page.tsx
//
// Success page shown after the advertiser completes the sign wizard.

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Agreement Signed — RealtyLine' };

type PageProps = { params: Promise<{ token: string }>; searchParams: Promise<{ id?: string }> };

export default async function SignDonePage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { id } = await searchParams;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-xl border border-emerald-200 shadow-sm p-10 text-center space-y-5">
          <div className="text-5xl">✅</div>

          <div>
            <div
              className="inline-block px-3 py-0.5 rounded text-white text-xs font-bold tracking-[0.2em] uppercase mb-3"
              style={{ background: '#D22531' }}
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

          <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-4 text-sm text-emerald-800">
            <strong>What happens next:</strong>
            <ul className="list-disc list-inside mt-2 space-y-1 text-left">
              <li>You&apos;ll receive a confirmation email shortly</li>
              <li>Your ad will run per the insertion order you reviewed</li>
              <li>Invoices will be sent monthly to your billing email</li>
            </ul>
          </div>

          {id && (
            <a
              href={`/api/admin/agreements/${id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block w-full py-3 rounded-lg text-white font-medium text-sm hover:opacity-90 transition-opacity"
              style={{ background: '#D22531' }}
            >
              Download Signed Agreement PDF
            </a>
          )}

          <p className="text-xs text-gray-400">
            Questions? Contact{' '}
            <a href="mailto:tawanna@myrealtyline.com" className="text-[#D22531] hover:underline">
              tawanna@myrealtyline.com
            </a>
          </p>
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
