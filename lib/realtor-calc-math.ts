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

// ────────────────────────────────────────────────────────────────────────────
// Buyer Closing Costs (Texas)
//
// One-time costs the buyer brings to the table, not the monthly PITI. Mirrors
// what shows up on a typical Texas closing disclosure (CD) page 2:
//
//   A. Origination charges (lender)
//   B. Services buyer did/didn't shop for (appraisal, credit, title services)
//   C. Taxes & gov't fees (recording, transfer)
//   E. Prepaids (homeowner's ins, mortgage ins, prepaid interest, property tax)
//   F. Initial escrow setup (months of insurance + tax held in escrow)
//
// Plus the cash-to-close math: down payment + total closing costs − credits.
// ────────────────────────────────────────────────────────────────────────────

export interface BuyerClosingInput {
  homePrice: number;
  downPayment: number;
  /** Annual interest rate as % (used for prepaid interest). */
  annualRatePct: number;
  /** Annual homeowners insurance in dollars. */
  annualInsurance: number;
  /** Annual property tax in dollars. */
  annualPropertyTax: number;
  /** Closing date as YYYY-MM-DD — used for prepaid-interest days. */
  closingDate: string;

  // A. Origination
  /** Origination fee as % of loan amount (e.g. 1 for 1%). */
  originationPct: number;
  /** Discount points as % of loan amount. */
  pointsPct: number;
  /** Flat lender / underwriting / processing fees. */
  lenderFlatFees: number;

  // B. Services
  appraisalFee: number;
  creditReportFee: number;
  /** Lender's title policy (paid by buyer in TX). */
  lendersTitlePolicy: number;
  /** Title search / endorsements / etc. */
  titleServices: number;

  // C. Taxes & gov't
  recordingFees: number;

  // E. Prepaids
  /** Months of homeowner's insurance paid up-front (usually 12). */
  prepaidInsMonths: number;

  // F. Escrow setup
  /** Months of insurance held in escrow at closing (usually 2–3). */
  escrowInsMonths: number;
  /** Months of property tax held in escrow at closing (usually 2–3). */
  escrowTaxMonths: number;

  // Credits
  /** Seller credit toward buyer's closing costs. */
  sellerCredit: number;
  /** Lender credit (from rate or otherwise). */
  lenderCredit: number;
  /** Earnest money already on deposit (counts toward cash-to-close). */
  earnestMoney: number;
}

export interface BuyerClosingBreakdown {
  loanAmount: number;
  // A
  origination: number;
  points: number;
  lenderFlatFees: number;
  // B
  appraisalFee: number;
  creditReportFee: number;
  lendersTitlePolicy: number;
  titleServices: number;
  // C
  recordingFees: number;
  // E
  prepaidInterest: number;
  prepaidInsurance: number;
  // F
  escrowInsurance: number;
  escrowTax: number;
  // Totals
  totalClosingCosts: number;
  totalCredits: number;
  cashToClose: number;
  prepaidInterestDays: number;
}

