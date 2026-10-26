import MagazineClient from './MagazineClient';
import { MagazineGA } from '@/components/MagazineGA';
import { getMeasurementId } from '@/lib/publication-settings';
import JsonLd from '@/components/seo/JsonLd';
import { getSql } from '@/lib/db';
import type { Magazine } from '@/lib/magazines';
import { webPage } from '@/lib/structured-data';

export const metadata = {
  title: 'Issues — Realty News Now',
  description:
    'Read digital issues of RealtyLine (Austin) and Newsline San Antonio, the Texas real estate magazines from Caxton Publications, Inc.',
  alternates: { canonical: '/magazine' },
};
// Magazine issues are published a few times a week by admins; the index
// itself does no per-visitor personalization (GA tags are injected for
// both publications unconditionally; MagazineClient reads the active pub
// client-side and fetches via API routes). 15 min keeps new issues visible
// promptly without hitting the DB on every request.
export const revalidate = 900; // 15 minutes

export default async function MagazinePage() {
  // Inject both publications' GA4 tags on the magazine index since the
  // user can browse either publication from here. GA4 supports multiple
  // `config` calls on one page — events fire to all configured properties.
  const [austinId, sanAntonioId] = await Promise.all([
    getMeasurementId('austin'),
    getMeasurementId('san_antonio'),
  ]);
  // Server-render the default (Austin) issue list so the current-issue cover
  // is in the first HTML instead of waiting on hydration plus an API call.
  // Visitors who browse Newsline San Antonio fetch their list client-side.
  let initialMagazines: Magazine[] = [];
  try {
    const rows = await getSql()`
      SELECT id, publication, year, month, issue_label,
             cover_url, reader_url, page_urls, page_count, sort_date
      FROM magazines
      WHERE publication = 'austin' AND page_count > 0
      ORDER BY sort_date DESC
      LIMIT 200
    `;
    initialMagazines = JSON.parse(JSON.stringify(rows)) as Magazine[];
  } catch {
    initialMagazines = [];
  }
  return (
    <>
      <JsonLd
        data={webPage({
          path: '/magazine',
          name: 'Magazine Issues — RealtyLine Austin and Newsline San Antonio',
          description:
            'Digital issues of RealtyLine (Austin) and Newsline San Antonio.',
          type: 'CollectionPage',
        })}
      />
      <h1 className="sr-only">
        RealtyLine Austin and Newsline San Antonio: digital magazine issues
      </h1>
      <p className="sr-only">
        Read current and past issues of RealtyLine, the Austin and Central
        Texas real estate magazine founded in 1995, and Newsline San Antonio,
        the San Antonio and South Texas real estate magazine founded in 1982.
        Both are published by Caxton Publications, Inc.
      </p>
      {/* The cover images live on Vercel Blob; open the connection early. */}
      <link rel="preconnect" href="https://b2lqsyyhvbkewrwf.public.blob.vercel-storage.com" crossOrigin="" />
      <MagazineGA measurementId={austinId} />
      <MagazineGA measurementId={sanAntonioId} />
      <MagazineClient initialMagazines={initialMagazines} />
    </>
  );
}
