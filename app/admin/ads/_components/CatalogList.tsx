// caxton-ads-v1
// Catalog tab — 16 ad slots grouped by zone, with active-campaign
// counts overlaid. Read-only reference data.

'use client';

import type { AdSpace, AdCampaign } from './types';
import { ZONE_LABELS, TIER_COLORS, formatSizes, isCampaignActive } from './types';

// Slugs that rotate through multiple active creatives in <AdSlot>. Keep in
// sync with ROTATING_SLUGS in components/ads/AdSlot.tsx and the `rotates`
// flags on entries in lib/media-kit.ts.
const ROTATING_SLUGS = new Set([
  'feed_top_banner',
  'feed_sticky_bottom',
  'newsletter_banner',
  'article_top_leaderboard',
  'calendar_top_banner',
]);

interface Props {
  spaces: AdSpace[];
  campaigns: AdCampaign[];
}

export function CatalogList({ spaces, campaigns }: Props) {
  // Group spaces by zone for visual organization
  const byZone = spaces.reduce<Record<string, AdSpace[]>>((acc, s) => {
    (acc[s.zone] ||= []).push(s);
    return acc;
  }, {});

  function activeCount(slug: string): number {
    return campaigns.filter((c) => c.ad_space_slug === slug && isCampaignActive(c)).length;
  }

  const zoneOrder: (keyof typeof ZONE_LABELS)[] = ['article', 'feed', 'calendar', 'newsletter', 'app', 'account', 'misc'];

  return (
    <div className="space-y-8">
      <div className="rounded-md bg-blue-50 p-4 text-sm text-blue-900 ring-1 ring-blue-200">
        <p>
          <strong>16 ad slots</strong> across 7 zones. Counts show campaigns currently
          live (active + within date range). Slot definitions are read-only —
          contact engineering to add new slots.
        </p>
        <p className="mt-2">
          Slots tagged <span className="inline-flex items-center gap-1 align-middle rounded-full bg-blue-100 text-blue-800 border border-blue-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">Rotates</span> auto-cycle through every active campaign on that slot — up to 5 at a time, 6s dwell, 2s cross-fade. Load up multiple creatives on the same slot and they will share the surface.
        </p>
      </div>
      {zoneOrder.map((zone) => {
        const items = byZone[zone];
        if (!items?.length) return null;
        return (
          <section key={zone}>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700 mb-3">
              {ZONE_LABELS[zone]}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((s) => {
                const active = activeCount(s.slug);
                return (
                  <div
                    key={s.slug}
                    className="rounded-md border border-gray-200 bg-white p-4 hover:border-gray-300"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <h4 className="font-medium text-gray-900">{s.display_name}</h4>
                        <p className="text-xs text-gray-500 font-mono mt-0.5">{s.slug}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {ROTATING_SLUGS.has(s.slug) && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                            title="Rotates with up to 5 active campaigns. 6s dwell, 2s cross-fade."
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M21 12a9 9 0 1 1-3-6.7" />
                              <polyline points="21 3 21 9 15 9" />
                            </svg>
                            Rotates
                          </span>
                        )}
                        <span className={`text-xs font-medium uppercase tracking-wide px-2 py-0.5 rounded-md ${TIER_COLORS[s.tier]}`}>
                          {s.tier}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-700 mb-2">{formatSizes(s.sizes_json)}</p>
                    {s.notes && (
                      <p className="text-xs text-gray-600 italic mb-2">{s.notes}</p>
                    )}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                      <span className="text-xs text-gray-600">
                        {active === 0 ? (
                          <span className="text-gray-500">No active campaigns</span>
                        ) : (
                          <span className="font-medium text-green-700">
                            {active} active campaign{active === 1 ? '' : 's'}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
