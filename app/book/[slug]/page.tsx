import type { Metadata } from 'next';
import BookingView from '../BookingView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Book A Time', robots: { index: false, follow: false } };

export default async function BookRoot({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <BookingView slug={slug} alias="" />;
}
