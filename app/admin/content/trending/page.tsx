// Admin surface for the rotating Trending ticker on RealtyLine / Newsline feeds.
// Fully client-side. Data fetched via /api/admin/trending (requireAdmin gated).
// Modal-based editor — no separate detail route.

'use client';

import { Suspense } from 'react';
import PageTitle from '@/components/ui/PageTitle';
import TrendingAdminClient from './_components/TrendingAdminClient';

export const dynamic = 'force-dynamic';

export default function AdminTrendingPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <PageTitle size="md">Trending</PageTitle>
        <p className="text-sm text-gray-700 mt-1">
          Rotating CTA strip that sits above the first post on RealtyLine and Newsline feeds.
          Items rotate every 5 seconds, respect prefers-reduced-motion, and can be dismissed per user per day.
        </p>
      </div>
      <Suspense fallback={<div className="text-sm text-gray-600">Loading trending items…</div>}>
        <TrendingAdminClient />
      </Suspense>
    </div>
  );
}
