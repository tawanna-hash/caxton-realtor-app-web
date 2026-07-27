// app/admin/inventory/promotion-scraper-guide/page.tsx
//
// "Promotion Scraper Build Guide" admin page — companion to the Move-In Homes
// guide and the Community Scraper guide. A visual reference for building a new
// builder/developer *promotion* scraper. Uses the real inventory/653 row
// (Drees Homes 2026 Realtor Rewards Program) as the gold-standard field example.
//
// Full written spec: docs/promotion-scraper-template.md

import Link from 'next/link';
import PageTitle from '@/components/ui/PageTitle';
import PromotionGuideContent from '@/components/admin/guides/PromotionGuideContent';

export default function AdminPromotionScraperGuidePage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="mb-8 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-1">
            Admin
          </p>
          <PageTitle size="md">Promotion Scraper Build Guide</PageTitle>
          <PromotionGuideContent />
        </div>
        <div className="flex gap-2 shrink-0 self-start">
          <Link
            href="/admin/inventory/community-scraper-guide"
            className="border border-gray-300 text-gray-700 px-4 py-2 text-sm font-medium hover:bg-gray-50 rounded-md transition-colors whitespace-nowrap"
          >
            ← Community Guide
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
