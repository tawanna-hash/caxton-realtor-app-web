import type { TrecDeadline } from './trec-deadlines';

/** A workflow aid only; it does not determine contractual or legal requirements. */
export const TREC_WORKFLOW_STAGES = [
  'parties-property',
  'price-financing',
  'deposits-option',
  'title-closing',
  'terms-addenda',
  'review',
] as const;

export type TrecWorkflowStage = (typeof TREC_WORKFLOW_STAGES)[number];

export const TREC_WORKFLOW_STAGE_LABELS: Record<TrecWorkflowStage, string> = {
  'parties-property': 'Parties & property',
  'price-financing': 'Price & financing',
  'deposits-option': 'Deposits & option',
  'title-closing': 'Title, condition & closing',
  'terms-addenda': 'Terms, notices & addenda',
  review: 'Operational review',
};

/** Operational transaction stage. This is separate from the worksheet step. */
export const TREC_DEAL_WORKFLOW_STATUSES = [
  'intake',
  'contract_review',
  'active_transaction',
  'closing',
  'completed',
  'cancelled',
] as const;

export type TrecDealWorkflowStatus = (typeof TREC_DEAL_WORKFLOW_STATUSES)[number];

export const TREC_DEAL_WORKFLOW_STATUS_LABELS: Record<TrecDealWorkflowStatus, string> = {
  intake: 'Intake',
  contract_review: 'Contract review',
  active_transaction: 'Active transaction',
  closing: 'Closing coordination',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const TREC_TASK_PRIORITIES = ['low', 'normal', 'high', 'critical'] as const;
export type TrecTaskPriority = (typeof TREC_TASK_PRIORITIES)[number];

export const TREC_TASK_STATUSES = ['todo', 'in_progress', 'done', 'skipped'] as const;
export type TrecTaskStatus = (typeof TREC_TASK_STATUSES)[number];

export interface TrecDocumentChecklistItem {
  id: string;
  label: string;
  stage: TrecWorkflowStage;
  requiredForOperationalReview: boolean;
}

export interface TrecDocumentChecklistTemplate {
  id: string;
  label: string;
  items: readonly TrecDocumentChecklistItem[];
}

/** Suggested document-tracking templates, not a legal or compliance checklist. */
export const TREC_DOCUMENT_CHECKLIST_TEMPLATES: readonly TrecDocumentChecklistTemplate[] = [
  {
    id: 'contract-package',
    label: 'Contract package tracking',
    items: [
      { id: 'contract', label: 'Executed contract copy', stage: 'parties-property', requiredForOperationalReview: true },
      { id: 'addenda', label: 'Selected addenda', stage: 'terms-addenda', requiredForOperationalReview: false },
      { id: 'notices', label: 'Notices and disclosures to track', stage: 'terms-addenda', requiredForOperationalReview: false },
    ],
  },
  {
    id: 'transaction-follow-up',
    label: 'Transaction follow-up tracking',
    items: [
      { id: 'deposit-receipt', label: 'Deposit delivery confirmation', stage: 'deposits-option', requiredForOperationalReview: false },
      { id: 'title-materials', label: 'Title and survey materials', stage: 'title-closing', requiredForOperationalReview: false },
      { id: 'closing-confirmation', label: 'Closing coordination confirmation', stage: 'title-closing', requiredForOperationalReview: false },
    ],
  },
] as const;

export const TREC_REMINDER_PRESET_OFFSETS = [
  { id: '7d', label: '7 days before', daysBefore: 7 },
  { id: '3d', label: '3 days before', daysBefore: 3 },
  { id: '1d', label: '1 day before', daysBefore: 1 },
  { id: 'due', label: 'On the due date', daysBefore: 0 },
] as const;

export type TrecReminderPresetOffset = (typeof TREC_REMINDER_PRESET_OFFSETS)[number];
export type TrecReminderPresetId = TrecReminderPresetOffset['id'];

export interface TrecWorksheetFieldDefinition {
  key: string;
  label: string;
  stage: TrecWorkflowStage;
  required: true;
}

/** Fields needed to complete this module's operational review. */
export const TREC_REQUIRED_WORKSHEET_FIELDS: readonly TrecWorksheetFieldDefinition[] = [
  { key: 'buyerNames', label: 'Buyer name(s)', stage: 'parties-property', required: true },
  { key: 'sellerNames', label: 'Seller name(s)', stage: 'parties-property', required: true },
  { key: 'propertyAddress', label: 'Property address', stage: 'parties-property', required: true },
  { key: 'effectiveDate', label: 'Effective date', stage: 'review', required: true },
  { key: 'closingDate', label: 'Target closing date', stage: 'title-closing', required: true },
  { key: 'titleCompany', label: 'Earnest money holder / title company', stage: 'deposits-option', required: true },
  { key: 'earnestMoney', label: 'Earnest money', stage: 'deposits-option', required: true },
  { key: 'optionDays', label: 'Option period days', stage: 'deposits-option', required: true },
] as const;

export interface TrecWorkflowReminder {
  deadlineKey: string;
  reminderDate: string;
  isComplete: boolean;
}

export const TREC_VALIDATION_ALERT_CODES = [
  'missing-required-field',
  'invalid-date',
  'closing-before-effective',
  'delivery-after-deadline',
  'deadline-after-closing',
  'orphaned-reminder',
  'reminder-after-deadline',
] as const;

export type TrecValidationAlertCode = (typeof TREC_VALIDATION_ALERT_CODES)[number];
export type TrecValidationSeverity = 'attention' | 'review';

export interface TrecValidationAlert {
  code: TrecValidationAlertCode;
  severity: TrecValidationSeverity;
  message: string;
  field?: string;
  deadlineKey?: string;
}

export const TREC_OPERATIONAL_REVIEW_DISCLAIMER = 'Operational review only; not legal or compliance advice.';

const DATE_FIELDS = [
  ['effectiveDate', 'Effective date'],
  ['closingDate', 'Target closing date'],
  ['earnestMoneyDeliveredDate', 'Earnest money delivered date'],
  ['optionFeeDeliveredDate', 'Option fee delivered date'],
] as const;

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
    ? parsed
    : null;
}

