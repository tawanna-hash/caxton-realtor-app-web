// ────────────────────────────────────────────────────────────────────────────
// Texas Title Insurance — Promulgated Rate Math
//
// All Texas title companies charge identical premiums for the basic policies.
// The Texas Department of Insurance (TDI) promulgates the Basic Premium Rate
// Schedule (Rate Rule R-1) and the endorsement rates (R-19, R-29, etc.) in
// the Basic Manual of Title Insurance.
//
// Schedule effective March 1, 2026:
//   https://www.tdi.texas.gov/title/documents/titlerates2026.pdf
//
// Rate Rules referenced below:
//   R-1  Schedule of Basic Premium Rates
//   R-5  Simultaneous Owner's and Loan Policy ($100 LTP when LTP ≤ OTP)
//   R-8  Refinance reissue credit (50% if prior policy ≤ 4 yrs, 25% if 4–8 yrs)
//   R-19 Amendment of Tax Exception — Loan Policy ($5)
//   R-29 T-19 / T-19.1 Restrictions, Encroachments, Minerals Endorsement
//   R-30 T-23 Access Endorsement ($100 each)
//
// This is an ESTIMATOR — not an authoritative quote. Mirrors the formulas
// used by FNF, Old Republic, Stewart, and every other Texas title underwriter.
// ────────────────────────────────────────────────────────────────────────────

/** Bracket for liability > $25,000. */
interface RateBracket {
  /** Inclusive upper bound (USD). Infinity for the top bracket. */
  upTo: number;
  /** Amount to subtract from face value before multiplying. */
  subtract: number;
  /** Rate applied to (face − subtract). */
  multiplyBy: number;
  /** Flat add added to the bracket result. */
  add: number;
}

/**
 * TDI Basic Premium Rate Schedule — Effective March 1, 2026.
 *
 * For policies $25,000 and below, premium is the minimum $308.
 * For policies above $25,000 and below $100,000, the schedule is a stepped
 * table where each $500 of additional liability adds a few dollars. The
 * "$100,001 – $1,000,000" bracket below extends down: the TDI table sets
 * the premium at exactly $780 at $100,000, and the linear formula
 * (subtract $100k, multiply by $0.00494, add $780) yields exactly that
 * value at the bracket floor. For liability between $25,000 and $100,000,
 * we interpolate linearly between $308 (at $25k) and $780 (at $100k) —
 * within ~$5 of the official stepped table, which is the same approach
 * the seller-net-sheet estimator has always used.
 */
const BRACKETS: RateBracket[] = [
  { upTo: 1_000_000, subtract: 100_000, multiplyBy: 0.00494, add: 780 },
  { upTo: 5_000_000, subtract: 1_000_000, multiplyBy: 0.00406, add: 5_226 },
  { upTo: 15_000_000, subtract: 5_000_000, multiplyBy: 0.00335, add: 21_466 },
  { upTo: 25_000_000, subtract: 15_000_000, multiplyBy: 0.00238, add: 54_966 },
  { upTo: 50_000_000, subtract: 25_000_000, multiplyBy: 0.00143, add: 78_766 },
  { upTo: 100_000_000, subtract: 50_000_000, multiplyBy: 0.00129, add: 114_516 },
  { upTo: Infinity, subtract: 100_000_000, multiplyBy: 0.00116, add: 179_016 },
];

/** Minimum basic premium ($25,000 and below). */
const MIN_BASIC_PREMIUM = 308;

/**
 * Basic Premium Rate for a policy of any face value, per TDI R-1.
 * Returns the owner's title policy premium (full rate) at the given liability.
 */
export function basicPremium(faceValue: number): number {
  if (faceValue <= 0) return 0;
  if (faceValue <= 25_000) return MIN_BASIC_PREMIUM;

  // $25,000 < face < $100,000: linear interpolation between $308 → $780
  if (faceValue < 100_000) {
    const t = (faceValue - 25_000) / (100_000 - 25_000);
    return Math.round(MIN_BASIC_PREMIUM + t * (780 - MIN_BASIC_PREMIUM));
  }

  for (const b of BRACKETS) {
    if (faceValue <= b.upTo) {
      const excess = faceValue - b.subtract;
      return Math.round(excess * b.multiplyBy + b.add);
    }
  }
  // Should be unreachable — Infinity bracket catches everything.
  return Math.round(MIN_BASIC_PREMIUM);
}

// ────────────────────────────────────────────────────────────────────────────
// R-5 Simultaneous Issue — Owner's + Loan Policy at same closing
// ────────────────────────────────────────────────────────────────────────────

interface SimultaneousIssueResult {
  /** Owner's Title Policy premium (always at Basic Rate). */
  owner: number;
  /** Lender's Title Policy premium (simultaneous-issue rate). */
  lender: number;
}

/**
 * R-5 Simultaneous Issue:
 *   A) Loan ≤ Owner's policy amount  → Lender's policy = $100
 *   B) Loan > Owner's policy amount  → Lender's policy =
 *        Basic Rate on loan amount − Basic Rate on owner amount + $100
 *
 * If loanAmount is 0 (cash purchase), the lender's policy is $0.
 */
