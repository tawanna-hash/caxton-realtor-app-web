import type { Metadata } from 'next';
import ClosingClient from '../../ClosingClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Closing Time', robots: { index: false, follow: false } };

export default async function ClosingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ClosingClient token={token} />;
}
