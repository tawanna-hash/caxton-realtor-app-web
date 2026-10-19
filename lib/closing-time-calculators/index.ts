import * as calc from './calc/index';

/** Calculator definitions. The math lives in @ct/shared (ported from the legacy RealtyLine calculators); this file describes inputs and how results are shown. */
export type Values = Record<string, string | boolean>;
export interface Field {
  key: string; label: string; group?: string; hint?: string;
  type: 'money' | 'pct' | 'num' | 'date' | 'select' | 'check';
  def: string | boolean; options?: [string, string][];
}
export type Row = [label: string, value: string, tone?: 'strong' | 'neg'];
export interface Output {
  hero?: { label: string; value: string; note?: string };
  sections: { heading: string; rows: Row[] }[];
  table?: { heading: string; cols: string[]; rows: string[][] };
  note?: string;
}
export interface Calculator { id: string; title: string; blurb: string; fields: Field[]; compute: (v: Values) => Output; dealAware?: boolean }

const n = (v: Values, k: string) => { const x = parseFloat(String(v[k] ?? '')); return Number.isFinite(x) ? x : 0; };
const usd = (x: number) => calc.fmtUSD(x, { cents: true });
const usd0 = (x: number) => calc.fmtUSD(x);
const neg = (x: number) => `\u2212${usd(x)}`;
const today = () => new Date().toISOString().slice(0, 10);
const m = (key: string, label: string, def: string, extra: Partial<Field> = {}): Field => ({ key, label, type: 'money', def, ...extra });
const p = (key: string, label: string, def: string, extra: Partial<Field> = {}): Field => ({ key, label, type: 'pct', def, ...extra });
const num = (key: string, label: string, def: string, extra: Partial<Field> = {}): Field => ({ key, label, type: 'num', def, ...extra });

const TERMS: [string, string][] = [['30', '30 Years'], ['25', '25 Years'], ['20', '20 Years'], ['15', '15 Years'], ['10', '10 Years']];

const mortgage: Calculator = {
  id: 'mortgage', title: 'Mortgage Payment', blurb: 'Monthly payment with taxes, insurance and mortgage insurance, plus the yearly balance.',
  fields: [
    m('price', 'Home Price', '450000'), p('down', 'Down Payment', '20'), p('rate', 'Interest Rate', '6.75'),
    { key: 'term', label: 'Loan Term', type: 'select', def: '30', options: TERMS },
    m('tax', 'Property Tax Per Year', '8100'), m('ins', 'Home Insurance Per Year', '1575'), m('hoa', 'HOA Per Month', '0'),
    p('pmi', 'Mortgage Insurance Rate', '0.5', { hint: 'Applies only above 80% loan to value' }),
  ],
  compute: (v) => {
    const price = n(v, 'price'), down = (price * n(v, 'down')) / 100;
    const r = calc.computePiti({ homePrice: price, downPayment: down, annualRatePct: n(v, 'rate'), termYears: n(v, 'term'), annualPropertyTax: n(v, 'tax'), annualInsurance: n(v, 'ins'), monthlyHoa: n(v, 'hoa'), pmiAnnualRatePct: n(v, 'pmi') });
    const a = calc.amortize(r.loanAmount, n(v, 'rate'), n(v, 'term'));
    return {
      hero: { label: 'Monthly Payment', value: usd(r.total), note: `Loan ${usd0(r.loanAmount)} at ${calc.fmtPct(r.ltv, 0)} loan to value` },
      sections: [{ heading: 'Monthly Breakdown', rows: [['Principal And Interest', usd(r.principalAndInterest)], ['Property Tax', usd(r.propertyTax)], ['Home Insurance', usd(r.insurance)], ['Mortgage Insurance', usd(r.pmi)], ['HOA', usd(r.hoa)], ['Total', usd(r.total), 'strong']] },
        { heading: 'Over The Loan', rows: [['Down Payment', usd0(down)], ['Total Interest', usd0(a.totalInterest)]] }],
      table: { heading: 'Yearly Balance', cols: ['Year', 'Principal Paid', 'Interest Paid', 'Ending Balance'], rows: a.annual.map((y) => [String(y.year), usd0(y.principalPaid), usd0(y.interestPaid), usd0(y.endingBalance)]) },
    };
  },
};