function alert(
  code: TrecValidationAlertCode,
  severity: TrecValidationSeverity,
  message: string,
  details: Pick<TrecValidationAlert, 'field' | 'deadlineKey'> = {},
): TrecValidationAlert {
  return { code, severity, message: `${message} ${TREC_OPERATIONAL_REVIEW_DISCLAIMER}`, ...details };
}

/**
 * Returns operational prompts based on supplied worksheet values and computed dates.
 * It does not interpret a contract or provide legal or compliance advice.
 */
export function buildTrecValidation(
  worksheet: Record<string, string>,
  existingDeadlines: readonly TrecDeadline[],
  reminders: readonly TrecWorkflowReminder[] = [],
): TrecValidationAlert[] {
  const alerts: TrecValidationAlert[] = [];

  for (const field of TREC_REQUIRED_WORKSHEET_FIELDS) {
    if (!worksheet[field.key]?.trim()) {
      alerts.push(alert('missing-required-field', 'attention', `Enter ${field.label.toLowerCase()} to complete the operational review.`, { field: field.key }));
    }
  }

  const parsedDates = new Map<string, Date>();
  for (const [field, label] of DATE_FIELDS) {
    const value = worksheet[field]?.trim();
    if (!value) continue;
    const date = parseIsoDate(value);
    if (!date) {
      alerts.push(alert('invalid-date', 'attention', `Use a valid YYYY-MM-DD date for ${label.toLowerCase()}.`, { field }));
    } else {
      parsedDates.set(field, date);
    }
  }

  const effectiveDate = parsedDates.get('effectiveDate');
  const closingDate = parsedDates.get('closingDate');
  if (effectiveDate && closingDate && closingDate < effectiveDate) {
    alerts.push(alert('closing-before-effective', 'attention', 'The target closing date is before the effective date; confirm the entered dates.', { field: 'closingDate' }));
  }

  const deadlinesById = new Map(existingDeadlines.map((deadline) => [deadline.id, deadline]));
  for (const deadline of existingDeadlines) {
    if (!parseIsoDate(deadline.date)) {
      alerts.push(alert('invalid-date', 'attention', `The computed date for ${deadline.label.toLowerCase()} is not a valid YYYY-MM-DD date; recalculate or review the source data.`, { deadlineKey: deadline.id }));
    }
  }

  const deliveryChecks = [
    ['earnestMoneyDeliveredDate', 'earnest-money-delivery', 'Earnest money delivery'],
    ['optionFeeDeliveredDate', 'option-fee-delivery', 'Option fee delivery'],
  ] as const;

  for (const [field, deadlineKey, label] of deliveryChecks) {
    const deliveredDate = parsedDates.get(field);
    const deadline = deadlinesById.get(deadlineKey);
    const deadlineDate = deadline && parseIsoDate(deadline.date);
    if (deliveredDate && deadlineDate && deliveredDate > deadlineDate) {
      alerts.push(alert('delivery-after-deadline', 'review', `${label} is recorded after the computed deadline (${deadline.date}); verify the record.`, { field, deadlineKey }));
    }
  }

  if (closingDate) {
    for (const deadline of existingDeadlines) {
      const deadlineDate = parseIsoDate(deadline.date);
      if (deadlineDate && deadlineDate > closingDate) {
        alerts.push(alert('deadline-after-closing', 'review', `${deadline.label} (${deadline.date}) falls after the target closing date; review the timeline.`, { deadlineKey: deadline.id }));
      }
    }
  }

  for (const reminder of reminders) {
    const deadline = deadlinesById.get(reminder.deadlineKey);
    if (!deadline) {
      alerts.push(alert('orphaned-reminder', 'review', `A reminder references “${reminder.deadlineKey}”, which is not in the current computed deadline list; update or remove it.`, { deadlineKey: reminder.deadlineKey }));
      continue;
    }

    const reminderDate = parseIsoDate(reminder.reminderDate);
    if (!reminderDate) {
      alerts.push(alert('invalid-date', 'attention', `Use a valid YYYY-MM-DD reminder date for ${deadline.label.toLowerCase()}.`, { deadlineKey: reminder.deadlineKey }));
      continue;
    }

    const deadlineDate = parseIsoDate(deadline.date);
    if (deadlineDate && reminderDate > deadlineDate) {
      alerts.push(alert('reminder-after-deadline', 'review', `The reminder for ${deadline.label} is scheduled after its computed deadline (${deadline.date}); reschedule it if needed.`, { deadlineKey: reminder.deadlineKey }));
    }
  }

  return alerts;
}
