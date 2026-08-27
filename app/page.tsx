/**
 * Marketing landing page at `/`.
 *
 * Previously this file redirect()'d to /dashboard, which is now gated by the
 * realtor auth guard in proxy.ts. Logged-out visitors landing on the root
 * domain need a real public surface that explains what Realty News Now is
 * and routes them into sign-up / sign-in. Logged-in visitors are bounced
 * straight to the dashboard so the marketing page never replaces the app
 * for an already-authenticated user.
 *
 * Kept intentionally minimal so it does not duplicate or fight the
 * existing dashboard/app-shell styling. Brand voice and copy come from
 * the existing app — no new product claims are made here.
 */

import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/server/auth/user';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams?: Promise<{ next?: string; notify?: string }>;
}

export default async function HomePage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  const params = (await searchParams) ?? {};
  const next = typeof params.next === 'string' ? params.next : undefined;
  // ?notify=<pub-id> is set by MarketSwitcherSheet when a logged-in user
  // taps a coming-soon market. Forward it onto /dashboard so the bottom
  // sheet still surfaces; without this the query gets dropped by the
  // bare redirect('/dashboard') below.
  const notify = typeof params.notify === 'string' ? params.notify : undefined;

  if (user) {
    // Already signed in — go to the app. Honor ?next= if present and same-origin.
    let dest = isSafeNext(next) ? (next as string) : '/dashboard';
    if (notify && !dest.includes('?')) {
      dest = `${dest}?notify=${encodeURIComponent(notify)}`;
    }
    redirect(dest);
  }

  // Preserve ?next= into the sign-in / sign-up CTAs so post-auth bounces back
  // to whatever protected page the user was trying to reach.
  const nextQuery = isSafeNext(next) ? `?next=${encodeURIComponent(next as string)}` : '';
  const signInHref = `/auth/sign-in${nextQuery}`;
  const signUpHref = `/auth/sign-up${nextQuery}`;

  return (
    <main className="min-h-screen bg-gradient-to-b from-white via-purple-50 to-white text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-12 text-center">
        <Image
          src="/icon-512.png"
          alt="Realty News Now"
          width={96}
          height={96}
          priority
          className="mb-6 rounded-2xl shadow-lg"
        />
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Realty News Now
        </h1>
        <p className="mt-4 max-w-md text-base text-slate-600 sm:text-lg">
          The real estate community hub for news, events, partners, and
          magazines across Texas. Sign in to access the full app.
        </p>

        <div className="mt-10 flex w-full max-w-xs flex-col gap-3">
          <Link
            href={signInHref}
            className="rounded-xl bg-purple-700 px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-purple-800 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
          >
            Sign in
          </Link>
          <Link
            href={signUpHref}
            className="rounded-xl border border-purple-700 bg-white px-6 py-3 text-base font-medium text-purple-700 transition hover:bg-purple-50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
          >
            Create an account
          </Link>
        </div>

        <footer className="mt-16 text-xs text-slate-500">
          <Link href="/privacy" className="hover:underline">
            Privacy
          </Link>
          <span className="mx-2">·</span>
          <Link href="/terms" className="hover:underline">
            Terms
          </Link>
          <span className="mx-2">·</span>
          <Link href="/support" className="hover:underline">
            Support
          </Link>
        </footer>
      </div>
    </main>
  );
}

/**
 * Allow only same-origin, leading-slash relative paths in ?next= to defend
 * against open-redirect abuse via the public landing page. Reject anything
 * that doesn't start with a single `/`, has a scheme, or starts with `//`.
 */
function isSafeNext(value: string | undefined): boolean {
  if (!value) return false;
  if (!value.startsWith('/')) return false;
  if (value.startsWith('//')) return false; // protocol-relative URL
  if (value.startsWith('/\\')) return false;
  return true;
}
