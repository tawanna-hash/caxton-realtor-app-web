// app/(public)/resources/page.tsx
//
// Public REALTOR Resources page. Content is hardcoded in
// lib/realtor-resources.ts for now — no DB, no admin UI yet.

import type { Metadata } from 'next';
import ResourcesClient from './ResourcesClient';

export const metadata: Metadata = {
  title: 'REALTOR Resources — RealtyLine Austin',
  description:
    'Downloadable guides, recommended vendors, training videos, and curated links for Austin-area REALTORS®.',
};

export default function ResourcesPage() {
  return <ResourcesClient />;
}
