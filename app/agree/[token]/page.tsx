// app/agree/[token]/page.tsx — New-partner agreements (Beta): Review, Pay, Sign.
// Standalone, branded screen; the HMAC token in the URL is the credential.

import type { Metadata } from 'next';
import AgreeClient from './AgreeClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Review and sign your advertising agreement', robots: { index: false, follow: false } };

export default async function AgreePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[color:var(--ds-page)] px-4 py-8">
      <div className="mx-auto w-full max-w-5xl">
        <AgreeClient token={token} />
      </div>
    </div>
  );
}
