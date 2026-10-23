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
