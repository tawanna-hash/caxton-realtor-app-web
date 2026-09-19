// app/(public)/resources/page.tsx
//
// Public REALTOR Resources page. Content is hardcoded in
// lib/realtor-resources.ts for now — no DB, no admin UI yet.

import type { Metadata } from 'next';
import ResourcesClient from './ResourcesClient';

export const metadata: Metadata = {
  title: 'REALTOR® Calculators & Quick References — Realty News Now',
  description:
    'Calculators and quick references built for REALTORS® and their client conversations.',
};

export default function ResourcesPage() {
  return <ResourcesClient view="tools" />;
}
