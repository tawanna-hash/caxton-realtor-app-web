import CalendarClient from './CalendarClient';
import JsonLd from '@/components/seo/JsonLd';
import { webPage } from '@/lib/structured-data';

export const metadata = {
  title: 'Calendar — Realty News Now',
  description:
    'Upcoming Austin and San Antonio real estate events, classes, networking, and community happenings from RealtyLine and Newsline San Antonio.',
  alternates: { canonical: '/calendar' },
};

export default function CalendarPage() {
  return (
    <>
      <JsonLd
        data={webPage({
          path: '/calendar',
          name: 'Texas Real Estate Event Calendar — Realty News Now',
          description:
            'Upcoming Austin and San Antonio real estate events, classes, networking, and community happenings.',
          type: 'CollectionPage',
        })}
      />
      <CalendarClient />
    </>
  );
}
