// lib/realtor-calc-math.ts
//
// Pure math helpers for the commission calculator and seller net sheet.
// Kept separate from mortgage-math so each file stays focused.
//
// Conventions:
// - Money values are USD numbers (not cents).
// - Rates are entered as percentages (e.g. 6 → 6%).
// - All functions are pure; no DOM, no I/O.

// ─────────────────────────────────────────────────────────────────────────────
// Commission Calculator
// ─────────────────────────────────────────────────────────────────────────────

export interface CommissionInput {
  salePrice: number;
  /** Total commission rate (e.g. 6 means 6%). */
  totalRatePct: number;
  /** Listing side's share of total commission (e.g. 50 means 50/50 split). */
  listingSharePct: number;
  /** Agent's split with their broker (e.g. 70 means agent keeps 70%). */
  agentSplitPct: number;
  /** Flat broker fee deducted from agent's portion (transaction fee, E&O, etc.). */
  brokerFlatFee?: number;
  /** Referral fee as % of the agent's gross side commission. Default 0. */
  referralPct?: number;
  /** Whether the calculation is for the listing side or buyer side. */
  side: 'listing' | 'buyer';
}

export interface CommissionBreakdown {
  totalCommission: number; // gross of both sides
  sideCommission: number; // gross to the agent's side
  afterReferral: number; // side commission minus referral fee
  referralAmount: number;
  agentGross: number; // agent's split before broker flat fee
  brokerFlatFee: number;
  agentNet: number; // take-home before taxes
  brokerSplit: number; // amount kept by the broker (broker side of split + flat fee)
}

export function computeCommission(input: CommissionInput): CommissionBreakdown {
  const {
    salePrice,
    totalRatePct,
    listingSharePct,
    agentSplitPct,
    brokerFlatFee = 0,
    referralPct = 0,
    side,
  } = input;

  const totalCommission = (salePrice * totalRatePct) / 100;
  const sideSharePct = side === 'listing' ? listingSharePct : 100 - listingSharePct;
  const sideCommission = (totalCommission * sideSharePct) / 100;
  const referralAmount = (sideCommission * referralPct) / 100;
  const afterReferral = sideCommission - referralAmount;
  const agentGross = (afterReferral * agentSplitPct) / 100;
  const agentNet = Math.max(0, agentGross - brokerFlatFee);
  const brokerSplit = afterReferral - agentGross + brokerFlatFee;

  return {
    totalCommission,
    sideCommission,
    afterReferral,
    referralAmount,
    agentGross,
    brokerFlatFee,
    agentNet,
    brokerSplit,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Seller Net Sheet
//
// A standard listing-side net sheet for Texas. Line items follow the
// conventions used on most TREC closing disclosures:
//   - Commission (listing + buyer sides — paid by seller in most contracts)
//   - Title policy (owner's title insurance — TX rate sliding scale)
//   - Closing/escrow fee (flat per side)
//   - Recording & doc prep
//   - Survey, HOA transfer, home warranty (optional)
//   - Property tax proration (seller owes for portion of year owned)
//   - Mortgage payoff
//   - Seller concessions to buyer
// ─────────────────────────────────────────────────────────────────────────────

export interface NetSheetInput {
  salePrice: number;
  mortgagePayoff: number;
  /** Total commission rate paid by seller (typically covers both sides). */
  commissionRatePct: number;

  /** Annual property tax in dollars (used for proration). */
  annualPropertyTax: number;
  /** Day-of-year for closing (1-365). Used to prorate tax owed by seller. */
  closingDayOfYear: number;

  // Texas-style closing line items (all in dollars unless noted)
  titlePolicy: number; // owner's title policy (seller-paid in TX standard)
  escrowFee: number; // closing/escrow fee
  recordingFees: number;
  docPrep: number;
  survey: number;
  hoaTransferFee: number;
  homeWarranty: number;

  /** Seller concessions to buyer (closing-cost credits). */
  sellerConcessions: number;
  /** Misc/other costs the agent wants to add. */
  misc: number;
}

export interface NetSheetBreakdown {
  salePrice: number;
  commission: number;
  titlePolicy: number;
  escrowFee: number;
  recordingFees: number;
  docPrep: number;
  survey: number;
  hoaTransferFee: number;
  homeWarranty: number;
  taxProration: number;
  sellerConcessions: number;
  misc: number;
  totalClosingCosts: number; // everything except payoff
  mortgagePayoff: number;
  netToSeller: number;
}

export function computeNetSheet(input: NetSheetInput): NetSheetBreakdown {
  const commission = (input.salePrice * input.commissionRatePct) / 100;

  // Property tax proration: seller is responsible for tax accrued from
  // Jan 1 through the closing date (TX standard — buyer takes the rest).
  const daysInYear = 365;
  const proratedDays = Math.max(0, Math.min(daysInYear, input.closingDayOfYear));
  const taxProration = (input.annualPropertyTax * proratedDays) / daysInYear;

  const totalClosingCosts =
    commission +
    input.titlePolicy +
    input.escrowFee +
    input.recordingFees +
    input.docPrep +
    input.survey +
    input.hoaTransferFee +
    input.homeWarranty +
    taxProration +
    input.sellerConcessions +
    input.misc;

  const netToSeller = input.salePrice - totalClosingCosts - input.mortgagePayoff;

  return {
    salePrice: input.salePrice,
    commission,
    titlePolicy: input.titlePolicy,
    escrowFee: input.escrowFee,
    recordingFees: input.recordingFees,
    docPrep: input.docPrep,
    survey: input.survey,
    hoaTransferFee: input.hoaTransferFee,
    homeWarranty: input.homeWarranty,
    taxProration,
    sellerConcessions: input.sellerConcessions,
    misc: input.misc,
    totalClosingCosts,
    mortgagePayoff: input.mortgagePayoff,
    netToSeller,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Texas owner's title policy estimate.
// Source: TDI promulgated rate schedule (Texas Department of Insurance).
// This is a SIMPLIFIED tier approximation — for binding numbers, query a
// title-company calculator. Good enough for a net-sheet estimate.
//
// Tiers approximate the basic rate per $1,000 of liability for a fee
// simple owner's policy. Real schedule has more brackets but these brackets
// match within ~$50 for prices up to $1M.
// ─────────────────────────────────────────────────────────────────────────────
export function estimateTxTitlePolicy(salePrice: number): number {
  if (salePrice <= 0) return 0;
  // Brackets: [upper bound, rate per $1000, base added at start of bracket]
  const brackets: { upTo: number; per1000: number; baseAt: number; basePrice: number }[] = [
    { upTo: 100_000, per1000: 5.75, baseAt: 328, basePrice: 10_000 },
    { upTo: 1_000_000, per1000: 5.0, baseAt: 845, basePrice: 100_000 },
    { upTo: 5_000_000, per1000: 4.0, baseAt: 5_345, basePrice: 1_000_000 },
  ];
  for (const b of brackets) {
    if (salePrice <= b.upTo) {
      const over = Math.max(0, salePrice - b.basePrice);
      return b.baseAt + (over / 1000) * b.per1000;
    }
  }
  // Fall through for very expensive properties.
  const top = brackets[brackets.length - 1];
  const over = salePrice - top.basePrice;
  return top.baseAt + (over / 1000) * top.per1000;
}

/**
 * Convert a YYYY-MM-DD date string to its day-of-year (1-365/366).
 * Returns today's day-of-year if the input is invalid.
 */
export function dayOfYear(isoDate: string): number {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return dayOfYear(now.toISOString().slice(0, 10));
  }
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 0));
  const diff = d.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