const affordability: Calculator = {
  id: 'affordability', title: 'Affordability', blurb: 'The most a buyer can afford from income, debts and down payment.',
  fields: [
    m('income', 'Annual Income', '120000'), m('debts', 'Monthly Debts', '500', { hint: 'Car, student loans, credit cards' }), m('down', 'Down Payment', '50000'),
    p('rate', 'Interest Rate', '6.75'), { key: 'term', label: 'Loan Term', type: 'select', def: '30', options: TERMS },
    p('front', 'Housing Ratio Limit', '28'), p('back', 'Total Debt Ratio Limit', '36'), m('hoa', 'HOA Per Month', '0'),
  ],
  compute: (v) => {
    const r = calc.computeAffordability({ annualIncome: n(v, 'income'), monthlyDebts: n(v, 'debts'), downPayment: n(v, 'down'), annualRatePct: n(v, 'rate'), termYears: n(v, 'term'), frontEndRatio: n(v, 'front') / 100, backEndRatio: n(v, 'back') / 100, monthlyHoa: n(v, 'hoa') });
    return {
      hero: { label: 'Maximum Home Price', value: usd0(r.maxHomePrice), note: `Limited by the ${r.bindingRatio === 'front-end' ? 'housing' : 'total debt'} ratio` },
      sections: [{ heading: 'Results', rows: [['Maximum Monthly Housing Payment', usd(r.maxMonthlyHousing)], ['Maximum Loan Amount', usd0(r.maxLoanAmount)], ['Down Payment', usd0(n(v, 'down'))]] }],
    };
  },
};

const commission: Calculator = {
  id: 'commission', title: 'Commission', blurb: 'From sale price to take-home: side split, referral, broker split and flat fee.',
  fields: [
    { key: 'side', label: 'Which Side', type: 'select', def: 'listing', options: [['listing', 'Listing Side'], ['buyer', 'Buyer Side']] },
    m('price', 'Sale Price', '450000'), p('total', 'Total Commission Rate', '6', { hint: 'Both Sides Combined' }), p('share', 'Listing Side Share', '50'),
    p('split', 'Your Split With Broker', '70'), m('flat', 'Broker Flat Fee', '395'), p('ref', 'Referral Fee', '0', { hint: 'Percent Of Your Side' }),
  ],
  compute: (v) => {
    const side = v.side === 'buyer' ? 'buyer' : 'listing';
    const r = calc.computeCommission({ salePrice: n(v, 'price'), totalRatePct: n(v, 'total'), listingSharePct: n(v, 'share'), agentSplitPct: n(v, 'split'), brokerFlatFee: n(v, 'flat'), referralPct: n(v, 'ref'), side });
    const rows: Row[] = [['Total Commission', usd(r.totalCommission)], [`Your side (${side})`, usd(r.sideCommission)]];
    if (r.referralAmount > 0) rows.push(['Referral out', neg(r.referralAmount), 'neg']);
    rows.push(['After referral', usd(r.afterReferral)], [`Your split (${n(v, 'split')}%)`, usd(r.agentGross)]);
    if (r.brokerFlatFee > 0) rows.push(['Broker flat fee', neg(r.brokerFlatFee), 'neg']);
    rows.push(['Net to you', usd(r.agentNet), 'strong'], ['Broker keeps', usd(r.brokerSplit)]);
    return { hero: { label: 'Your Take-Home', value: usd(r.agentNet), note: `${((r.agentNet / (n(v, 'price') || 1)) * 100).toFixed(2)}% of sale price` }, sections: [{ heading: 'Commission To Take-Home', rows }], note: 'Estimate only. Confirm exact figures on your commission disbursement authorization. Does not deduct income or self-employment tax.' };
  },
};

