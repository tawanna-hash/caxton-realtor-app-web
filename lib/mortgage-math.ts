// lib/mortgage-math.ts
//
// Pure mortgage math helpers. No React, no DOM — safe to import anywhere.
// All money values are USD numbers (not cents). Rates are entered as
// percentages (e.g. 6.75 means 6.75%).

// ─────────────────────────────────────────────────────────────────────────────
// Core P&I (principal + interest) calculation.
// Uses the standard amortizing-loan formula:
//   M = P * r / (1 - (1 + r)^-n)
// where r = monthly rate (decimal), n = total months.
// ─────────────────────────────────────────────────────────────────────────────
export function monthlyPI(
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

// ─────────────────────────────────────────────────────────────────────────────
// Full PITI breakdown — what most realtors quote clients.
//   P + I  — calculated from loan amount, rate, term
//   T      — property tax (annual amount / 12)
//   I      — homeowners insurance (annual / 12)
//   PMI    — private mortgage insurance (annual rate × loan amount / 12),
//             included only when LTV > 80%
//   HOA    — optional monthly HOA dues
// ─────────────────────────────────────────────────────────────────────────────
export interface PitiInput {
  homePrice: number;
  downPayment: number; // dollars
  annualRatePct: number;
  termYears: number;
  /** Annual property tax in dollars (NOT a rate). */
  annualPropertyTax: number;
  /** Annual homeowners insurance in dollars. */
  annualInsurance: number;
  /** Monthly HOA dues. Default 0. */
  monthlyHoa?: number;
  /** PMI annual rate as % of loan amount (e.g. 0.5 means 0.5%). Default 0.5. */
  pmiAnnualRatePct?: number;
}

export interface PitiBreakdown {
  loanAmount: number;
  ltv: number; // 0–1
  principalAndInterest: number;
  propertyTax: number;
  insurance: number;
  pmi: number;
  hoa: number;
  total: number;
}

export function computePiti(input: PitiInput): PitiBreakdown {
  const {
    homePrice,
    downPayment,
    annualRatePct,
    termYears,
    annualPropertyTax,
    annualInsurance,
    monthlyHoa = 0,
    pmiAnnualRatePct = 0.5,
  } = input;

  const loanAmount = Math.max(0, homePrice - downPayment);
  const ltv = homePrice > 0 ? loanAmount / homePrice : 0;
  const principalAndInterest = monthlyPI(loanAmount, annualRatePct, termYears);
  const propertyTax = annualPropertyTax / 12;
  const insurance = annualInsurance / 12;
  // Industry rule: PMI is required when LTV > 80%.
  const pmi = ltv > 0.8 ? (loanAmount * (pmiAnnualRatePct / 100)) / 12 : 0;
  const hoa = monthlyHoa;
  const total = principalAndInterest + propertyTax + insurance + pmi + hoa;

  return {
    loanAmount,
    ltv,
    principalAndInterest,
    propertyTax,
    insurance,
    pmi,
    hoa,
    total,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Amortization schedule. Returns one row per month, plus annual rollups.
// For 30y loans this is 360 rows — fine to compute in browser.
// ─────────────────────────────────────────────────────────────────────────────
export interface AmortRow {
  month: number; // 1-indexed
  year: number; // 1-indexed (month 1–12 → year 1)
  payment: number; // P&I only (no taxes/ins)
  principal: number;
  interest: number;
  balance: number; // after this payment
}

export interface AmortAnnualRow {
  year: number;
  principalPaid: number;
  interestPaid: number;
  endingBalance: number;
}

export function amortize(
  principal: number,
  annualRatePct: number,
  termYears: number
): { rows: AmortRow[]; annual: AmortAnnualRow[]; totalInterest: number } {
  const rows: AmortRow[] = [];
  if (principal <= 0 || termYears <= 0) {
    return { rows, annual: [], totalInterest: 0 };
  }
  const n = Math.round(termYears * 12);
  const r = annualRatePct / 100 / 12;
  const payment = monthlyPI(principal, annualRatePct, termYears);
  let balance = principal;
  let totalInterest = 0;

  for (let m = 1; m <= n; m++) {
    const interest = balance * r;
    let principalPart = payment - interest;
    // Final-row safeguard: pay off whatever's left (avoids floating-point dust).
    if (m === n) principalPart = balance;
    balance = Math.max(0, balance - principalPart);
    totalInterest += interest;
    rows.push({
      month: m,
      year: Math.ceil(m / 12),
      payment: principalPart + interest,
      principal: principalPart,
      interest,
      balance,
    });
  }

  // Roll up by year for the schedule table.
  const annualMap = new Map<number, AmortAnnualRow>();
  for (const row of rows) {
    const y = annualMap.get(row.year) ?? {
      year: row.year,
      principalPaid: 0,
      interestPaid: 0,
      endingBalance: 0,
    };
    y.principalPaid += row.principal;
    y.interestPaid += row.interest;
    y.endingBalance = row.balance;
    annualMap.set(row.year, y);
  }
  const annual = Array.from(annualMap.values()).sort((a, b) => a.year - b.year);

  return { rows, annual, totalInterest };
}

// ─────────────────────────────────────────────────────────────────────────────
// Affordability calculator — what price can a client afford?
// Solves backwards from a target monthly payment using the 28/36 rule
// (front-end ratio = housing / income; back-end = total debt / income).
// We use the front-end ratio for the housing budget.
// ─────────────────────────────────────────────────────────────────────────────
export interface AffordabilityInput {
  annualIncome: number;
  monthlyDebts: number; // car, student loans, credit cards
  downPayment: number;
  annualRatePct: number;
  termYears: number;
  /** Front-end DTI cap (e.g. 0.28 for 28%). Default 0.28. */
  frontEndRatio?: number;
  /** Back-end DTI cap (e.g. 0.36 for 36%). Default 0.36. */
  backEndRatio?: number;
  /** Effective annual property-tax rate as % of home price (e.g. 1.8 for 1.8%). */
  propertyTaxRatePct?: number;
  /** Annual insurance as % of home price (e.g. 0.35). */
  insuranceRatePct?: number;
  /** Monthly HOA dues. */
  monthlyHoa?: number;
}

export interface AffordabilityResult {
  maxMonthlyHousing: number;
  maxLoanAmount: number;
  maxHomePrice: number;
  bindingRatio: 'front-end' | 'back-end';
}

export function computeAffordability(
  input: AffordabilityInput
): AffordabilityResult {
  const {
    annualIncome,
    monthlyDebts,
    downPayment,
    annualRatePct,
    termYears,
    frontEndRatio = 0.28,
    backEndRatio = 0.36,
    propertyTaxRatePct = 1.8,
    insuranceRatePct = 0.35,
    monthlyHoa = 0,
  } = input;

  const monthlyIncome = annualIncome / 12;
  const frontEndCap = monthlyIncome * frontEndRatio;
  const backEndCap = monthlyIncome * backEndRatio - monthlyDebts;
  const maxMonthlyHousing = Math.max(0, Math.min(frontEndCap, backEndCap));
  const bindingRatio: 'front-end' | 'back-end' =
    frontEndCap <= backEndCap ? 'front-end' : 'back-end';

  // Budget for P&I after subtracting estimated tax+ins+HOA. We approximate
  // tax/ins as % of price; since we don't know price yet, iterate twice.
  // Iteration 1: assume price = downPayment + (housing budget × 100), refine.
  // In practice, two passes converge well enough for a quote.
  let price = downPayment + maxMonthlyHousing * 200; // initial guess
  for (let i = 0; i < 6; i++) {
    const escrow =
      (price * (propertyTaxRatePct / 100)) / 12 +
      (price * (insuranceRatePct / 100)) / 12 +
      monthlyHoa;
    const piBudget = Math.max(0, maxMonthlyHousing - escrow);
    const loan = solveLoanFromPayment(piBudget, annualRatePct, termYears);
    price = loan + downPayment;
  }

  const maxLoanAmount = Math.max(0, price - downPayment);
  return {
    maxMonthlyHousing,
    maxLoanAmount,
    maxHomePrice: price,
    bindingRatio,
  };
}

/** Invert the P&I formula to solve for principal given a target payment. */
export function solveLoanFromPayment(
  monthlyPayment: number,
  annualRatePct: number,
  termYears: number
): number {
  if (monthlyPayment <= 0 || termYears <= 0) return 0;
  const n = Math.round(termYears * 12);
  const r = annualRatePct / 100 / 12;
  if (r === 0) return monthlyPayment * n;
  return (monthlyPayment * (1 - Math.pow(1 + r, -n))) / r;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers — used by the calculator UI.
// ─────────────────────────────────────────────────────────────────────────────
export function fmtUSD(n: number, opts?: { cents?: boolean }): string {
  const cents = opts?.cents ?? false;
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
}

export function fmtPct(decimal: number, digits = 1): string {
  return `${(decimal * 100).toFixed(digits)}%`;
}
