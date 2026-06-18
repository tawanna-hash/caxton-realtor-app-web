// app/portal/error/page.tsx
//
// Friendly error page for portal auth issues. Codes:
//   missing   — no token
//   invalid   — token not found
//   expired   — link expired / already consumed / revoked
//   auth      — no valid session
//   loggedout — user signed out
//   server    — internal error

import Link from 'next/link';

import PageTitle from '@/components/ui/PageTitle';
export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, { title: string; body: string }> = {
  missing:   { title: 'Link is incomplete',
               body:  'The portal link is missing a token. Please use the full URL from your email or ask your account manager for a new link.' },
  invalid:   { title: 'Link not recognized',
               body:  'We couldn\'t find that link. It may have been mistyped or already used.' },
  expired:   { title: 'Link is no longer valid',
               body:  'For security, each portal link can only be used once and expires after 24 hours. Please ask your account manager for a fresh link.' },
  auth:      { title: 'Sign in to continue',
               body:  'Your session has ended. Please use a fresh portal link from your email.' },
  loggedout: { title: 'Signed out',
               body:  'You\'ve been signed out. You can request a new portal link from your account manager.' },
  server:    { title: 'Something went wrong',
               body:  'We hit an error processing that link. Please try again or contact your account manager.' },
};

interface PageProps { searchParams: Promise<{ code?: string }> }

export default async function PortalErrorPage({ searchParams }: PageProps) {
  const { code } = await searchParams;
  const msg = MESSAGES[code ?? 'auth'] ?? MESSAGES.auth;

  return (
    <div className="max-w-lg mx-auto rounded-xl border border-gray-200 bg-white p-10 text-center">
      <div className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">RealtyLine portal</div>
      <PageTitle size="lg">
        {msg.title}
      </PageTitle>
      <p className="text-gray-600">{msg.body}</p>
      <div className="mt-6">
        <Link
          href="/portal"
          className="inline-block rounded-lg bg-gray-900 text-white px-5 py-2 text-sm font-medium hover:bg-gray-800"
        >
          Sign in again
        </Link>
      </div>
    </div>
  );
}