const netSheet: Calculator = {
  id: 'net-sheet', title: 'Seller Net Sheet', blurb: 'What the seller walks away with after payoff, commission and Texas closing costs.',
  fields: [
    m('price', 'Sale Price', '450000', { group: 'The sale' }), m('payoff', 'Mortgage Payoff', '280000', { group: 'The sale' }), p('comm', 'Commission Rate', '6', { group: 'The sale' }),
    m('tax', 'Property Tax Per Year', '8100', { group: 'The sale' }), { key: 'date', label: 'Closing Date', type: 'date', def: '', group: 'The sale', hint: 'Used to prorate property tax' },
    m('title', 'Owner Title Policy', '', { group: 'Closing Costs', hint: 'Leave blank for the Texas rate estimate' }), m('escrow', 'Escrow Fee', '425', { group: 'Closing Costs' }),
    m('rec', 'Recording Fees', '150', { group: 'Closing Costs' }), m('doc', 'Document Prep', '250', { group: 'Closing Costs' }), m('survey', 'Survey', '0', { group: 'Closing Costs' }),
    m('hoa', 'HOA Transfer Fee', '0', { group: 'Closing Costs' }), m('warranty', 'Home Warranty', '0', { group: 'Closing Costs' }),
    m('conc', 'Seller Concessions', '0', { group: 'Closing Costs' }), m('misc', 'Other Costs', '0', { group: 'Closing Costs' }),
  ],
  compute: (v) => {
    const price = n(v, 'price');
    const title = String(v.title ?? '').trim() === '' ? calc.estimateTxTitlePolicy(price) : n(v, 'title');
    const r = calc.computeNetSheet({ salePrice: price, mortgagePayoff: n(v, 'payoff'), commissionRatePct: n(v, 'comm'), annualPropertyTax: n(v, 'tax'), closingDayOfYear: calc.dayOfYear(String(v.date || today())),
      titlePolicy: title, escrowFee: n(v, 'escrow'), recordingFees: n(v, 'rec'), docPrep: n(v, 'doc'), survey: n(v, 'survey'), hoaTransferFee: n(v, 'hoa'), homeWarranty: n(v, 'warranty'), sellerConcessions: n(v, 'conc'), misc: n(v, 'misc') });
    const cost = (l: string, x: number): Row => [l, neg(x), 'neg'];
    return {
      hero: { label: 'Net To Seller', value: usd(r.netToSeller), note: `After ${usd0(r.totalClosingCosts + r.mortgagePayoff)} in payoff and costs` },
      sections: [{ heading: 'Net Sheet', rows: [['Sale Price', usd(r.salePrice)], cost('Commission', r.commission), cost('Owner Title Policy', r.titlePolicy), cost('Escrow Fee', r.escrowFee), cost('Recording Fees', r.recordingFees), cost('Document Prep', r.docPrep), cost('Survey', r.survey), cost('HOA Transfer Fee', r.hoaTransferFee), cost('Home Warranty', r.homeWarranty), cost('Property Tax Proration', r.taxProration), cost('Seller Concessions', r.sellerConcessions), cost('Other Costs', r.misc), ['Total Closing Costs', neg(r.totalClosingCosts), 'neg'], cost('Mortgage Payoff', r.mortgagePayoff), ['Net To Seller', usd(r.netToSeller), 'strong']] }],
      note: 'Estimate only. Final figures come from the title company settlement statement.',
    };
  },
};

