// app/renew/[token]/page.tsx — Renewals (Beta): one-tap renewal for partners.
// Standalone, branded screen; the HMAC token in the URL is the credential.

import type { Metadata } from 'next';
import RenewClient from './RenewClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Renew your advertising agreement', robots: { index: false, follow: false } };

export default async function RenewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#F7F7FA] px-4 py-8">
      <div className="mx-auto w-full max-w-lg">
        <RenewClient token={token} />
      </div>
    </div>
  );
}
