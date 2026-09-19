export type DeadlineCategory = 'money' | 'option' | 'contract-period';

export interface TrecDeadline {
  id: string;
  label: string;
  date: string;
  category: DeadlineCategory;
  timeLabel?: string;
  rule: string;
  rolloverApplied: boolean;
}

export interface TrecDeadlineInputs {
  effectiveDate?: string;
  optionPeriodDays?: string;
  additionalEarnestMoneyDays?: string;
  financingDeadlineDays?: string;
  appraisalDeadlineDays?: string;
  titleCommitmentDays?: string;
  surveyDays?: string;
  titleObjectionDays?: string;
}

function dateFromIso(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoFromDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addCalendarDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function nthWeekday(year: number, month: number, weekday: number, occurrence: number): Date {
  const date = new Date(Date.UTC(year, month, 1));
  const offset = (weekday - date.getUTCDay() + 7) % 7;
  date.setUTCDate(1 + offset + (occurrence - 1) * 7);
  return date;
}

function lastWeekday(year: number, month: number, weekday: number): Date {
  const date = new Date(Date.UTC(year, month + 1, 0));
  const offset = (date.getUTCDay() - weekday + 7) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date;
}

/**
 * TREC 20-19 Paragraph 5A(2) defines "Legal Holiday" as a holiday in
 * Texas Government Code §§662.003(a) and 662.003(b)(4), (6):
 * national holidays plus Juneteenth and the Friday after Thanksgiving.
 */
export function isTrecLegalHoliday(date: Date): boolean {
  const year = date.getUTCFullYear();
  const legalHolidayDates = new Set([
    `${year}-01-01`,
    isoFromDate(nthWeekday(year, 0, 1, 3)), // MLK Day
    isoFromDate(nthWeekday(year, 1, 1, 3)), // Presidents' Day
    isoFromDate(lastWeekday(year, 4, 1)), // Memorial Day
    `${year}-06-19`, // Emancipation Day in Texas / Juneteenth
    `${year}-07-04`,
    isoFromDate(nthWeekday(year, 8, 1, 1)), // Labor Day
    `${year}-11-11`,
    isoFromDate(nthWeekday(year, 10, 4, 4)), // Thanksgiving
    isoFromDate(addCalendarDays(nthWeekday(year, 10, 4, 4), 1)), // Friday after Thanksgiving
    `${year}-12-25`,
  ]);

  return legalHolidayDates.has(isoFromDate(date));
}

function hasPositiveWholeDays(value?: string): value is string {
  return Boolean(value && /^\d+$/.test(value) && Number(value) > 0);
}

function calculateMoneyDeadline(effectiveDate: Date, label: string, days: number): TrecDeadline {
  const originalDate = addCalendarDays(effectiveDate, days);
  let calculatedDate = new Date(originalDate.getTime());

  while (calculatedDate.getUTCDay() === 0 || calculatedDate.getUTCDay() === 6 || isTrecLegalHoliday(calculatedDate)) {
    calculatedDate = addCalendarDays(calculatedDate, 1);
  }

  const rolloverApplied = isoFromDate(originalDate) !== isoFromDate(calculatedDate);
  return {
    id: label.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-'),
    label,
    date: isoFromDate(calculatedDate),
    category: 'money',
    rule: rolloverApplied
      ? `${days} calendar days after the effective date, extended from ${isoFromDate(originalDate)} because the last day is a Saturday, Sunday, or Legal Holiday.`
      : `${days} calendar days after the effective date.`,
    rolloverApplied,
  };
}

function calculateCalendarDeadline(
  effectiveDate: Date,
  id: string,
  label: string,
  days: string,
  category: Exclude<DeadlineCategory, 'money'>,
): TrecDeadline | null {
  if (!hasPositiveWholeDays(days)) return null;
  const period = Number(days);

  return {
    id,
    label,
    date: isoFromDate(addCalendarDays(effectiveDate, period)),
    category,
    timeLabel: category === 'option' ? '5:00 p.m. local property time' : undefined,
    rule:
      category === 'option'
        ? `${period} calendar days after the effective date. The option-period notice deadline is 5:00 p.m. local time where the property is located; no weekend or holiday rollover is applied.`
        : `${period} calendar days after the effective date. This is shown as a calendar-day calculation only; no weekend or holiday rollover is applied.`,
    rolloverApplied: false,
  };
}

export function calculateTrecDeadlines(input: TrecDeadlineInputs): TrecDeadline[] {
  const effectiveDate = input.effectiveDate ? dateFromIso(input.effectiveDate) : null;
  if (!effectiveDate) return [];

  const deadlines: TrecDeadline[] = [
    calculateMoneyDeadline(effectiveDate, 'Earnest money delivery', 3),
    calculateMoneyDeadline(effectiveDate, 'Option fee delivery', 3),
  ];

  const additionalEarnest = calculateCalendarDeadline(
    effectiveDate,
    'additional-earnest-money-delivery',
    'Additional earnest money delivery',
    input.additionalEarnestMoneyDays ?? '',
    'contract-period',
  );
  if (additionalEarnest && hasPositiveWholeDays(input.additionalEarnestMoneyDays)) {
    deadlines.push(calculateMoneyDeadline(effectiveDate, additionalEarnest.label, Number(input.additionalEarnestMoneyDays)));
  }

  const optionPeriod = calculateCalendarDeadline(
    effectiveDate,
    'option-period-ends',
    'Option period ends',
    input.optionPeriodDays ?? '',
    'option',
  );
  if (optionPeriod) deadlines.push(optionPeriod);

  const customPeriods = [
    ['financing-deadline', 'Financing addendum deadline', input.financingDeadlineDays],
    ['appraisal-deadline', 'Appraisal deadline', input.appraisalDeadlineDays],
    ['title-commitment-due', 'Title commitment due', input.titleCommitmentDays],
    ['survey-due', 'Survey due', input.surveyDays],
    ['title-objection-deadline', 'Title objection deadline', input.titleObjectionDays],
  ] as const;

  customPeriods.forEach(([id, label, days]) => {
    const deadline = calculateCalendarDeadline(effectiveDate, id, label, days ?? '', 'contract-period');
    if (deadline) deadlines.push(deadline);
  });

  return deadlines;
}