function simultaneousIssue(
  ownerAmount: number,
  loanAmount: number,
): SimultaneousIssueResult {
  const owner = basicPremium(ownerAmount);
  if (loanAmount <= 0) return { owner, lender: 0 };

  if (loanAmount <= ownerAmount) {
    return { owner, lender: 100 };
  }
  // R-5.B — Loan exceeds owner's policy amount
  const lender = basicPremium(loanAmount) - basicPremium(ownerAmount) + 100;
  return { owner, lender: Math.max(lender, 100) };
}

// ────────────────────────────────────────────────────────────────────────────
// R-8 Refinance Reissue Credit (no Owner's Policy — Loan Policy only)
// ────────────────────────────────────────────────────────────────────────────

export type ReissueAge = 'within-4yr' | '4-to-8yr' | 'over-8yr' | 'none';

/**
 * R-8: When refinancing a loan that was insured by a prior Loan Policy and
 * the prior policy was issued within 8 years, the new Loan Policy gets a
 * credit against the basic rate.
 *
 *   Within 4 years  →  50% credit
 *   4–8 years       →  25% credit
 *   Over 8 years    →  no credit (full basic rate)
 *
 * Returns the lender's policy premium for a refinance (no owner's policy).
 * Minimum is the promulgated minimum basic premium.
 */
function refinanceLoanPolicy(loanAmount: number, age: ReissueAge): number {
  if (loanAmount <= 0) return 0;
  const basic = basicPremium(loanAmount);
  let creditPct = 0;
  if (age === 'within-4yr') creditPct = 0.5;
  else if (age === '4-to-8yr') creditPct = 0.25;
  const premium = basic * (1 - creditPct);
  return Math.max(Math.round(premium), MIN_BASIC_PREMIUM);
}

// ────────────────────────────────────────────────────────────────────────────
// Endorsements — most common residential ones in Texas closings
// ────────────────────────────────────────────────────────────────────────────

interface EndorsementOptions {
  /** T-19.1 — Restrictions, Encroachments, Minerals (Owner's Policy). */
  t19_1: boolean;
  /** T-19 — Restrictions, Encroachments, Minerals (Loan Policy). */
  t19: boolean;
  /** T-30 — Tax Deletion (Loan Policy). $5 per R-19. */
  t30: boolean;
  /**
   * T-3 / Area & Boundary amendment on the OWNER's policy.
   *   Residential T-1R: 5% of Basic Rate (minimum $20).
   *   Residential T-1:  15% of Basic Rate (minimum $20).
   *   Non-residential T-1: 15% of Basic Rate.
   *
   * On loan policies there is NO premium for amending area/boundary.
   */
  surveyDeletion: boolean;
  /** Treat as residential real property for endorsement pricing. */
  residential: boolean;
}

interface EndorsementLine {
  code: string;
  label: string;
  amount: number;
}

