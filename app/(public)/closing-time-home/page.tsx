import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isClosingTimeGated } from '@/lib/server/closing-time-gate';
import ComingSoon from '../agents/ComingSoon';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "It's Almost Closing Time! | Deal Workspace For Texas Agents",
  description: 'Closing Time tracks contract deadlines, forms, signatures and closing coordination for Texas real estate agents.',
  metadataBase: new URL('https://itsalmostclosingtime.com'),
  alternates: { canonical: 'https://itsalmostclosingtime.com/' },
  openGraph: {
    title: "It's Almost Closing Time! | Deal Workspace For Texas Agents",
    description: 'Contract deadlines, forms, signatures and closing coordination for Texas real estate agents.',
    url: 'https://itsalmostclosingtime.com/',
    siteName: "It's Almost Closing Time!",
    type: 'website',
  },
};

// Home page of itsalmostclosingtime.com. Visitors see the public page; the enabled owner account goes to the workspace.
export default async function ClosingTimeHome() {
  if (!(await isClosingTimeGated())) redirect('/agents/closing-time');
  return <ComingSoon />;
}
