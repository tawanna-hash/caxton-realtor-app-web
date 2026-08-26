import type { Metadata } from 'next';
import ResourcesClient from '../ResourcesClient';

export const metadata: Metadata = {
  title: 'Curated Links — Realty News Now',
  description: 'Trusted official sources and industry references for real estate professionals and consumers.',
};

export default function CuratedLinksPage() {
  return <ResourcesClient view="links" />;
}
