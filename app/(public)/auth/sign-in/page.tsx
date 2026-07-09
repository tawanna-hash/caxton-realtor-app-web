// Alias: landing page CTA links here. Redirect to the real /login.

import { redirect } from 'next/navigation';

interface PageProps {
  searchParams?: Promise<{ next?: string }>;
}

export default async function SignInAlias({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const next =
    typeof params.next === 'string' && params.next.startsWith('/') && !params.next.startsWith('//')
      ? params.next
      : '';
  redirect(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
}
