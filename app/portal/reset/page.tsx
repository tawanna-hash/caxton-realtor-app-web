// app/portal/reset/page.tsx — choose a new password from the emailed link.
// Renders as a standalone, branded screen (covers the portal shell, which has
// no navigation for signed-out visitors).

import PageTitle from '@/components/ui/PageTitle';
import { getSql } from '@/lib/db';
import { hashMagicLinkToken } from '@/lib/portal';
import ResetForm from './ResetForm';

export const dynamic = 'force-dynamic';

async function publicationForToken(token: string | undefined): Promise<string> {
  if (!token) return '';
  try {
    const rows = (await getSql()`
      SELECT a.publication FROM portal_magic_links l
        JOIN advertisers a ON a.id = l.advertiser_id
       WHERE l.token_hash = ${hashMagicLinkToken(token)} AND l.created_by = 'portal-reset'
    `) as unknown as { publication: string | null }[];
    return rows[0]?.publication ?? '';
  } catch {
    return '';
  }
}

export default async function PortalResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const isNewsline = /san.?antonio|newsline/i.test(await publicationForToken(token));
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#F6F5FB] px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={isNewsline ? '/brand/newsline-logo.png' : '/brand/realtyline-logo.png'}
          alt={isNewsline ? 'Newsline San Antonio' : 'RealtyLine'}
          className="mx-auto mb-8 h-12 w-auto"
        />
        <div className="rounded-3xl border border-[#ECE8F5] bg-white p-8 shadow-sm">
          <PageTitle size="md">Choose a new password</PageTitle>
          <p className="text-gray-600 text-sm mb-6">Use at least 10 characters. You will sign in with it right after.</p>
          <ResetForm token={token ?? ''} />
        </div>
      </div>
    </div>
  );
}