const closing: Calculator = {
  id: 'closing', title: 'Cash To Close', blurb: 'What the buyer brings to closing. Fills in the price, closing date and earnest money from your saved contract.',
  fields: [
    m('price', 'Home Price', '450000', { group: 'The purchase' }), p('down', 'Down Payment', '20', { group: 'The purchase' }), p('rate', 'Interest Rate', '6.75', { group: 'The purchase' }),
    m('ins', 'Home Insurance Per Year', '1575', { group: 'The purchase' }), m('tax', 'Property Tax Per Year', '8100', { group: 'The purchase' }), { key: 'date', label: 'Closing Date', type: 'date', def: '', group: 'The purchase', hint: 'Sets the days of prepaid interest' },
    p('orig', 'Origination Fee', '1', { group: 'Lender' }), p('points', 'Discount Points', '0', { group: 'Lender' }), m('lender', 'Lender Fees', '1200', { group: 'Lender' }),
    m('appraisal', 'Appraisal', '600', { group: 'Services' }), m('credit', 'Credit Report', '75', { group: 'Services' }), m('lpolicy', 'Lender Title Policy', '150', { group: 'Services' }), m('tservices', 'Title Services', '450', { group: 'Services' }), m('rec', 'Recording Fees', '150', { group: 'Services' }),
    num('pins', 'Months Of Insurance Prepaid', '12', { group: 'Prepaids And Escrow' }), num('eins', 'Months of insurance in escrow', '2', { group: 'Prepaids And Escrow' }), num('etax', 'Months of tax in escrow', '3', { group: 'Prepaids And Escrow' }),
    m('seller', 'Seller Credit', '0', { group: 'Credits' }), m('lcredit', 'Lender Credit', '0', { group: 'Credits' }), m('earnest', 'Earnest Money On Deposit', '5000', { group: 'Credits' }),
  ],
  compute: (v) => {
    const price = n(v, 'price');
    const r = calc.computeBuyerClosing({ homePrice: price, downPayment: (price * n(v, 'down')) / 100, annualRatePct: n(v, 'rate'), annualInsurance: n(v, 'ins'), annualPropertyTax: n(v, 'tax'), closingDate: String(v.date || today()),
      originationPct: n(v, 'orig'), pointsPct: n(v, 'points'), lenderFlatFees: n(v, 'lender'), appraisalFee: n(v, 'appraisal'), creditReportFee: n(v, 'credit'), lendersTitlePolicy: n(v, 'lpolicy'), titleServices: n(v, 'tservices'), recordingFees: n(v, 'rec'),
      prepaidInsMonths: n(v, 'pins'), escrowInsMonths: n(v, 'eins'), escrowTaxMonths: n(v, 'etax'), sellerCredit: n(v, 'seller'), lenderCredit: n(v, 'lcredit'), earnestMoney: n(v, 'earnest') });
    return {
      hero: { label: 'Cash To Close', value: usd(r.cashToClose), note: `Loan ${usd0(r.loanAmount)}. Earnest money already counted.` },
      sections: [
        { heading: 'Lender Charges', rows: [['Origination', usd(r.origination)], ['Discount Points', usd(r.points)], ['Lender Fees', usd(r.lenderFlatFees)]] },
        { heading: 'Services And Fees', rows: [['Appraisal', usd(r.appraisalFee)], ['Credit Report', usd(r.creditReportFee)], ['Lender Title Policy', usd(r.lendersTitlePolicy)], ['Title Services', usd(r.titleServices)], ['Recording Fees', usd(r.recordingFees)]] },
        { heading: 'Prepaids And Escrow', rows: [[`Prepaid interest (${r.prepaidInterestDays} days)`, usd(r.prepaidInterest)], ['Prepaid Insurance', usd(r.prepaidInsurance)], ['Escrow: insurance', usd(r.escrowInsurance)], ['Escrow: property tax', usd(r.escrowTax)]] },
        { heading: 'Total', rows: [['Down Payment', usd(price - r.loanAmount)], ['Closing Costs', usd(r.totalClosingCosts)], ['Credits And Earnest Money', neg(r.totalCredits), 'neg'], ['Cash To Close', usd(r.cashToClose), 'strong']] },
      ],
      note: 'Estimate only. The lender Closing Disclosure has the final numbers.',
    };
  },
};

