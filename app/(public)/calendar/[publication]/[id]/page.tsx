// app/(public)/calendar/[publication]/[id]/page.tsx
//
// Server-rendered event detail. The event is loaded on the server so the
// first HTML response contains the full event (visible content plus
// schema.org Event JSON-LD) for search engines and AI crawlers that do not
// run client JavaScript. Dallas stays preview-gated, so it falls back to the
// client fetch (which enforces the preview check) and emits no public data.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import JsonLd from '@/components/seo/JsonLd';
import { getEventById } from '@/lib/events-store';
import { isPublicationId } from '@/lib/publications';
import {
  SITE_URL,
  breadcrumbs,
  eventDescription,
  eventJsonLd,
  eventPath,
} from '@/lib/structured-data';
import CalendarDetailClient from './CalendarDetailClient';

export const runtime = 'nodejs';
export const revalidate = 600;

type PageProps = { params: Promise<{ publication: string; id: string }> };

const PUBLIC_PUBS = new Set(['austin', 'san_antonio']);

// Returns the event, null when it does not exist, or 'error' when the lookup
// itself failed (so a transient DB error never turns into a cached 404).
async function loadEvent(publication: string, idParam: string) {
  const id = Number(idParam);
  if (!isPublicationId(publication) || !PUBLIC_PUBS.has(publication)) return null;
  if (!Number.isInteger(id) || id <= 0) return null;
  try {
    return await getEventById(publication, id);
  } catch (err) {
    console.error('[calendar event] load failed', err);
    return 'error' as const;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { publication, id } = await params;
  const loaded = await loadEvent(publication, id);
  const event = loaded === 'error' ? null : loaded;
  if (!event) return { title: 'Event — Realty News Now' };
  const market = publication === 'san_antonio' ? 'San Antonio' : 'Austin';
  const description = eventDescription(event);
  const path = eventPath(publication, event.id);
  return {
    title: `${event.title} — ${market} Real Estate Event`,
    description,
    alternates: { canonical: `${SITE_URL}${path}` },
    openGraph: {
      type: 'website',
      title: event.title,
      description,
      url: `${SITE_URL}${path}`,
      ...(event.imageUrl ? { images: [{ url: event.imageUrl }] } : {}),
    },
  };
}

export default async function CalendarDetailPage({ params }: PageProps) {
  const { publication, id } = await params;
  const loaded = await loadEvent(publication, id);
  const event = loaded === 'error' ? null : loaded;

  // Public markets: a missing/hidden event is a real 404 (not a client-side
  // "not found" screen on a 200), so crawlers drop dead URLs.
  if (!event && loaded !== 'error' && PUBLIC_PUBS.has(publication) && isPublicationId(publication)) {
    const n = Number(id);
    if (Number.isInteger(n) && n > 0) notFound();
  }

  return (
    <>
      {event && (
        <JsonLd
          data={[
            eventJsonLd(event),
            breadcrumbs([
              { name: 'Home', path: '/' },
              { name: 'Calendar', path: '/calendar' },
              { name: event.title, path: eventPath(publication, event.id) },
            ]),
          ]}
        />
      )}
      <CalendarDetailClient initialEvent={event} />
    </>
  );
}
