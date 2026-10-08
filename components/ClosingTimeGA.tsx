'use client';

import { usePathname } from 'next/navigation';
import { MagazineGA } from '@/components/MagazineGA';

// Paths that carry private tokens or client details in the URL are never sent to Google Analytics.
const PRIVATE_PREFIXES = ['/sign/', '/deal-portal/', '/book/', '/auth/', '/admin'];

/** Google Analytics for the Closing Time domain. Renders nothing until NEXT_PUBLIC_CLOSING_TIME_GA_ID is set. */
export default function ClosingTimeGA() {
  const pathname = usePathname() || '';
  const id = process.env.NEXT_PUBLIC_CLOSING_TIME_GA_ID;
  if (!id || PRIVATE_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  return <MagazineGA measurementId={id} />;
}
