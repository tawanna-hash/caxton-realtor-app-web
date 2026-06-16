// caxton-social-v1
// Admin UI: curate Facebook posts that surface in the RealtyLine / Newsline San Antonio feeds.

import { Suspense } from 'react';
import SocialClient from './SocialClient';

export const dynamic = 'force-dynamic';

export default function SocialPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-700">Loading…</div>}>
      <SocialClient />
    </Suspense>
  );
}
