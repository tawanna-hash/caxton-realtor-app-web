import MagazineClient from './MagazineClient';
import { MagazineGA } from '@/components/MagazineGA';
import { getMeasurementId } from '@/lib/publication-settings';

export const metadata = { title: 'Issues — Realty News Now' };
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
  return (
    <>
      <MagazineGA measurementId={austinId} />
      <MagazineGA measurementId={sanAntonioId} />
      <MagazineClient />
    </>
  );
}
