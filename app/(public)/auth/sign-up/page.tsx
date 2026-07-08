// app/(public)/auth/sign-up/page.tsx
//
// Public alias route. app/page.tsx (landing) links here; the actual
// signup UI lives inside the dashboard's AuthGate — driven by
// ?auth=signup. Handing off keeps a single signup form.
//
// Auth flow reorder: sign up FIRST, market pick SECOND.

import { redirect } from 'next/navigation';

interface PageProps {
  searchParams?: Promise<{ next?: string }>;
}

export default async function SignUpAlias({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const next = typeof params.next === 'string' && params.next.startsWith('/') && !params.next.startsWith('//')
    ? params.next
    : '';
  const dest = `/dashboard?auth=signup${next ? `&next=${encodeURIComponent(next)}` : ''}`;
  redirect(dest);
}