function endorsementCharges(
  ownerAmount: number,
  loanAmount: number,
  opts: EndorsementOptions,
): EndorsementLine[] {
  const out: EndorsementLine[] = [];
  const ownerBasic = basicPremium(ownerAmount);
  const loanBasic = loanAmount > 0 ? basicPremium(loanAmount) : 0;

  // T-19.1 Owner's Policy — Restrictions, Encroachments, Minerals
  //   Residential: 10% of basic rate (5% if survey coverage added simultaneously)
  //   Non-res:     15% of basic rate (10% if survey coverage added simultaneously)
  //   Min $50.
  if (opts.t19_1 && ownerAmount > 0) {
    const withSurvey = opts.surveyDeletion;
    let pct: number;
    if (opts.residential) {
      pct = withSurvey ? 0.05 : 0.1;
    } else {
      pct = withSurvey ? 0.1 : 0.15;
    }
    const amt = Math.max(Math.round(ownerBasic * pct), 50);
    out.push({
      code: 'T-19.1',
      label: 'Restrictions, Encroachments, Minerals (Owner)',
      amount: amt,
    });
  }

  // T-19 Loan Policy — Restrictions, Encroachments, Minerals
  //   Residential: 5% of basic rate. Non-res: 10%. Min $50.
  if (opts.t19 && loanAmount > 0) {
    const pct = opts.residential ? 0.05 : 0.1;
    const amt = Math.max(Math.round(loanBasic * pct), 50);
    out.push({
      code: 'T-19',
      label: 'Restrictions, Encroachments, Minerals (Loan)',
      amount: amt,
    });
  }

  // T-30 Tax Deletion (Loan Policy) — $5 per R-19
  if (opts.t30 && loanAmount > 0) {
    out.push({ code: 'T-30', label: 'Tax Deletion (Loan)', amount: 5 });
  }

  // Survey / Area & Boundary deletion on Owner's Policy
  //   Residential T-1R: 5% of Basic Rate. Min $20.
  if (opts.surveyDeletion && ownerAmount > 0) {
    const pct = opts.residential ? 0.05 : 0.15;
    const amt = Math.max(Math.round(ownerBasic * pct), 20);
    out.push({
      code: 'T-3',
      label: 'Area & Boundary deletion (Owner)',
      amount: amt,
    });
  }

  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Top-level rate quote — what the calculator page renders
// ────────────────────────────────────────────────────────────────────────────

export type TitleTransactionType = 'purchase' | 'refinance';

export interface TitleQuoteInput {
  transactionType: TitleTransactionType;
  /** For purchase: sales price (used as owner's policy face value). */
  salesPrice: number;
  /** Loan amount. 0 for cash purchase. */
  loanAmount: number;
  /** Refinance only — age of the prior insured loan. */
  reissueAge: ReissueAge;
  /** Endorsement toggles. */
  endorsements: EndorsementOptions;
  /** Optional escrow / closing fee (typical ~$350 in TX). */
  escrowFee: number;
  /** Optional guaranty assessment recoupment (statutory $4.50 per policy in TX). */
  guarantyAssessment: number;
  /** Optional recording fees (county clerk). */
  recordingFees: number;
}

interface TitleQuoteLine {
  code: string;
  label: string;
  amount: number;
  emphasis?: boolean;
}

export interface TitleQuoteResult {
  ownerPolicy: number;
  lenderPolicy: number;
  endorsements: EndorsementLine[];
  endorsementsTotal: number;
  escrowFee: number;
  guarantyAssessment: number;
  recordingFees: number;
  total: number;
  /** Sectioned line items ready for table rendering. */
  lines: TitleQuoteLine[];
}

const GUARANTY_ASSESSMENT_DEFAULT = 4.5;

export function quoteTitleRates(input: TitleQuoteInput): TitleQuoteResult {
  let ownerPolicy = 0;
  let lenderPolicy = 0;

  if (input.transactionType === 'purchase') {
    const sim = simultaneousIssue(input.salesPrice, input.loanAmount);
    ownerPolicy = sim.owner;
    lenderPolicy = sim.lender;
  } else {
    // Refinance — Loan Policy only, R-8 reissue credit applied.
    ownerPolicy = 0;
    lenderPolicy = refinanceLoanPolicy(input.loanAmount, input.reissueAge);
  }

  // Endorsements (use loanAmount==0 in refinance for owner-side endorsements)
  const endorsementOwnerBasis =
    input.transactionType === 'purchase' ? input.salesPrice : 0;
  const endorsementLoanBasis = input.loanAmount;
  const endorsements = endorsementCharges(
    endorsementOwnerBasis,
    endorsementLoanBasis,
    input.endorsements,
  );
  const endorsementsTotal = endorsements.reduce((s, e) => s + e.amount, 0);

  // Guaranty assessment — TDI charges $4.50 per policy issued in TX (passed
  // through to the consumer line-by-line by most title companies).
  const policiesIssued =
    (ownerPolicy > 0 ? 1 : 0) + (lenderPolicy > 0 ? 1 : 0);
  const guarantyAssessment =
    input.guarantyAssessment > 0
      ? input.guarantyAssessment
      : GUARANTY_ASSESSMENT_DEFAULT * policiesIssued;

  const total =
    ownerPolicy +
    lenderPolicy +
    endorsementsTotal +
    input.escrowFee +
    guarantyAssessment +
    input.recordingFees;

  const lines: TitleQuoteLine[] = [];
  if (ownerPolicy > 0) {
    lines.push({
      code: 'OTP',
      label: "Owner's Title Policy",
      amount: ownerPolicy,
    });
  }
  if (lenderPolicy > 0) {
    lines.push({
      code: 'LTP',
      label:
        input.transactionType === 'purchase'
          ? "Lender's Title Policy (R-5 simultaneous)"
          : "Lender's Title Policy (R-8 refinance)",
      amount: lenderPolicy,
    });
  }
  for (const e of endorsements) {
    lines.push({ code: e.code, label: e.label, amount: e.amount });
  }
  if (input.escrowFee > 0) {
    lines.push({ code: 'Escrow', label: 'Escrow / closing fee', amount: input.escrowFee });
  }
  if (guarantyAssessment > 0) {
    lines.push({
      code: 'TGA',
      label: `Texas Guaranty assessment (${policiesIssued} ${policiesIssued === 1 ? 'policy' : 'policies'})`,
      amount: guarantyAssessment,
    });
  }
  if (input.recordingFees > 0) {
    lines.push({ code: 'Recording', label: 'Recording fees', amount: input.recordingFees });
  }
  lines.push({ code: 'TOTAL', label: 'Estimated total at closing', amount: total, emphasis: true });

  return {
    ownerPolicy,
    lenderPolicy,
    endorsements,
    endorsementsTotal,
    escrowFee: input.escrowFee,
    guarantyAssessment,
    recordingFees: input.recordingFees,
    total,
    lines,
  };
}
