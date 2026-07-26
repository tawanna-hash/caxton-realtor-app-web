// lib/builder-summary.ts
//
// Aggregation of builder_inventory rows into a per-builder summary. Used by
// both the /api/builders endpoint and the new /builders hub page so they stay
// in lockstep. Pure function — no I/O.

import type { BuilderInventoryRow } from '@/lib/builder-inventory';
import { builderNameToSlug } from '@/lib/builder-slug';

export type BuilderSummary = {
  name: string;
  slug: string;
  isDeveloper: boolean;
  communitiesCount: number;
  inventoryCount: number;
  promotionsCount: number;
  totalCount: number;
  thumbnailUrl: string | null;
  cities: string[];
};

export function summarizeBuilders(rows: BuilderInventoryRow[]): BuilderSummary[] {
  const byBuilder = new Map<string, BuilderSummary>();
  for (const r of rows) {
    const key = r.builderName?.trim();
    if (!key || key.toLowerCase() === 'test') continue;
    let s = byBuilder.get(key);
    if (!s) {
      s = {
        name: key,
        slug: builderNameToSlug(key),
        isDeveloper: false,
        communitiesCount: 0,
        inventoryCount: 0,
        promotionsCount: 0,
        totalCount: 0,
        thumbnailUrl: null,
        cities: [],
      };
      byBuilder.set(key, s);
    }
    s.totalCount += 1;
    if (r.developerName) s.isDeveloper = true;
    if (r.kind === 'promotion') s.promotionsCount += 1;
    else if (r.homeType === 'community') s.communitiesCount += 1;
    else s.inventoryCount += 1;

    if (!s.thumbnailUrl && r.thumbnailUrl) s.thumbnailUrl = r.thumbnailUrl;
    if (r.city && !s.cities.includes(r.city)) s.cities.push(r.city);
  }

  return Array.from(byBuilder.values()).sort((a, b) => {
    if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount;
    return a.name.localeCompare(b.name);
  });
}
