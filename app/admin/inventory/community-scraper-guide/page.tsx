// app/admin/inventory/community-scraper-guide/page.tsx
//
// "Community Scraper Build Guide" admin page — companion to the Move-In Homes
// guide. A visual reference for building a new builder/developer *community*
// scraper. Uses the real communities/6 row (Barksdale, M/I Homes, Leander TX)
// as the gold-standard field example.
//
// Full written spec: docs/community-scraper-template.md

import Link from 'next/link';
import PageTitle from '@/components/ui/PageTitle';
import CommunityGuideContent from '@/components/admin/guides/CommunityGuideContent';

export default function AdminCommunityScraperGuidePage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="mb-8 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-1">
            Admin
          </p>
          <PageTitle size="md">Community Scraper Build Guide</PageTitle>
          <CommunityGuideContent />
        </div>
        <div className="flex gap-2 shrink-0 self-start">
          <Link
            href="/admin/inventory/scraper-guide"
            className="border border-gray-300 text-gray-700 px-4 py-2 text-sm font-medium hover:bg-gray-50 rounded-md transition-colors whitespace-nowrap"
          >
            ← Move-In Guide
          </Link>
          <Link
            href="/admin/content/scrapers"
            className="border border-brand-700 text-brand-700 px-4 py-2 text-sm font-medium hover:bg-brand-50 rounded-md transition-colors whitespace-nowrap"
          >
            ← Scraper Hub
          </Link>
        </div>
      </div>
    </div>
  );
}
