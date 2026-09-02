import MediaKit from '@/components/ads/MediaKit';
import TrackPageView from '@/components/analytics/TrackPageView';

export const metadata = {
  title: 'Advertising Media Kit — Realty News Now',
  description:
    'Current print, digital, email, and mobile advertising rates for RealtyLine Austin, Newsline San Antonio, and the Realty News Now network.',
};

export default function AdvertisePage() {
  return (
    <>
      <TrackPageView event="advertise_page_viewed" />
      <main className="min-h-screen bg-gray-50">
        <MediaKit mode="public" />
      </main>
    </>
  );
}