const rentVsBuy: Calculator = {
  id: 'rent-vs-buy', title: 'Rent vs Buy', blurb: 'When buying overtakes renting, year by year.',
  fields: [
    m('price', 'Home Price', '450000', { group: 'Buying' }), p('down', 'Down Payment', '20', { group: 'Buying' }), p('rate', 'Interest Rate', '6.75', { group: 'Buying' }),
    { key: 'term', label: 'Loan Term', type: 'select', def: '30', options: TERMS, group: 'Buying' }, m('closing', 'Closing Costs', '12000', { group: 'Buying' }), m('tax', 'Property Tax Per Year', '8100', { group: 'Buying' }),
    m('ins', 'Home Insurance Per Year', '1575', { group: 'Buying' }), m('hoa', 'HOA Per Month', '0', { group: 'Buying' }), p('appr', 'Yearly Appreciation', '3', { group: 'Buying' }),
    p('maint', 'Yearly Maintenance', '1', { group: 'Buying' }), p('sell', 'Selling Costs', '8', { group: 'Buying' }),
    m('rent', 'Monthly Rent', '2400', { group: 'Renting' }), p('rinc', 'Yearly Rent Increase', '4', { group: 'Renting' }), m('rins', 'Renters Insurance Per Month', '20', { group: 'Renting' }), m('dep', 'Security Deposit', '2400', { group: 'Renting' }),
    num('years', 'Years To Compare', '10', { group: 'Horizon' }),
  ],
  compute: (v) => {
    const price = n(v, 'price');
    const r = calc.computeRentVsBuy({ homePrice: price, downPayment: (price * n(v, 'down')) / 100, annualRatePct: n(v, 'rate'), termYears: n(v, 'term'), closingCosts: n(v, 'closing'), annualPropertyTax: n(v, 'tax'), annualInsurance: n(v, 'ins'), monthlyHoa: n(v, 'hoa'),
      appreciationPct: n(v, 'appr'), maintenancePct: n(v, 'maint'), sellingCostPct: n(v, 'sell'), monthlyRent: n(v, 'rent'), rentIncreasePct: n(v, 'rinc'), rentersInsurance: n(v, 'rins'), securityDeposit: n(v, 'dep'), horizonYears: Math.min(30, Math.max(1, Math.round(n(v, 'years')))) });
    return {
      hero: { label: 'Buying Wins In', value: r.breakevenYear ? `Year ${r.breakevenYear}` : 'Not within the period', note: r.breakevenYear ? 'First year buying costs less than renting' : 'Renting costs less for the whole period' },
      sections: [],
      table: { heading: 'Year By Year', cols: ['Year', 'Buying (Net Cost)', 'Renting (Cost)', 'Home Value', 'Loan Balance', 'Equity If Sold'], rows: r.rows.map((y) => [String(y.year), usd0(y.buyNetCost), usd0(y.rentCost), usd0(y.homeValue), usd0(y.loanBalance), usd0(y.netEquity)]) },
    };
  },
};

