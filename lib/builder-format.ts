// lib/builder-format.ts
//
// Small formatting helpers for the new iOS-style Builders / Communities /
// Inventory pages. Parallels caxton-realtor-ios/src/lib/format.ts so both
// platforms render identical price + bed/bath/sqft + date strings.

const priceFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const numFmt = new Intl.NumberFormat('en-US');

export function formatPriceRange(
  min: number | null | undefined,
  max: number | null | undefined,
): string {
  if (min == null && max == null) return '';
  if (min != null && max != null) {
    if (min === max) return priceFmt.format(min);
    return `${priceFmt.format(min)}–${priceFmt.format(max)}`;
  }
  if (min != null) return `From ${priceFmt.format(min)}`;
  if (max != null) return `Up to ${priceFmt.format(max)}`;
  return '';
}

export function formatBedBathSqft(item: {
  bedsMin: number | null;
  bedsMax: number | null;
  bathsMin: number | null;
  bathsMax: number | null;
  sqftMin: number | null;
  sqftMax: number | null;
}): string {
  const parts: string[] = [];
  const beds = formatNumberRange(item.bedsMin, item.bedsMax);
  if (beds) parts.push(`${beds} bd`);
  const baths = formatNumberRange(item.bathsMin, item.bathsMax);
  if (baths) parts.push(`${baths} ba`);
  const sqft = formatNumberRange(item.sqftMin, item.sqftMax);
  if (sqft) parts.push(`${sqft} sqft`);
  return parts.join(' · ');
}

function formatNumberRange(
  min: number | null | undefined,
  max: number | null | undefined,
): string {
  if (min == null && max == null) return '';
  if (min != null && max != null) {
    if (min === max) return numFmt.format(min);
    return `${numFmt.format(min)}–${numFmt.format(max)}`;
  }
  if (min != null) return numFmt.format(min);
  if (max != null) return numFmt.format(max);
  return '';
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
