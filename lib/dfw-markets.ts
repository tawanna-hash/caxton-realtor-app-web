// Dallas/Ft. Worth market-report areas, split by board.
//
// Dallas  = MetroTex Association of REALTORS® (all 20 counties it reports on
//           plus the DFW Metroplex summary). Denton is Dallas-only.
// Ft. Worth = Greater Fort Worth Association of REALTORS® (GFWAR): Greater
//           Fort Worth area, its county reports (Tarrant, Parker, Johnson)
//           and the Zip Detail report.

export type DfwBoard = 'metrotex' | 'gfwar';
export type DfwAreaType = 'region' | 'county' | 'zip';

export const DFW_BOARDS: Record<DfwBoard, { label: string; area: string; source: string }> = {
  metrotex: { label: 'MetroTex Association of REALTORS®', area: 'Dallas', source: 'https://www.mymetrotex.com/market-reports/' },
  gfwar: { label: 'Greater Fort Worth Association of REALTORS®', area: 'Ft. Worth', source: 'https://gfwar.org/housing-report/' },
};

export const METROTEX_COUNTIES = [
  'Collin', 'Dallas', 'Denton', 'Ellis', 'Erath', 'Grayson', 'Hood', 'Hopkins', 'Hunt', 'Johnson',
  'Kaufman', 'McLennan', 'Navarro', 'Parker', 'Rockwall', 'Somervell', 'Stephens', 'Tarrant', 'Van Zandt', 'Wise',
] as const;

/** GFWAR county reports. Denton is intentionally excluded (Dallas-only). */
export const GFWAR_COUNTIES = ['Tarrant', 'Parker', 'Johnson'] as const;

/** Headline numbers shared by both boards' reports. All values are display strings. */
export interface DfwMetrics {
  medianPrice?: string | null;
  medianPriceYoY?: string | null;
  averagePrice?: string | null;
  averagePriceYoY?: string | null;
  closedSales?: string | null;
  closedSalesYoY?: string | null;
  activeListings?: string | null;
  activeListingsYoY?: string | null;
  newListings?: string | null;
  pendingSales?: string | null;
  daysOnMarket?: string | null;
  daysToClose?: string | null;
  daysTotal?: string | null;
  daysNote?: string | null;
  monthsInventory?: string | null;
  monthsInventoryPrior?: string | null;
  pricePerSqft?: string | null;
  pricePerSqftYoY?: string | null;
  dollarVolume?: string | null;
  dollarVolumeYoY?: string | null;
  closeToListPrice?: string | null;
  marketSharePct?: string | null;
  marketShareBand?: string | null;
}

export interface DfwMarketReport {
  board: DfwBoard;
  areaType: DfwAreaType;
  areaKey: string;   // 'dfw-metroplex' | 'greater-fort-worth' | 'dallas-county' | '76107'
  areaLabel: string; // 'DFW Metroplex' | 'Dallas County' | 'Zip 76107'
  month: string;     // 'YYYY-MM'
  metrics: DfwMetrics;
  sourceUrl: string | null;
  /** Board-published graphic (MetroTex infographics), English / Spanish. */
  imageUrl?: string | null;
  imageUrlEs?: string | null;
  updatedAt?: string;
}

export function countyKey(name: string): string {
  return `${name.toLowerCase().replace(/\s+/g, '-')}-county`;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** "August 2026" -> "2026-08" */
export function monthKeyFromLabel(label: string): string | null {
  const m = /([A-Za-z]+)\.?\s+(\d{4})/.exec(label);
  if (!m) return null;
  const i = MONTHS.findIndex((x) => x.startsWith(m[1].toLowerCase().slice(0, 3)));
  return i < 0 ? null : `${m[2]}-${String(i + 1).padStart(2, '0')}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const name = MONTHS[m - 1] ?? '';
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
}
