// app/admin/inventory/scraper-guide/page.tsx
//
// "Move-in Ready Homes Guide" admin page. A visual reference for building a new
// builder/developer move-in scraper. Uses the M/I Homes listing 199 as the
// gold-standard field example, with a faithful mockup of the public
// /inventory/[id] page annotated with the scraper field each element comes from.
//
// Full written spec: docs/scraper-template.md

import Link from 'next/link';
import PageTitle from '@/components/ui/PageTitle';
import MoveInReadyGuideContent from '@/components/admin/guides/MoveInReadyGuideContent';

export default function AdminScraperGuidePage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="mb-8 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-1">
            Admin
          </p>
          <PageTitle size="md">Move-in Ready Homes Guide</PageTitle>
          <MoveInReadyGuideContent />
        </div>
        <Link
          href="/admin/content/scrapers"
          className="shrink-0 border border-brand-700 text-brand-700 px-4 py-2 text-sm font-medium hover:bg-brand-50 rounded-md transition-colors whitespace-nowrap self-start"
        >
          ← Scraper Hub
        </Link>
      </div>
    </div>
  );
}
