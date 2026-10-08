import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/server/auth/user';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import ComingSoon from '../agents/ComingSoon';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { absolute: "It's Almost Closing Time! | Deal Workspace For Texas Agents" },
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

// Home page of itsalmostclosingtime.com. Visitors see the public page; signed-in accounts go to the workspace.
export default async function ClosingTimeHome() {
  const [user, admin] = await Promise.all([getCurrentUser(), getCurrentAdmin()]);
  if (user || admin) redirect('/agents/closing-time');
  return <ComingSoon />;
}
