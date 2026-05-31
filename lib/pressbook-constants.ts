// lib/pressbook-constants.ts
// Verbatim Pressbook CRM constants ported to TypeScript.

export type AdSize = '1/4 page' | '1/2 page' | 'Full-page';
export type Frequency = '1x' | '3x' | '6x' | '12x';

export const AD_RATE_TABLE: Record<string, Record<string, number>> = {
  '1x':  { 'Full-page': 1440, '1/2 page': 1150, '1/4 page': 880 },
  '3x':  { 'Full-page': 1205, '1/2 page': 915,  '1/4 page': 645 },
  '6x':  { 'Full-page': 1140, '1/2 page': 845,  '1/4 page': 575 },
  '12x': { 'Full-page': 1050, '1/2 page': 755,  '1/4 page': 485 },
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
  '1x':  'Brand[1]',
  '3x':  'Brand[3]',
  '6x':  'Brand[6]',
  '12x': 'Brand[12]',
};

export const FREQ_MONTHS: Record<string, number> = {
  '1x': 1, '3x': 3, '6x': 6, '12x': 12,
};

export const AG_STATUSES = ['Draft', 'Sent', 'Signed', 'Active', 'Cancelled', 'Expired'] as const;
export const AD_SIZES     = ['1/4 page', '1/2 page', 'Full-page'] as const;
export const FREQUENCIES  = ['1x', '3x', '6x', '12x'] as const;
export const PAYMENT_TYPES = ['Check', 'Credit Card'] as const;
export const CARD_TYPES    = ['Visa', 'Mastercard', 'American Express', 'Other'] as const;
export const BILL_TO       = ['Advertiser', 'Agency'] as const;