const investment: Calculator = {
  id: 'investment', title: 'Investment Property', blurb: 'Cap rate, cash on cash, cash flow and the common rules of thumb.',
  fields: [
    m('price', 'Purchase Price', '300000', { group: 'Purchase' }), p('down', 'Down Payment', '25', { group: 'Purchase' }), m('closing', 'Closing Costs', '6000', { group: 'Purchase' }), m('repairs', 'Initial Repairs', '3500', { group: 'Purchase' }),
    p('rate', 'Interest Rate', '7.25', { group: 'Purchase' }), { key: 'term', label: 'Loan Term', type: 'select', def: '30', options: TERMS, group: 'Purchase' },
    m('rent', 'Monthly Rent', '2400', { group: 'Income' }), m('other', 'Other Monthly Income', '0', { group: 'Income' }), p('vac', 'Vacancy', '5', { group: 'Income' }),
    m('tax', 'Property Tax Per Year', '5400', { group: 'Expenses' }), m('ins', 'Insurance Per Year', '1800', { group: 'Expenses' }), m('hoa', 'HOA Per Month', '0', { group: 'Expenses' }),
    p('pm', 'Property Management', '8', { group: 'Expenses' }), p('maint', 'Maintenance Reserve', '5', { group: 'Expenses' }), p('capex', 'Capital Expense Reserve', '5', { group: 'Expenses' }),
    m('util', 'Utilities Per Month', '0', { group: 'Expenses' }), m('oth', 'Other Costs Per Month', '0', { group: 'Expenses' }),
  ],
  compute: (v) => {
    const price = n(v, 'price');
    const r = calc.computeInvestment({ purchasePrice: price, downPayment: (price * n(v, 'down')) / 100, closingCosts: n(v, 'closing'), initialRepairs: n(v, 'repairs'), annualRatePct: n(v, 'rate'), termYears: n(v, 'term'), monthlyRent: n(v, 'rent'), otherMonthlyIncome: n(v, 'other'), vacancyPct: n(v, 'vac'),
      annualPropertyTax: n(v, 'tax'), annualInsurance: n(v, 'ins'), monthlyHoa: n(v, 'hoa'), propMgmtPct: n(v, 'pm'), maintenancePct: n(v, 'maint'), capExPct: n(v, 'capex'), monthlyUtilities: n(v, 'util'), otherMonthlyOpEx: n(v, 'oth') });
    const yn = (b: boolean) => (b ? 'Met' : 'Not Met');
    return {
      hero: { label: 'Monthly Cash Flow', value: usd(r.monthlyCashFlow), note: `${usd0(r.annualCashFlow)} per year on ${usd0(r.totalCashInvested)} invested` },
      sections: [
        { heading: 'Returns', rows: [['Cap Rate', calc.fmtPct(r.capRate, 2)], ['Cash On Cash', calc.fmtPct(r.cashOnCash, 2)], ['Gross Rent Multiplier', r.grm.toFixed(1)], ['Debt Service Coverage', r.dscr.toFixed(2)], ['Net Operating Income', usd0(r.noi)], ['Annual Debt Service', usd0(r.annualDebtService)]] },
        { heading: 'Income and expenses per year', rows: [['Gross Rent', usd0(r.grossAnnualRent)], ['Vacancy Loss', neg(r.vacancyLoss), 'neg'], ['Effective Gross Income', usd0(r.effectiveGrossIncome)], ['Property Tax', neg(r.propertyTax), 'neg'], ['Insurance', neg(r.insurance), 'neg'], ['HOA', neg(r.hoa), 'neg'], ['Management', neg(r.propMgmt), 'neg'], ['Maintenance', neg(r.maintenance), 'neg'], ['Capital Expenses', neg(r.capEx), 'neg'], ['Utilities', neg(r.utilities), 'neg'], ['Other', neg(r.otherOpEx), 'neg'], ['Total Expenses', neg(r.totalOpEx), 'neg']] },
        { heading: 'Rules Of Thumb', rows: [['1% rule (rent is 1% of price)', yn(r.onePctRuleMet)], ['50% rule (expenses about half of rent)', yn(r.fiftyPctRuleMet)], ['Rent To Price', calc.fmtPct(r.rentToPriceRatio, 2)]] },
      ],
    };
  },
};

const exchange: Calculator = {
  id: 'exchange', title: '1031 Exchange', blurb: 'The 45-day identification and 180-day closing deadlines from the sale closing date.',
  fields: [{ key: 'date', label: 'Sale Closing Date', type: 'date', def: '' }],
  compute: (v) => {
    const t = calc.computeExchangeTimeline(String(v.date || today()));
    return {
      hero: { label: t.statusLabel, value: `${t.daysUntilId} days to identify`, note: `${t.daysUntilExchange} days until the exchange must close` },
      sections: [{ heading: 'Deadlines', rows: [['Start', t.startDate], ['Identify Replacement Property By', t.identificationDeadline, 'strong'], ['Close The Exchange By', t.exchangeDeadline, 'strong']] }],
      table: { heading: 'Milestones', cols: ['Date', 'Milestone', 'Days From Today', 'Type'], rows: t.milestones.map((x) => [x.date, `${x.label}. ${x.description}`, String(x.daysFromToday), x.isDeadline ? 'IRS deadline' : 'Recommended']) },
      note: 'Both periods start the day after closing and are not extended for weekends or holidays. Confirm with a qualified intermediary and tax adviser.',
    };
  },
};

const round = (x: number) => (x < 50_000 ? Math.round(x / 500) * 500 : x < 250_000 ? Math.round(x / 1000) * 1000 : Math.round(x / 5000) * 5000);
const concessions: Calculator = {
  id: 'concessions', title: 'Seller Concession Limits', blurb: 'The most a seller can contribute toward the buyer, by loan program and down payment.',
  fields: [m('price', 'Listing Price', '550000')],
  compute: (v) => {
    const price = n(v, 'price');
    return {
      sections: calc.CONCESSION_DISPLAY.flatMap((g) => g.scenarios.map((s) => ({
        heading: `${g.programLabel}: ${s.occupancyLabel}`,
        rows: [...s.rows.map((r): Row => [`${r.downBand} (${s.coverage})`, r.kind === 'unlimited' ? 'Unlimited' : `${usd0(round(((r.capPct ?? 0) * price) / 100))} (${r.capPct}%)`, 'strong']), ...(s.footnote ? [[s.footnote, ''] as Row] : [])],
      }))),
      note: 'Agency caps. Lender and investor overlays can be stricter. Confirm with the lender before contract.',
    };
  },
};

