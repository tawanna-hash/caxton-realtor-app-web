import JsonLd from '@/components/seo/JsonLd';
import { webPage } from '@/lib/structured-data';
import MediaKit from '@/components/ads/MediaKit';
import TrackPageView from '@/components/analytics/TrackPageView';

export const metadata = {
  title: 'Advertising Media Kit — Realty News Now',
  description:
    'Current print, digital, email, and mobile advertising rates for RealtyLine Austin, Newsline San Antonio, and the Realty News Now network.',
  alternates: { canonical: '/advertise' },
};

export default function AdvertisePage() {
  return (
    <>
      <JsonLd
        data={webPage({
          path: '/advertise',
          name: 'Advertising Media Kit — Realty News Now',
          description:
            'Audience reach, print, digital, email, and mobile advertising options for RealtyLine Austin and Newsline San Antonio.',
          type: 'CollectionPage',
        })}
      />
      <TrackPageView event="advertise_page_viewed" />
      <div className="min-h-screen bg-gray-50">
        <MediaKit mode="public" />
      </div>
    </>
  );
}
