// app/(public)/auth/sign-in/page.tsx
//
// Public alias route. app/page.tsx (landing) links here for logged-out
// visitors, but the actual sign-in UI lives inside the dashboard's
// AuthGate — driven by ?auth=login. This file just hands off so we
// don't maintain two sign-in forms.
//
// Auth flow reorder: sign in FIRST, market pick SECOND.

import { redirect } from 'next/navigation';

interface PageProps {
  searchParams?: Promise<{ next?: string }>;
}

export default async function SignInAlias({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const next = typeof params.next === 'string' && params.next.startsWith('/') && !params.next.startsWith('//')
    ? params.next
    : '';
  const dest = `/dashboard?auth=login${next ? `&next=${encodeURIComponent(next)}` : ''}`;
  redirect(dest);
}
