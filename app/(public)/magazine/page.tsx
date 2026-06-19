import MagazineClient from './MagazineClient';
import { MagazineGA } from '@/components/MagazineGA';
import { getMeasurementId } from '@/lib/publication-settings';

export const metadata = { title: 'Issues — Realty News Now' };
export const dynamic = 'force-dynamic';

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
