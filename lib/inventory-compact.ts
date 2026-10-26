// lib/inventory-compact.ts
//
// Slim wire format for the public inventory browser. The list view only uses a
// handful of the ~50 BuilderInventoryRow fields, and most of those are null for
// any given row. compactRow() drops unused fields, nulls and empty values (and
// flyerPdfUrl when it just repeats sourceUrl); expandRow() restores a full
// BuilderInventoryRow shape on the client so filters and cards are unchanged.

import type { BuilderInventoryRow } from '@/lib/builder-inventory';

export type CompactRow = Partial<
  Pick<
    BuilderInventoryRow,
    | 'kind'
    | 'status'
    | 'publication'
    | 'builderName'
    | 'title'
    | 'city'
    | 'state'
    | 'bedsMin'
    | 'bedsMax'
    | 'bathsMin'
    | 'bathsMax'
    | 'sqftMin'
    | 'sqftMax'
    | 'priceMin'
    | 'priceMax'
    | 'promoType'
    | 'startsAt'
    | 'expiresAt'
    | 'sourceUrl'
    | 'flyerPdfUrl'
    | 'thumbnailUrl'
    | 'readyDate'
    | 'planName'
    | 'communityName'
    | 'homeType'
    | 'developerName'
  >
> & {
  id: number;
  /** createdAt as an ISO string. */
  createdAt: string;
  featured?: true;
  /** Set when flyerPdfUrl equals sourceUrl. */
  flyerIsSource?: true;
};

const KEEP = [
  'kind', 'status', 'publication', 'builderName', 'title', 'city', 'state',
  'bedsMin', 'bedsMax', 'bathsMin', 'bathsMax', 'sqftMin', 'sqftMax',
  'priceMin', 'priceMax', 'promoType', 'startsAt', 'expiresAt', 'sourceUrl',
  'flyerPdfUrl', 'thumbnailUrl', 'readyDate', 'planName', 'communityName',
  'homeType', 'developerName',
] as const;

export function compactRow(r: BuilderInventoryRow): CompactRow {
  const out: Record<string, unknown> = {
    id: r.id,
    createdAt: new Date(r.createdAt as unknown as string).toISOString(),
  };
  if (r.featured) out.featured = true;
  for (const k of KEEP) {
    const v = r[k];
    if (v === null || v === undefined || v === '') continue;
    out[k] = v;
  }
  if (r.flyerPdfUrl && r.flyerPdfUrl === r.sourceUrl) {
    delete out.flyerPdfUrl;
    out.flyerIsSource = true;
  }
  return out as unknown as CompactRow;
}

export function expandRow(c: CompactRow): BuilderInventoryRow {
  const g = <K extends (typeof KEEP)[number]>(k: K) =>
    (c[k] ?? null) as BuilderInventoryRow[K];
  return {
    id: c.id,
    createdAt: c.createdAt,
    reviewedAt: null,
    kind: c.kind as BuilderInventoryRow['kind'],
    status: c.status as BuilderInventoryRow['status'],
    featured: !!c.featured,
    publication: c.publication as BuilderInventoryRow['publication'],
    submittedByName: '',
    submittedByEmail: '',
    submittedByPhone: null,
    builderName: c.builderName ?? '',
    title: c.title ?? '',
    city: c.city ?? '',
    state: c.state ?? '',
    description: null,
    bedsMin: g('bedsMin'),
    bedsMax: g('bedsMax'),
    bathsMin: g('bathsMin'),
    bathsMax: g('bathsMax'),
    sqftMin: g('sqftMin'),
    sqftMax: g('sqftMax'),
    priceMin: g('priceMin'),
    priceMax: g('priceMax'),
    promoType: g('promoType'),
    startsAt: g('startsAt'),
    expiresAt: g('expiresAt'),
    sourceUrl: g('sourceUrl'),
    tags: null,
    flyerPdfUrl: c.flyerIsSource ? (c.sourceUrl ?? null) : g('flyerPdfUrl'),
    thumbnailUrl: g('thumbnailUrl'),
    sourceIp: null,
    userAgent: null,
    reviewedBy: null,
    externalId: null,
    address: null,
    readyDate: g('readyDate'),
    planName: g('planName'),
    communityName: g('communityName'),
    homeType: g('homeType'),
    galleryUrls: null,
    communityData: null,
    extraDetails: null,
    developerName: g('developerName'),
  };
}
