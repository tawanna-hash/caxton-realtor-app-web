// Public event images gallery page.
// Server component — fetches photos grouped by month, renders the gallery.
// Client child handles month filtering + lightbox.

import { listEventPhotosGrouped } from '@/lib/event-photos';
import EventGallery from './EventGallery';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Event Images — Realty News Now',
  description: 'Photographs from real estate industry events, builder openings, and community celebrations.',
};

export default async function EventImagesPage() {
  // Event images are cross-publication content — show all
  const months = await listEventPhotosGrouped({});

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
        <header className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Event Images</h1>
          <p className="text-base text-gray-700 font-light leading-relaxed mt-3 max-w-2xl">
            Photographs from real estate industry events, builder openings, and community celebrations.
          </p>
        </header>

        {months.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500">No event images yet. Check back soon.</p>
          </div>
        ) : (
          <EventGallery months={months} />
        )}
      </div>
    </main>
  );
}
