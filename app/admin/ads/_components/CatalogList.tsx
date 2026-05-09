// caxton-ads-v1
// Catalog tab — 15 ad slots grouped by zone, with active-campaign
// counts overlaid. Read-only reference data.

'use client';

import type { AdSpace, AdCampaign } from './types';
import { ZONE_LABELS, TIER_COLORS, formatSizes, isCampaignActive } from './types';

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
          <strong>15 ad slots</strong> across 7 zones. Counts show campaigns currently
          live (active + within date range). Slot definitions are read-only —
          contact engineering to add new slots.
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
                      <span className={`text-xs font-medium uppercase tracking-wide px-2 py-0.5 rounded ${TIER_COLORS[s.tier]}`}>
                        {s.tier}
                      </span>
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