export function computeBuyerClosing(
  input: BuyerClosingInput
): BuyerClosingBreakdown {
  const loanAmount = Math.max(0, input.homePrice - input.downPayment);

  // Section A — lender origination
  const origination = (loanAmount * input.originationPct) / 100;
  const points = (loanAmount * input.pointsPct) / 100;
  const lenderFlatFees = input.lenderFlatFees;

  // Section B — services
  const appraisalFee = input.appraisalFee;
  const creditReportFee = input.creditReportFee;
  const lendersTitlePolicy = input.lendersTitlePolicy;
  const titleServices = input.titleServices;

  // Section C — taxes/recording
  const recordingFees = input.recordingFees;

  // Section E — prepaids
  // Prepaid interest covers the days from closing through end of that month.
  const closing = new Date(input.closingDate);
  let prepaidInterestDays = 15; // fallback if date parse fails
  if (!Number.isNaN(closing.getTime())) {
    const lastDay = new Date(
      Date.UTC(closing.getUTCFullYear(), closing.getUTCMonth() + 1, 0)
    ).getUTCDate();
    prepaidInterestDays = lastDay - closing.getUTCDate() + 1;
  }
  const dailyInterest = (loanAmount * (input.annualRatePct / 100)) / 365;
  const prepaidInterest = dailyInterest * Math.max(0, prepaidInterestDays);
  const prepaidInsurance =
    (input.annualInsurance / 12) * Math.max(0, input.prepaidInsMonths);

  // Section F — escrow setup
  const escrowInsurance =
    (input.annualInsurance / 12) * Math.max(0, input.escrowInsMonths);
  const escrowTax =
    (input.annualPropertyTax / 12) * Math.max(0, input.escrowTaxMonths);

  const totalClosingCosts =
    origination +
    points +
    lenderFlatFees +
    appraisalFee +
    creditReportFee +
    lendersTitlePolicy +
    titleServices +
    recordingFees +
    prepaidInterest +
    prepaidInsurance +
    escrowInsurance +
    escrowTax;

  const totalCredits =
    input.sellerCredit + input.lenderCredit + input.earnestMoney;

  const cashToClose =
    input.downPayment + totalClosingCosts - totalCredits;

  return {
    loanAmount,
    origination,
    points,
    lenderFlatFees,
    appraisalFee,
    creditReportFee,
    lendersTitlePolicy,
    titleServices,
    recordingFees,
    prepaidInterest,
    prepaidInsurance,
    escrowInsurance,
    escrowTax,
    totalClosingCosts,
    totalCredits,
    cashToClose,
    prepaidInterestDays,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Rent vs. Buy
//
// Models year-by-year cumulative cost of buying vs. renting, including:
//   Buying:  PITI → mortgage paydown (equity) + appreciation − maintenance
//            − selling costs when modeled at year N. Down payment + closing
//            counts as up-front cost.
//   Renting: rent (with annual escalator) + renters insurance. Up-front
//            cost is the security deposit.
//
// Result: arrays of cumulative net cost per year, plus a breakeven year
// (first year where buying is cheaper net-of-equity than renting).
// ────────────────────────────────────────────────────────────────────────────

export interface RentVsBuyInput {
  // Buying
  homePrice: number;
  downPayment: number;
  annualRatePct: number;
  termYears: number;
  closingCosts: number; // estimated one-time buyer closing costs
  annualPropertyTax: number;
  annualInsurance: number;
  monthlyHoa: number;
  /** Annual home-price appreciation %. Default 3. */
  appreciationPct: number;
  /** Annual maintenance as % of home value. Default 1. */
  maintenancePct: number;
  /** % of sale price the seller pays at exit (commission + closing). Default 8. */
  sellingCostPct: number;

  // Renting
  monthlyRent: number;
  /** Annual rent increase %. Default 4. */
  rentIncreasePct: number;
  /** Monthly renters insurance. */
  rentersInsurance: number;
  /** Security deposit. */
  securityDeposit: number;

  // Horizon
  /** How many years to project (e.g. 1–10). */
  horizonYears: number;
}

export interface RentVsBuyYear {
  year: number;
  /** Cumulative cost of buying through end of this year, net of equity if sold. */
  buyNetCost: number;
  /** Cumulative cost of renting through end of this year. */
  rentCost: number;
  /** Home value at end of this year. */
  homeValue: number;
  /** Loan balance at end of this year. */
  loanBalance: number;
  /** Equity if sold at end of this year (value − balance − selling costs). */
  netEquity: number;
}

export interface RentVsBuyResult {
  rows: RentVsBuyYear[];
  /** First year where buyNetCost ≤ rentCost; null if buying never wins in horizon. */
  breakevenYear: number | null;
}

export function computeRentVsBuy(input: RentVsBuyInput): RentVsBuyResult {
  const {
    homePrice,
    downPayment,
    annualRatePct,
    termYears,
    closingCosts,
    annualPropertyTax,
    annualInsurance,
    monthlyHoa,
    appreciationPct,
    maintenancePct,
    sellingCostPct,
    monthlyRent,
    rentIncreasePct,
    rentersInsurance,
    securityDeposit,
    horizonYears,
  } = input;

  const loanAmount = Math.max(0, homePrice - downPayment);
  const monthlyPandI = monthlyPI(loanAmount, annualRatePct, termYears);
  const monthlyRate = annualRatePct / 100 / 12;

  let cumulativeBuyOut = downPayment + closingCosts; // up-front
  let cumulativeRentOut = securityDeposit; // up-front (refundable but model as flow)
  let loanBalance = loanAmount;
  let homeValue = homePrice;
  let rent = monthlyRent;

  const rows: RentVsBuyYear[] = [];
  let breakevenYear: number | null = null;

  for (let y = 1; y <= horizonYears; y++) {
    // 12 months of mortgage payments + escrow + HOA + maintenance.
    for (let m = 0; m < 12; m++) {
      const interest = loanBalance * monthlyRate;
      const principal = Math.min(loanBalance, monthlyPandI - interest);
      loanBalance = Math.max(0, loanBalance - principal);
      // Interest, tax, insurance, HOA are real out-flows. Principal is
      // forced savings (equity) — NOT counted as cost, since we account
      // for it through loanBalance.
      cumulativeBuyOut += interest;
      cumulativeBuyOut += annualPropertyTax / 12;
      cumulativeBuyOut += annualInsurance / 12;
      cumulativeBuyOut += monthlyHoa;
      cumulativeBuyOut += (homeValue * (maintenancePct / 100)) / 12;

      cumulativeRentOut += rent;
      cumulativeRentOut += rentersInsurance;
    }

    // End-of-year appreciation + rent escalator.
    homeValue *= 1 + appreciationPct / 100;
    rent *= 1 + rentIncreasePct / 100;

    // Net equity if sold at end of year.
    const sellingCosts = homeValue * (sellingCostPct / 100);
    const netEquity = Math.max(0, homeValue - loanBalance - sellingCosts);
    // Down payment was already in cumulativeBuyOut; equity offsets total
    // out-of-pocket. "buyNetCost" = total dollars spent on housing minus
    // dollars recoverable through sale.
    const buyNetCost = cumulativeBuyOut - netEquity;

    rows.push({
      year: y,
      buyNetCost,
      rentCost: cumulativeRentOut,
      homeValue,
      loanBalance,
      netEquity,
    });

    if (breakevenYear === null && buyNetCost <= cumulativeRentOut) {
      breakevenYear = y;
    }
  }

  return { rows, breakevenYear };
}

// ────────────────────────────────────────────────────────────────────────────
// Investment Property ROI / Cash Flow
//
// What a real-estate investor wants to see for a rental:
//   - Monthly cash flow (rent − op-ex − debt service)
//   - Effective gross income (rent net of vacancy)
//   - NOI (EGI − operating expenses, BEFORE debt service)
//   - Cap rate (NOI / purchase price)
//   - Cash-on-cash return (annual cash flow / total cash invested)
//   - GRM (price / annual gross rent)
//   - DSCR (NOI / annual debt service) — what most DSCR lenders look at
//   - 1% rule check (rent ≥ 1% of price)
//   - 50% rule check (op-ex ≈ 50% of gross rent)
// ────────────────────────────────────────────────────────────────────────────

export interface InvestmentInput {
  purchasePrice: number;
  downPayment: number;
  closingCosts: number;
  initialRepairs: number;
  annualRatePct: number;
  termYears: number;

  // Income
  monthlyRent: number;
  /** Other monthly income (laundry, pet, parking, etc.). */
  otherMonthlyIncome: number;
  /** Vacancy rate as % of gross rent. Default 5. */
  vacancyPct: number;

  // Operating expenses (annual unless noted)
  annualPropertyTax: number;
  annualInsurance: number;
  monthlyHoa: number;
  /** Property management as % of EGI (effective gross income). */
  propMgmtPct: number;
  /** Maintenance reserve as % of EGI. */
  maintenancePct: number;
  /** CapEx reserve as % of EGI. */
  capExPct: number;
  monthlyUtilities: number;
  otherMonthlyOpEx: number;
}

export interface InvestmentBreakdown {
  loanAmount: number;
  totalCashInvested: number;
  // Income
  grossMonthlyRent: number;
  grossAnnualRent: number;
  vacancyLoss: number; // annual
  effectiveGrossIncome: number; // annual
  // Op-ex (annual)
  propertyTax: number;
  insurance: number;
  hoa: number;
  propMgmt: number;
  maintenance: number;
  capEx: number;
  utilities: number;
  otherOpEx: number;
  totalOpEx: number;
  // Returns
  noi: number; // annual
  annualDebtService: number;
  annualCashFlow: number;
  monthlyCashFlow: number;
  capRate: number; // decimal 0–1
  cashOnCash: number; // decimal
  grm: number;
  dscr: number;
  // Rule of thumb checks
  onePctRuleMet: boolean;
  fiftyPctRuleMet: boolean;
  rentToPriceRatio: number; // monthly rent / price
}

export function computeInvestment(input: InvestmentInput): InvestmentBreakdown {
  const {
    purchasePrice,
    downPayment,
    closingCosts,
    initialRepairs,
    annualRatePct,
    termYears,
    monthlyRent,
    otherMonthlyIncome,
    vacancyPct,
    annualPropertyTax,
    annualInsurance,
    monthlyHoa,
    propMgmtPct,
    maintenancePct,
    capExPct,
    monthlyUtilities,
    otherMonthlyOpEx,
  } = input;

  const loanAmount = Math.max(0, purchasePrice - downPayment);
  const totalCashInvested = downPayment + closingCosts + initialRepairs;

  // Income side
  const grossMonthlyRent = monthlyRent + otherMonthlyIncome;
  const grossAnnualRent = grossMonthlyRent * 12;
  const vacancyLoss = (grossAnnualRent * vacancyPct) / 100;
  const effectiveGrossIncome = grossAnnualRent - vacancyLoss;

  // Operating expenses
  const propertyTax = annualPropertyTax;
  const insurance = annualInsurance;
  const hoa = monthlyHoa * 12;
  const propMgmt = (effectiveGrossIncome * propMgmtPct) / 100;
  const maintenance = (effectiveGrossIncome * maintenancePct) / 100;
  const capEx = (effectiveGrossIncome * capExPct) / 100;
  const utilities = monthlyUtilities * 12;
  const otherOpEx = otherMonthlyOpEx * 12;
  const totalOpEx =
    propertyTax + insurance + hoa + propMgmt + maintenance + capEx + utilities + otherOpEx;

  const noi = effectiveGrossIncome - totalOpEx;

  const monthlyDebtService = monthlyPI(loanAmount, annualRatePct, termYears);
  const annualDebtService = monthlyDebtService * 12;

  const annualCashFlow = noi - annualDebtService;
  const monthlyCashFlow = annualCashFlow / 12;

  const capRate = purchasePrice > 0 ? noi / purchasePrice : 0;
  const cashOnCash =
    totalCashInvested > 0 ? annualCashFlow / totalCashInvested : 0;
  const grm = grossAnnualRent > 0 ? purchasePrice / grossAnnualRent : 0;
  const dscr = annualDebtService > 0 ? noi / annualDebtService : 0;

  const rentToPriceRatio =
    purchasePrice > 0 ? grossMonthlyRent / purchasePrice : 0;
  const onePctRuleMet = rentToPriceRatio >= 0.01;
  // Industry shorthand: total op-ex (incl. mgmt/maint/capex reserves) should
  // be roughly 50% of gross rent.
  const fiftyPctRuleMet =
    grossAnnualRent > 0 ? totalOpEx / grossAnnualRent <= 0.5 : false;

  return {
    loanAmount,
    totalCashInvested,
    grossMonthlyRent,
    grossAnnualRent,
    vacancyLoss,
    effectiveGrossIncome,
    propertyTax,
    insurance,
    hoa,
    propMgmt,
    maintenance,
    capEx,
    utilities,
    otherOpEx,
    totalOpEx,
    noi,
    annualDebtService,
    annualCashFlow,
    monthlyCashFlow,
    capRate,
    cashOnCash,
    grm,
    dscr,
    onePctRuleMet,
    fiftyPctRuleMet,
    rentToPriceRatio,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 1031 Exchange Timeline
//
// IRC §1031 like-kind exchange deadlines:
//   - 45-day identification period: identify replacement property/properties
//     in writing within 45 calendar days of relinquished closing.
//   - 180-day exchange period: acquire replacement within 180 calendar days
//     of relinquished closing OR by the due date of the tax return for the
//     year of the sale (incl. extensions) — whichever is earlier.
//
// Both periods run from the same start date and are NOT extended for
// weekends/holidays.
// ────────────────────────────────────────────────────────────────────────────

export interface ExchangeMilestone {
  /** Label e.g. "Day 0 — Relinquished closing" */
  label: string;
  /** YYYY-MM-DD */
  date: string;
  /** Days from the start (0 for the closing itself). */
  daysFromStart: number;
  /** Days remaining from "today" until this milestone (negative if past). */
  daysFromToday: number;
  /** One-line description for the realtor / client. */
  description: string;
  /** Hard IRS deadline (vs. recommended internal milestone). */
  isDeadline: boolean;
}

export interface ExchangeTimeline {
  startDate: string;
  identificationDeadline: string;
  exchangeDeadline: string;
  daysUntilId: number;
  daysUntilExchange: number;
  milestones: ExchangeMilestone[];
  /** Progress 0–1 through the 180-day window. */
  progress: number;
  /** Current status label */
  statusLabel: string;
}

/** Add N calendar days to a YYYY-MM-DD date. Returns YYYY-MM-DD. */
function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Days between two YYYY-MM-DD dates (signed; b − a). */
function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00Z').getTime();
  const db = new Date(b + 'T00:00:00Z').getTime();
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

export function computeExchangeTimeline(
  relinquishedClosingDate: string,
  todayIso?: string
): ExchangeTimeline {
  const today =
    todayIso ?? new Date().toISOString().slice(0, 10);

  const identificationDeadline = addDays(relinquishedClosingDate, 45);
  const exchangeDeadline = addDays(relinquishedClosingDate, 180);

  const daysUntilId = daysBetween(today, identificationDeadline);
  const daysUntilExchange = daysBetween(today, exchangeDeadline);
  const elapsed = daysBetween(relinquishedClosingDate, today);
  const progress = Math.max(0, Math.min(1, elapsed / 180));

  let statusLabel: string;
  if (elapsed < 0) {
    statusLabel = 'Pre-closing';
  } else if (daysUntilId >= 0) {
    statusLabel = 'Identification period';
  } else if (daysUntilExchange >= 0) {
    statusLabel = 'Exchange period';
  } else {
    statusLabel = 'Expired';
  }

  const mkMilestone = (
    label: string,
    days: number,
    description: string,
    isDeadline: boolean
  ): ExchangeMilestone => {
    const date = addDays(relinquishedClosingDate, days);
    return {
      label,
      date,
      daysFromStart: days,
      daysFromToday: daysBetween(today, date),
      description,
      isDeadline,
    };
  };

  const milestones: ExchangeMilestone[] = [
    mkMilestone(
      'Relinquished closing',
      0,
      'Sale of relinquished property closes. Proceeds go to qualified intermediary — do NOT touch them.',
      true
    ),
    mkMilestone(
      'Identification draft due',
      30,
      'Internal milestone: have your written identification list drafted and reviewed with the QI.',
      false
    ),
    mkMilestone(
      '45-day identification deadline',
      45,
      'Final written identification of replacement property(ies) must be delivered to the QI. No exceptions — not extended for weekends.',
      true
    ),
    mkMilestone(
      'Under contract on replacement',
      90,
      'Internal milestone: replacement property under contract with adequate buffer to close.',
      false
    ),
    mkMilestone(
      'Replacement closing buffer',
      165,
      'Target close date — leaves a 15-day buffer before the 180-day hard deadline.',
      false
    ),
    mkMilestone(
      '180-day exchange deadline',
      180,
      'Replacement property MUST close. Whichever comes first: 180 days or the due date of the tax return for the year of sale (incl. extensions).',
      true
    ),
  ];

  return {
    startDate: relinquishedClosingDate,
    identificationDeadline,
    exchangeDeadline,
    daysUntilId,
    daysUntilExchange,
    milestones,
    progress,
    statusLabel,
  };
}

// Local copy of monthlyPI to avoid a circular import w/ mortgage-math.
function monthlyPI(
  principal: number,
  annualRatePct: number,
  termYears: number
): number {
  if (principal <= 0 || termYears <= 0) return 0;
  const n = Math.round(termYears * 12);
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
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