const title: Calculator = {
  id: 'title', title: 'Texas Title Rates', blurb: 'Owner and lender policy premiums and endorsements from the Texas Department of Insurance rate schedule.',
  fields: [
    { key: 'type', label: 'Transaction', type: 'select', def: 'purchase', options: [['purchase', 'Purchase'], ['refinance', 'Refinance']] },
    m('price', 'Sales Price', '450000', { hint: 'Purchase Only' }), m('loan', 'Loan Amount', '360000', { hint: '0 for a cash purchase' }),
    { key: 'age', label: 'Prior Loan Policy Age', type: 'select', def: 'within-4yr', options: [['within-4yr', 'Within 4 Years'], ['4-to-8yr', '4 To 8 Years'], ['over-8yr', 'Over 8 Years'], ['none', 'None']], hint: 'Refinance Only' },
    { key: 'res', label: 'Residential Property', type: 'check', def: true, group: 'Endorsements' }, { key: 't191', label: 'T-19.1 Restrictions, encroachments, minerals (owner)', type: 'check', def: true, group: 'Endorsements' },
    { key: 't19', label: 'T-19 Restrictions, encroachments, minerals (lender)', type: 'check', def: true, group: 'Endorsements' }, { key: 't30', label: 'T-30 Tax Deletion (Lender)', type: 'check', def: true, group: 'Endorsements' },
    { key: 'survey', label: 'Survey Deletion', type: 'check', def: true, group: 'Endorsements' },
    m('escrow', 'Escrow Fee', '350', { group: 'Other Fees' }), m('rec', 'Recording Fees', '125', { group: 'Other Fees' }),
  ],
  compute: (v) => {
    const r = calc.quoteTitleRates({ transactionType: v.type === 'refinance' ? 'refinance' : 'purchase', salesPrice: n(v, 'price'), loanAmount: n(v, 'loan'), reissueAge: (String(v.age) as calc.ReissueAge), escrowFee: n(v, 'escrow'), recordingFees: n(v, 'rec'), guarantyAssessment: 0,
      endorsements: { residential: Boolean(v.res), t19_1: Boolean(v.t191), t19: Boolean(v.t19), t30: Boolean(v.t30), surveyDeletion: Boolean(v.survey) } });
    return {
      hero: { label: 'Estimated Total', value: usd(r.total) },
      sections: [{ heading: 'Quote', rows: [...r.lines.map((l): Row => [`${l.code ? `${l.code} ` : ''}${l.label}`, usd(l.amount), l.emphasis ? 'strong' : undefined]), ['Total', usd(r.total), 'strong']] }],
      note: 'Estimate from the published rate schedule. The title company quote controls.',
    };
  },
};

export const CALCULATORS: Calculator[] = [closing, netSheet, commission, mortgage, affordability, rentVsBuy, investment, exchange, concessions, title];
export const defaults = (c: Calculator): Values => Object.fromEntries(c.fields.map((f) => [f.key, f.def]));

/** What a client needs to draw a calculator: everything except the math, which runs on the server. */
export type CalculatorDefinition = Omit<Calculator, 'compute'>;
export const calculatorCatalog = (): CalculatorDefinition[] => CALCULATORS.map(({ compute: _compute, ...def }) => def);
/** Runs one calculator. Returns null for an unknown calculator or numbers it cannot work with. */
export function runCalculator(id: string, values: Values): Output | null {
  const c = CALCULATORS.find((x) => x.id === id);
  if (!c) return null;
  try { return c.compute({ ...defaults(c), ...values }); } catch { return null; }
}
