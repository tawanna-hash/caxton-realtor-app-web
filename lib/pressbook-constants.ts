// lib/pressbook-constants.ts
// Verbatim Pressbook CRM constants ported to TypeScript.
export const AD_RATE_TABLE: Record<string, Record<string, number>> = {
  '1x':  { 'Full-page': 1740, '1/2 page': 1390, '1/4 page': 1065 },
  '3x':  { 'Full-page': 1460, '1/2 page': 1105,  '1/4 page': 780 },
  '6x':  { 'Full-page': 1380, '1/2 page': 1020,  '1/4 page': 695 },
  '12x': { 'Full-page': 1270, '1/2 page': 915,  '1/4 page': 585 },
};

export const MONTHS_LIST: { k: string; l: string }[] = [
  { k: 'january',   l: 'January'   },
  { k: 'february',  l: 'February'  },
  { k: 'march',     l: 'March'     },
  { k: 'april',     l: 'April'     },
  { k: 'may',       l: 'May'       },
  { k: 'june',      l: 'June'      },
  { k: 'july',      l: 'July'      },
  { k: 'august',    l: 'August'    },
  { k: 'september', l: 'September' },
  { k: 'october',   l: 'October'   },
  { k: 'november',  l: 'November'  },
  { k: 'december',  l: 'December'  },
];

export const MONTH_ORDER: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4,
  may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
};

export const FREQ_PKG_AG: Record<string, string> = {
  '1x':  'Brand [1]',
  '3x':  'Brand [3]',
  '6x':  'Brand [6]',
  '12x': 'Brand [12]',
};

export const FREQ_MONTHS: Record<string, number> = {
  '1x': 1, '3x': 3, '6x': 6, '12x': 12,
};
export const AD_SIZES     = ['1/4 page', '1/2 page', 'Full-page'] as const;
export const FREQUENCIES  = ['1x', '3x', '6x', '12x'] as const;
export const PAYMENT_TYPES = ['Check', 'ACH', 'Credit Card'] as const;
/** Radio labels: fee shown next to the method. */
export const PAYMENT_TYPE_LABELS: Record<(typeof PAYMENT_TYPES)[number], string> = {
  'Check': 'Check',
  'ACH': 'ACH (1% up to $5)',
  'Credit Card': 'Credit Card (3%)',
};
export const CARD_TYPES    = ['Visa', 'Mastercard', 'American Express', 'Other'] as const;
export const BILL_TO       = ['Advertiser', 'Agency'] as const;

/**
 * Ad Timing Term auto-fill. Given the first month and 4-digit year, returns
 * the checked months and years for a run of `count` consecutive months
 * (3x, 6x or 12x), rolling the year forward after December.
 */
export function buildTimingRun(
  startKey: string,
  startYear: number,
  count: number,
): { months: Record<string, boolean>; years: Record<string, string> } {
  const months: Record<string, boolean> = Object.fromEntries(MONTHS_LIST.map((m) => [m.k, false]));
  const years: Record<string, string> = Object.fromEntries(MONTHS_LIST.map((m) => [m.k, '']));
  const start = MONTHS_LIST.findIndex((m) => m.k === startKey);
  if (start < 0) return { months, years };
  for (let i = 0; i < Math.min(count, 12); i++) {
    const idx = (start + i) % 12;
    months[MONTHS_LIST[idx].k] = true;
    years[MONTHS_LIST[idx].k] = String(startYear + Math.floor((start + i) / 12));
  }
  return { months, years };
}

/**
 * If the checked timing months form one consecutive run (every checked month
 * has a 4-digit year), returns the first month and year of that run so the
 * run can be re-generated when the frequency changes. Otherwise null.
 */
export function timingRunStart(
  months: Record<string, boolean>,
  years: Record<string, string>,
): { key: string; year: number } | null {
  const picked = MONTHS_LIST.map((m, i) => ({ k: m.k, i, y: Number(years[m.k]) }))
    .filter((m) => months[m.k]);
  if (picked.length === 0 || picked.some((m) => !/^\d{4}$/.test(String(m.y)))) return null;
  const sorted = [...picked].sort((a, b) => a.y * 12 + a.i - (b.y * 12 + b.i));
  for (let n = 1; n < sorted.length; n++) {
    if (sorted[n].y * 12 + sorted[n].i !== sorted[n - 1].y * 12 + sorted[n - 1].i + 1) return null;
  }
  return { key: sorted[0].k, year: sorted[0].y };
}
