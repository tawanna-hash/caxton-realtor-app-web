import type { Metadata } from 'next';
import BookingView from '../../BookingView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Book A Time', robots: { index: false, follow: false } };

export default async function BookAlias({ params }: { params: Promise<{ slug: string; alias: string }> }) {
  const { slug, alias } = await params;
  return <BookingView slug={slug} alias={alias} />;
}
