import type { Metadata } from 'next';
import ClosingSigner from './ClosingSigner';

export const metadata: Metadata = {
  title: 'Review and Sign Contract | Realty News Now',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default async function ClosingSignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ClosingSigner token={token} />;
}
