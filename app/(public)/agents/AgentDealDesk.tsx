'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Building2,
  Camera,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Download,
  FileText,
  FileUp,
  History,
  ListTodo,
  LoaderCircle,
  Lock,
  Mail,
  Plus,
  Save,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import PushOptInButton from '@/components/PushOptInButton';
import TrecPdfPagePreview from './TrecPdfPagePreview';
import { trackEvent } from '@/app/posthog-provider';
import {
  agentCommandCenterWorkspaceSchema,
  agentDealSchema,
  defaultAgentContractDetails,
  defaultAgentNotificationPreferences,
  type AgentContractDetails,
  type AgentCommandCenterWorkspace,
  type AgentDeal,
  type AgentDeadlineNotificationOffset,
  type AgentNotificationPreferences,
  type AgentReminder,
  type AgentTask,
  type AgentDocument,
  type AgentActivity,
} from '@/lib/agent-command-center-workspace';
import { calculateTrecDeadlines, type TrecDeadline } from '@/lib/trec-deadlines';
import type { TrecFormVersion } from '@/lib/trec-form-versions';
import {
  buildTrecValidation,
  TREC_DEAL_WORKFLOW_STATUS_LABELS,
  TREC_TASK_PRIORITIES,
  TREC_TASK_STATUSES,
  type TrecTaskPriority,
  type TrecTaskStatus,
} from '@/lib/trec-workflow';

type RadarItem = {
  id: string;
  dealId: string;
  dealTitle: string;
  label: string;
  date: string;
  kind: 'deadline' | 'reminder' | 'task';
  overdue: boolean;
};

type ReadinessDocumentTemplate = {
  id: string;
  label: string;
  description: string;
};

type ReadinessDocumentGroup = {
  id: string;
  label: string;
  items: readonly ReadinessDocumentTemplate[];
};

const DOCUMENT_GROUPS: readonly ReadinessDocumentGroup[] = [
  {
    id: 'buyer',
    label: 'Buyer Documentation',
    items: [
      {
        id: 'buyer-iabs',
        label: 'Information About Brokerage Services (IABS)',
        description: 'Mandatory TREC informational form outlining representation pathways.',
      },
      {
        id: 'buyer-representation-agreement',
        label: 'Buyer Representation Agreement',
        description: 'Formal contract between the buyer and their brokerage.',
      },
      {
        id: 'buyer-pre-approval-letter',
        label: 'Pre-Approval Letter',
        description: 'Initial verification from a lender showing purchasing power.',
      },
      {
        id: 'delivery-confirmation',
        label: 'Earnest Money & Option Fee Receipts',
        description: 'Title and escrow validation of contract security deposits.',
      },
      {
        id: 'buyer-property-inspection-report',
        label: 'Property Inspection Report',
        description: 'Visual inspection of structure and systems by a licensed Texas inspector.',
      },
    ],
  },
  {
    id: 'seller',
    label: 'Seller Documentation',
    items: [
      {
        id: 'executed-contract',
        label: 'TREC One to Four Family Residential Contract',
        description: 'The standard promulgated purchase agreement.',
      },
      {
        id: 'seller-disclosure',
        label: "Seller's Disclosure Notice",
        description: 'Legally required property condition disclosure.',
      },
      {
        id: 'survey',
        label: 'Property Survey & T-47 Residential Real Property Affidavit',
        description: 'Document showing property boundaries along with a notarized declaration of any changes.',
      },
      {
        id: 'seller-hoa-subdivision-information',
        label: 'HOA Subdivision Information & Addendum',
        description: 'Disclosure of rules, fees, and resale certificates for planned communities.',
      },
      {
        id: 'seller-general-warranty-deed',
        label: 'General Warranty Deed',
        description: 'Legal instrument executed at closing to transfer title securely.',
      },
    ],
  },
  {
    id: 'lender',
    label: 'Lender Documentation',
    items: [
      {
        id: 'lender-loan-estimate',
        label: 'Loan Estimate (LE)',
        description: 'Three-page form outlining estimated loan terms, features, and closing costs.',
      },
      {
        id: 'lender-closing-disclosure',
        label: 'Closing Disclosure (CD)',
        description: 'Final itemized breakdown of closing fees delivered at least three days before closing.',
      },
      {
        id: 'lender-deed-of-trust',
        label: 'Deed of Trust',
        description: 'The security instrument securing the mortgage loan against the real estate.',
      },
      {
        id: 'lender-promissory-note',
        label: 'Promissory Note',
        description: "The borrower's binding legal promise to repay the loan.",
      },
    ],
  },
] as const;

const DOCUMENT_TEMPLATES = DOCUMENT_GROUPS.flatMap((group) => group.items);
const DOCUMENT_TEMPLATE_IDS = new Set<string>(DOCUMENT_TEMPLATES.map((item) => item.id));

function mergeReadinessDocuments(deal: AgentDeal): AgentDeal {
  const existingDocuments = new Map(deal.documents.map((document) => [document.id, document]));
  const requestedAt = deal.createdAt || new Date().toISOString();
  const readinessDocuments: AgentDocument[] = DOCUMENT_TEMPLATES.map((template) => {
    const existing = existingDocuments.get(template.id);
    return existing
      ? { ...existing, label: template.label }
      : {
          id: template.id,
          label: template.label,
          status: 'requested',
          complete: false,
          requestedAt,
          updatedAt: requestedAt,
        };
  });
  const additionalDocuments = deal.documents.filter((document) => !DOCUMENT_TEMPLATE_IDS.has(document.id));
  return { ...deal, documents: [...readinessDocuments, ...additionalDocuments] };
}

function ReadinessChecklist({
  headingTag = 'h3',
  documents,
  documentName,
  setDocumentName,
  addDocument,
  updateDocument,
  reviewAlerts,
}: {
  headingTag?: 'h2' | 'h3';
  documents: AgentDocument[];
  documentName: string;
  setDocumentName: (value: string) => void;
  addDocument: () => void;
  updateDocument: (documentId: string, status: AgentDocument['status']) => void;
  reviewAlerts: string[];
}) {
  const Heading = headingTag;
  const additionalDocuments = documents.filter((document) => !DOCUMENT_TEMPLATE_IDS.has(document.id));

  const renderDocument = (document: AgentDocument, description?: string) => (
    <div key={document.id} className="grid min-w-0 gap-3 border-t border-slate-200 px-4 py-4 first:border-t-0 sm:grid-cols-[auto_minmax(0,1fr)_140px] sm:items-center">
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${document.complete ? 'border-[#301D5D] bg-[#301D5D] text-white' : 'border-slate-400 bg-white text-transparent'}`}>
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className={`text-sm font-semibold leading-5 ${document.complete ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{document.label}</p>
        {description ? <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p> : null}
      </div>
      <select
        value={document.status}
        onChange={(event) => updateDocument(document.id, event.target.value as AgentDocument['status'])}
        aria-label={`Status for ${document.label}`}
        className="min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-[#301D5D] focus:ring-2 focus:ring-[#301D5D]/15"
      >
        <option value="requested">Requested</option>
        <option value="received">Received</option>
        <option value="reviewed">Reviewed</option>
        <option value="not_needed">Not needed</option>
      </select>
    </div>
  );

  return (
    <div className="border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <FileText className="rnn-heading-icon text-[#7059A8]" aria-hidden="true" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Readiness check</p>
          <Heading className="mt-1 text-xl font-semibold text-slate-950">Transaction readiness checklist</Heading>
        </div>
      </div>

      <div className="mt-5 space-y-5">
        {DOCUMENT_GROUPS.map((group) => {
          const groupDocuments = group.items
            .map((item) => ({ item, document: documents.find((document) => document.id === item.id) }))
            .filter((entry): entry is { item: (typeof group.items)[number]; document: AgentDocument } => Boolean(entry.document));
          const completeCount = groupDocuments.filter(({ document }) => document.complete || document.status === 'not_needed').length;

          return (
            <section key={group.id} className="overflow-hidden rounded-md border border-slate-200">
              <div className="flex items-center justify-between gap-3 bg-[#F7F5F1] px-4 py-3">
                <h4 className="text-sm font-bold text-slate-950">{group.label}</h4>
                <span className="shrink-0 rounded-md bg-white px-2.5 py-1 text-xs font-bold text-[#301D5D]">{completeCount} of {groupDocuments.length}</span>
              </div>
              <div>{groupDocuments.map(({ item, document }) => renderDocument(document, item.description))}</div>
            </section>
          );
        })}

        {additionalDocuments.length ? (
          <section className="overflow-hidden rounded-md border border-slate-200">
            <div className="bg-[#F7F5F1] px-4 py-3">
              <h4 className="text-sm font-bold text-slate-950">Additional Documentation</h4>
            </div>
            <div>{additionalDocuments.map((document) => renderDocument(document))}</div>
          </section>
        ) : null}
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input
          value={documentName}
          onChange={(event) => setDocumentName(event.target.value)}
          className="min-h-[44px] min-w-0 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-[#301D5D] focus:ring-2 focus:ring-[#301D5D]/15"
          placeholder="Custom document request"
        />
        <button
          type="button"
          onClick={addDocument}
          disabled={!documentName.trim()}
          className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-[#7059A8] bg-white px-5 text-sm font-bold text-[#301D5D] transition hover:bg-[#F3EFFA] disabled:opacity-40"
        >
          Request
        </button>
      </div>

      <div className="mt-5 border-t border-slate-200 pt-5">
        <p className="text-sm font-semibold text-slate-800">Operational review alerts</p>
        {reviewAlerts.length ? (
          <ul className="mt-3 space-y-2">
            {reviewAlerts.slice(0, 4).map((alert) => (
              <li key={alert} className="flex gap-2 text-sm leading-5 text-slate-600">
                <AlertTriangle className="rnn-inline-icon text-[#B6402C]" aria-hidden="true" />
                {alert}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 flex items-center gap-2 text-sm text-[#38643A]">
            <CheckCircle2 className="rnn-inline-icon" aria-hidden="true" />
            No worksheet alerts for your active transactions.
          </p>
        )}
      </div>
    </div>
  );
}

const CONTRACT_DETAIL_FIELDS: ReadonlyArray<{
  key: keyof AgentContractDetails;
  label: string;
  multiline?: boolean;
}> = [
  { key: 'county', label: 'County' },
  { key: 'legalDescription', label: 'Legal description', multiline: true },
  { key: 'improvementsAndAccessories', label: 'Improvements and accessories', multiline: true },
  { key: 'exclusions', label: 'Exclusions', multiline: true },
  { key: 'cashPortion', label: 'Cash portion' },
  { key: 'loanAmount', label: 'Loan amount' },
  { key: 'salesPrice', label: 'Sales price' },
  { key: 'financingType', label: 'Financing type' },
  { key: 'financingNotes', label: 'Financing notes', multiline: true },
  { key: 'earnestMoney', label: 'Earnest money' },
  { key: 'titleCompany', label: 'Title company / escrow holder' },
  { key: 'optionFee', label: 'Option fee' },
  { key: 'additionalEarnestMoney', label: 'Additional earnest money' },
  { key: 'titlePolicyPayer', label: 'Title policy payer' },
  { key: 'surveyPlan', label: 'Survey plan', multiline: true },
  { key: 'titleAndSurveyNotes', label: 'Title and survey notes', multiline: true },
  { key: 'conditionAndRepairNotes', label: 'Condition and repair notes', multiline: true },
  { key: 'possessionPlan', label: 'Possession plan', multiline: true },
  { key: 'specialProvisionsNotes', label: 'Special provisions notes', multiline: true },
  { key: 'settlementNotes', label: 'Settlement and expense notes', multiline: true },
  { key: 'notices', label: 'Notices', multiline: true },
];

const CALCULATED_TIMELINE_FIELDS: ReadonlyArray<{
  key: 'optionPeriodDays';
  deadlineId: string;
  label: string;
  rule: string;
}> = [
  {
    key: 'optionPeriodDays',
    deadlineId: 'option-period-ends',
    label: 'Option / Inspection Period',
    rule: 'Negotiated period after the effective date; notice is due by 5:00 p.m. local property time on the final day.',
  },
];

function getId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function chicagoToday(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function sentenceCaseKey(value: string): string {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function buyerLastNames(value: string): string {
  return Array.from(new Set(
    value
      .split(/\s+(?:and|&)\s+|[,;]/i)
      .map((name) => name.trim().split(/\s+/).at(-1) ?? '')
      .filter(Boolean),
  )).join(' / ');
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function newDeal(trecFormVersionId: string): AgentDeal {
  const now = new Date().toISOString();
  return {
    id: getId('deal'),
    title: 'New transaction',
    propertyAddress: '',
    buyerNames: '',
    sellerNames: '',
    effectiveDate: '',
    optionPeriodDays: '',
    additionalEarnestMoneyDays: '',
    financingDeadlineDays: '',
    appraisalDeadlineDays: '',
    titleCommitmentDays: '',
    surveyDays: '',
    titleObjectionDays: '',
    earnestMoneyDeliveredDate: '',
    optionFeeDeliveredDate: '',
    closingDate: '',
    status: 'prep',
    owner: '',
    workflowStatus: 'intake',
    worksheetStep: 0,
    trecFormVersionId,
    closeoutOutcome: '',
    closeoutDate: '',
    closeoutNote: '',
    contractDetails: defaultAgentContractDetails(),
    formFields: {},
    addenda: {},
    selectedFormFamilies: {},
    reminders: [],
    tasks: [],
    documents: DOCUMENT_TEMPLATES.map(({ id, label }) => ({ id, label, status: 'requested' as const, complete: false, requestedAt: now, updatedAt: now })),
    activity: [{ id: getId('activity'), message: 'Transaction workspace created', createdAt: now }],
    createdAt: now,
    updatedAt: now,
  };
}

function isStoredDeal(value: unknown): value is AgentDeal {
  return agentDealSchema.safeParse(value).success;
}

function dealDeadlines(deal: AgentDeal): TrecDeadline[] {
  return calculateTrecDeadlines({
    effectiveDate: deal.effectiveDate,
    optionPeriodDays: deal.optionPeriodDays,
    additionalEarnestMoneyDays: deal.additionalEarnestMoneyDays,
    financingDeadlineDays: deal.financingDeadlineDays,
    appraisalDeadlineDays: deal.appraisalDeadlineDays,
    titleCommitmentDays: deal.titleCommitmentDays,
    surveyDays: deal.surveyDays,
    titleObjectionDays: deal.titleObjectionDays,
  });
}

type CalendarEvent = {
  id: string;
  date: string;
  summary: string;
  description: string;
};

type ExtractionState = 'idle' | 'extracting' | 'ready' | 'error';
type ExtractionDraft = {
  title?: string;
  worksheet: Record<string, string>;
  formFields: Record<string, string>;
  addenda: Record<string, boolean>;
  warnings: string[];
};

function escapeIcs(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replace(/\r?\n/g, '\\n');
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function worksheetValues(deal: AgentDeal): Record<string, string> {
  return {
    buyerNames: deal.buyerNames,
    sellerNames: deal.sellerNames,
    propertyAddress: deal.propertyAddress,
    effectiveDate: deal.effectiveDate,
    optionDays: deal.optionPeriodDays,
    additionalEarnestMoneyDays: deal.additionalEarnestMoneyDays,
    financingDeadlineDays: deal.financingDeadlineDays,
    appraisalDeadlineDays: deal.appraisalDeadlineDays,
    titleCommitmentDays: deal.titleCommitmentDays,
    surveyDays: deal.surveyDays,
    titleObjectionDays: deal.titleObjectionDays,
    earnestMoneyDeliveredDate: deal.earnestMoneyDeliveredDate,
    optionFeeDeliveredDate: deal.optionFeeDeliveredDate,
    closingDate: deal.closingDate,
    ...deal.contractDetails,
    ...deal.formFields,
  };
}

function downloadTextSummary(deal: AgentDeal): void {
  const values = worksheetValues(deal);
  const lines = [
    'TREC 1-4 Operational Deal Summary',
    'Operational workspace only; verify all terms against the signed contract and broker process.',
    '',
    `Transaction: ${deal.title || 'Not entered'}`,
    `Owner: ${deal.owner || 'Not assigned'}`,
    `Workflow stage: ${TREC_DEAL_WORKFLOW_STATUS_LABELS[deal.workflowStatus]}`,
    `Buyer(s): ${deal.buyerNames || 'Not entered'}`,
    `Seller(s): ${deal.sellerNames || 'Not entered'}`,
    `Property: ${deal.propertyAddress || 'Not entered'}`,
    `Effective date: ${deal.effectiveDate || 'Not entered'}`,
    `Closing date: ${deal.closingDate || 'Not entered'}`,
    `Earnest money: ${values.earnestMoney || 'Not entered'}`,
    `Earnest money delivered: ${deal.earnestMoneyDeliveredDate || 'Not recorded'}`,
    `Option fee: ${values.optionFee || 'Not entered'}`,
    `Option fee delivered: ${deal.optionFeeDeliveredDate || 'Not recorded'}`,
    `Option period: ${deal.optionPeriodDays || 'Not entered'} days`,
    `Title objection period: ${deal.titleObjectionDays || 'Not entered'} days`,
    '',
    'Calculated timing:',
    ...dealDeadlines(deal).map((deadline) => `- ${deadline.label}: ${deadline.date} (${deadline.rule})`),
    '',
    'Open tasks:',
    ...(deal.tasks.filter((task) => task.status !== 'done' && task.status !== 'skipped').map((task) => `- [${task.priority}] ${task.title}${task.dueDate ? ` — due ${task.dueDate}` : ''}`) || []),
    '',
    'Document requests:',
    ...deal.documents.map((document) => `- ${document.label}: ${document.status.replace('_', ' ')}`),
    '',
    `Closeout outcome: ${deal.closeoutOutcome || 'Not set'}`,
    `Closeout date: ${deal.closeoutDate || 'Not set'}`,
    `Closeout note: ${deal.closeoutNote || 'Not set'}`,
  ];
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'trec-1-4-operational-summary.txt';
  link.click();
  URL.revokeObjectURL(url);
}

function downloadBackupRecord(deal: AgentDeal): void {
  const record = {
    exportedAt: new Date().toISOString(),
    recordType: 'TREC transaction backup record',
    retentionNote: 'Retain for at least four years from the date of closing, contract termination, or the date of a deposit/withdrawal, per TREC Rules 535.2(h) and 535.146.',
    deal,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  const safeName = (deal.propertyAddress || deal.title || 'transaction').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'transaction';
  link.download = `${safeName}-backup-record-${deal.closeoutDate || 'undated'}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function calendarEventsForDeal(deal: AgentDeal): CalendarEvent[] {
  const transaction = deal.propertyAddress || deal.title;
  const description = `Agent Command Center deadline for ${transaction}. Verify against the signed contract and your broker's process.`;
  const deadlineEvents = dealDeadlines(deal).map((deadline) => ({
    id: `deadline-${deadline.id}`,
    date: deadline.date,
    summary: `${deadline.label}: ${transaction}`,
    description,
  }));
  const closingEvent = deal.closingDate ? [{
    id: 'closing-date',
    date: deal.closingDate,
    summary: `Closing date: ${transaction}`,
    description,
  }] : [];
  const reminderEvents = deal.reminders
    .filter((reminder) => !reminder.complete && isIsoDate(reminder.reminderDate))
    .map((reminder) => ({
      id: `reminder-${reminder.id}`,
      date: reminder.reminderDate,
      summary: `Reminder: ${reminder.label} — ${transaction}`,
      description,
    }));
  const taskEvents = deal.tasks
    .filter((task) => !task.complete && isIsoDate(task.dueDate))
    .map((task) => ({
      id: `task-${task.id}`,
      date: task.dueDate,
      summary: `Task: ${task.title} — ${transaction}`,
      description,
    }));
  return [...deadlineEvents, ...closingEvent, ...reminderEvents, ...taskEvents]
    .filter((event) => isIsoDate(event.date));
}

function downloadCalendar(events: CalendarEvent[], filename: string): void {
  if (!events.length) return;
  const stamp = new Date().toISOString().replaceAll(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const content = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Realty News Now//Agent Command Center//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events.flatMap((event) => [
      'BEGIN:VEVENT',
      `UID:${escapeIcs(event.id)}-${Date.now()}@realtynewsnow.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${event.date.replaceAll('-', '')}`,
      `DTEND;VALUE=DATE:${addDays(event.date, 1).replaceAll('-', '')}`,
      `SUMMARY:${escapeIcs(event.summary)}`,
      `DESCRIPTION:${escapeIcs(event.description)}`,
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
    '',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

type SyncState = 'loading' | 'ready' | 'saving' | 'conflict' | 'error';

export default function AgentDealDesk({
  workspaceKey,
  realtorId,
  initialWorkspace,
  initialWorkspaceVersion,
  trecFormVersion,
  trecFormVersions,
  panelsOnly = false,
}: {
  workspaceKey: string;
  realtorId: string;
  initialWorkspace: AgentCommandCenterWorkspace | null;
  initialWorkspaceVersion: number | null;
  trecFormVersion: TrecFormVersion;
  trecFormVersions: TrecFormVersion[];
  panelsOnly?: boolean;
}) {
  const [deals, setDeals] = useState<AgentDeal[]>([]);
  const [notificationPreferences, setNotificationPreferences] = useState<AgentNotificationPreferences>(
    defaultAgentNotificationPreferences,
  );
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>('loading');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskPriority, setTaskPriority] = useState<TrecTaskPriority>('normal');
  const [reminderDeadlineId, setReminderDeadlineId] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [reminderNote, setReminderNote] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const [extractionState, setExtractionState] = useState<ExtractionState>('idle');
  const [extractionDraft, setExtractionDraft] = useState<ExtractionDraft | null>(null);
  const [extractionWarnings, setExtractionWarnings] = useState<string[]>([]);
  const [extractionError, setExtractionError] = useState('');
  const [isContractDropActive, setIsContractDropActive] = useState(false);
  const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [contractPreviewUrl, setContractPreviewUrl] = useState('');
  const [activeTrecFormFamily, setActiveTrecFormFamily] = useState('20');
  const [activeTrecPage, setActiveTrecPage] = useState(1);
  const [formsStatusDealId, setFormsStatusDealId] = useState<string | null>(null);
  const [workspacePage, setWorkspacePage] = useState<1 | 2>(2);
  const versionRef = useRef<number | null>(initialWorkspaceVersion);
  const syncTimerRef = useRef<number | null>(null);
  const saveInFlightRef = useRef(false);
  const queuedWorkspaceRef = useRef<AgentCommandCenterWorkspace | null>(null);
  const contractUploadInputRef = useRef<HTMLInputElement | null>(null);
  const contractCameraInputRef = useRef<HTMLInputElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const contractPreviewUrlRef = useRef('');

  const clearContractPreview = useCallback(() => {
    if (contractPreviewUrlRef.current) URL.revokeObjectURL(contractPreviewUrlRef.current);
    contractPreviewUrlRef.current = '';
    setContractPreviewUrl('');
  }, []);

  const saveToCloud = useCallback(async function saveToCloud(workspace: AgentCommandCenterWorkspace) {
    if (saveInFlightRef.current) {
      queuedWorkspaceRef.current = workspace;
      return;
    }

    saveInFlightRef.current = true;
    let saved = false;
    setSyncState('saving');
    try {
      const response = await fetch('/api/agent-command-center/workspace', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspace, expectedVersion: versionRef.current }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (response.status === 401) {
        window.location.assign('/login?next=%2Fagents');
        return;
      }

      if (response.status === 409) {
        setSyncState('conflict');
        return;
      }

      if (!response.ok || !payload || typeof payload !== 'object') {
        setSyncState('error');
        return;
      }

      const record = payload as { workspace?: unknown; version?: unknown };
      if (!agentCommandCenterWorkspaceSchema.safeParse(record.workspace).success || typeof record.version !== 'number') {
        setSyncState('error');
        return;
      }

      versionRef.current = record.version;
      window.localStorage.removeItem(workspaceKey);
      setSyncState('ready');
      saved = true;
    } catch {
      setSyncState('error');
    } finally {
      saveInFlightRef.current = false;
      const queuedWorkspace = queuedWorkspaceRef.current;
      queuedWorkspaceRef.current = null;
      if (saved && queuedWorkspace) {
        window.setTimeout(() => {
          void saveToCloud(queuedWorkspace);
        }, 0);
      }
    }
  }, [workspaceKey]);

  const queueCloudSave = useCallback((workspace: AgentCommandCenterWorkspace) => {
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => {
      void saveToCloud(workspace);
    }, 650);
  }, [saveToCloud]);

  useEffect(() => {
    let cancelled = false;
    let legacyDeals: AgentDeal[] = [];

    try {
      const stored = window.localStorage.getItem(workspaceKey);
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      legacyDeals = Array.isArray(parsed) ? parsed.filter(isStoredDeal) : [];
    } catch {
      legacyDeals = [];
    }
    const cloudWorkspace = initialWorkspace ?? null;
    const startingWorkspace = cloudWorkspace ?? {
      deals: legacyDeals,
      notificationPreferences: defaultAgentNotificationPreferences(),
    };
    const migratedDeals = startingWorkspace.deals.map(mergeReadinessDocuments);
    const readinessChecklistChanged = JSON.stringify(migratedDeals) !== JSON.stringify(startingWorkspace.deals);
    const hydratedWorkspace = { ...startingWorkspace, deals: migratedDeals };

    queueMicrotask(() => {
      if (cancelled) return;
      versionRef.current = initialWorkspaceVersion;
      setDeals(hydratedWorkspace.deals);
      setNotificationPreferences(hydratedWorkspace.notificationPreferences);
      setActiveDealId(hydratedWorkspace.deals[0]?.id ?? null);
      setReady(true);
      setSyncState(cloudWorkspace ? 'ready' : 'loading');
    });

    if (cloudWorkspace) {
      window.localStorage.removeItem(workspaceKey);
      if (readinessChecklistChanged) {
        window.setTimeout(() => {
          if (!cancelled) void saveToCloud(hydratedWorkspace);
        }, 0);
      }
    } else if (legacyDeals.length) {
      window.setTimeout(() => {
        if (!cancelled) void saveToCloud(hydratedWorkspace);
      }, 0);
    } else {
      queueMicrotask(() => {
        if (!cancelled) setSyncState('ready');
      });
    }

    return () => {
      cancelled = true;
    };
  }, [initialWorkspace, initialWorkspaceVersion, saveToCloud, workspaceKey]);

  useEffect(() => () => {
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    if (contractPreviewUrlRef.current) URL.revokeObjectURL(contractPreviewUrlRef.current);
  }, []);

  useEffect(() => {
    const requestedFormFamily = new URLSearchParams(window.location.search).get('form');
    const requestedVersion = trecFormVersions.find((version) => version.formFamily === requestedFormFamily && version.isActive);
    if (!ready || !requestedVersion) return;
    const timer = window.setTimeout(() => {
      setActiveTrecFormFamily(requestedVersion.formFamily);
      setActiveTrecPage(1);
      setWorkspacePage(2);
      if (deals.length === 0) {
        const deal = newDeal(requestedVersion.id);
        const workspace = { deals: [deal], notificationPreferences };
        setDeals([deal]);
        setActiveDealId(deal.id);
        queueCloudSave(workspace);
      }
      window.setTimeout(() => document.getElementById('trec-form-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [deals.length, notificationPreferences, queueCloudSave, ready, trecFormVersions]);

  useEffect(() => {
    if (!isCameraOpen) return;
    let cancelled = false;

    void navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' } },
    }).then((stream) => {
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      cameraStreamRef.current = stream;
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        void cameraVideoRef.current.play();
      }
    }).catch(() => {
      if (!cancelled) setCameraError('Camera access was blocked or no camera was found. Allow camera access or use the device camera option.');
    });

    return () => {
      cancelled = true;
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    };
  }, [isCameraOpen]);

  const persistDeals = (nextDeals: AgentDeal[]) => {
    setDeals(nextDeals);
    if (ready) queueCloudSave({ deals: nextDeals, notificationPreferences });
  };

  const applyActiveAction = (message: string, patch: Partial<AgentDeal>) => {
    if (!activeDeal) return;
    const now = new Date().toISOString();
    const activity: AgentActivity = { id: getId('activity'), message, createdAt: now };
    const nextDeal: AgentDeal = { ...activeDeal, ...patch, updatedAt: now, activity: [...activeDeal.activity, activity].slice(-300) };
    persistDeals(deals.map((deal) => deal.id === activeDeal.id ? nextDeal : deal));
  };

  const updateNotificationPreferences = (patch: Partial<AgentNotificationPreferences>) => {
    const nextPreferences = { ...notificationPreferences, ...patch };
    setNotificationPreferences(nextPreferences);
    if (ready) queueCloudSave({ deals, notificationPreferences: nextPreferences });
  };

  const activeDeal = deals.find((deal) => deal.id === activeDealId) ?? null;
  const isDealFullyComplete = (deal: AgentDeal) =>
    deal.tasks.every((task) => task.complete) &&
    deal.reminders.every((reminder) => reminder.complete) &&
    deal.documents.every((document) => document.complete);
  const isDealClosedAndComplete = (deal: AgentDeal) => Boolean(deal.closeoutOutcome) && isDealFullyComplete(deal);
  const activeDeals = deals.filter((deal) => !isDealClosedAndComplete(deal));
  const closedDeals = deals.filter((deal) => isDealClosedAndComplete(deal));
  const isDealLocked = (deal: AgentDeal) => Boolean(deal.closeoutOutcome && deal.closeoutDate) && isDealFullyComplete(deal);
  const activePacketForms = trecFormVersions.filter((version) => version.isActive);
  const selectedFormVersions = activeDeal
    ? activePacketForms.filter((version) => activeDeal.selectedFormFamilies[version.formFamily])
    : [];
  const dealFormStatus = (deal: AgentDeal, version: TrecFormVersion): 'completed' | 'needs_attention' | 'not_started' => {
    if (version.fields.length === 0) return 'not_started';
    const filledCount = version.fields.filter((field) => (deal.formFields[field.id] ?? '').trim() !== '').length;
    if (filledCount === 0) return 'not_started';
    if (filledCount === version.fields.length) return 'completed';
    return 'needs_attention';
  };
  const currentTrecFormVersion = activePacketForms.find((version) => version.formFamily === activeTrecFormFamily)
    ?? activePacketForms[0]
    ?? trecFormVersion;
  const currentTrecPage = Math.min(Math.max(activeTrecPage, 1), currentTrecFormVersion.pageCount);
  const trecFormFieldById = new Map(currentTrecFormVersion.fields.map((field) => [field.id, field]));
  const currentFormValues = activeDeal
    ? Object.fromEntries(currentTrecFormVersion.fields.map((field) => [
        field.id,
        activeDeal.formFields[field.id]
          || (field.pdfFieldName === 'Street Address and City' || field.pdfFieldName === 'Address of Property'
            ? activeDeal.propertyAddress
            : ''),
      ]))
    : {};

  const syncMessage = {
    loading: 'Connecting your secure cloud workspace.',
    ready: 'Secure cloud sync is active for your signed-in account.',
    saving: 'Saving your latest changes securely.',
    conflict: 'A newer cloud copy exists on another device. Refresh this page before making more changes.',
    error: 'Cloud sync needs attention. Keep this page open and refresh before leaving.',
  }[syncState];
  const activeDeadlines = activeDeal ? dealDeadlines(activeDeal) : [];
  const today = chicagoToday();
  const radarWindowDays = (() => {
    if (!activeDeal?.closingDate || activeDeal.closingDate < today) return 14;
    const start = new Date(`${today}T12:00:00Z`).getTime();
    const end = new Date(`${activeDeal.closingDate}T12:00:00Z`).getTime();
    return Math.max(1, Math.ceil((end - start) / 86_400_000));
  })();

  const radarItems = (() => {
    const windowEnd = activeDeal?.closingDate && activeDeal.closingDate >= today
      ? activeDeal.closingDate
      : addDays(today, 14);
    const items: RadarItem[] = [];

    deals.filter((deal) => deal.status !== 'completed' && (!activeDeal || deal.id === activeDeal.id)).forEach((deal) => {
      dealDeadlines(deal).forEach((deadline) => {
        if (deadline.date <= windowEnd && deadline.date >= addDays(today, -7)) {
          items.push({
            id: `deadline-${deal.id}-${deadline.id}`,
            dealId: deal.id,
            dealTitle: deal.propertyAddress || deal.title,
            label: deadline.label,
            date: deadline.date,
            kind: 'deadline',
            overdue: deadline.date < today,
          });
        }
      });

      deal.reminders.filter((reminder) => !reminder.complete && reminder.reminderDate <= windowEnd).forEach((reminder) => {
        items.push({
          id: `reminder-${deal.id}-${reminder.id}`,
          dealId: deal.id,
          dealTitle: deal.propertyAddress || deal.title,
          label: `Reminder: ${reminder.label}`,
          date: reminder.reminderDate,
          kind: 'reminder',
          overdue: reminder.reminderDate < today,
        });
      });

      deal.tasks.filter((task) => !task.complete && task.dueDate && task.dueDate <= windowEnd).forEach((task) => {
        items.push({
          id: `task-${deal.id}-${task.id}`,
          dealId: deal.id,
          dealTitle: deal.propertyAddress || deal.title,
          label: task.title,
          date: task.dueDate,
          kind: 'task',
          overdue: task.dueDate < today,
        });
      });
    });

    return items.sort((left, right) => left.date.localeCompare(right.date)).slice(0, 10);
  })();

  const reviewAlerts = deals.flatMap((deal) => {
    if (deal.status === 'completed') return [];
    const label = deal.propertyAddress || deal.title;
    return buildTrecValidation(
      worksheetValues(deal),
      dealDeadlines(deal),
      deal.reminders.map((reminder) => ({ deadlineKey: reminder.deadlineId, reminderDate: reminder.reminderDate, isComplete: reminder.complete })),
    ).map((alert) => `${label}: ${alert.message}`);
  });


  const activeDealCount = deals.filter((deal) => deal.status !== 'completed').length;
  const closingSoonCount = deals.filter((deal) => deal.status !== 'completed' && deal.closingDate >= today && deal.closingDate <= addDays(today, 30)).length;
  const overdueTaskCount = deals.flatMap((deal) => deal.tasks).filter((task) => !task.complete && task.dueDate < today).length;

  const createDeal = () => {
    const deal = newDeal(trecFormVersion.id);
    persistDeals([deal, ...deals]);
    setActiveDealId(deal.id);
    setPendingRemoval(null);
    trackEvent('agent_deal_desk_transaction_created');
  };

  const updateActiveDeal = <Key extends keyof AgentDeal>(key: Key, value: AgentDeal[Key]) => {
    if (!activeDeal) return;
    const nextDeals = deals.map((deal) => (
      deal.id === activeDeal.id
        ? { ...deal, [key]: value, updatedAt: new Date().toISOString() }
        : deal
    ));
    persistDeals(nextDeals);
  };

  const extractContract = async (file: File | undefined) => {
    if (!file || !activeDeal) return;
    clearContractPreview();
    const previewUrl = URL.createObjectURL(file);
    contractPreviewUrlRef.current = previewUrl;
    setContractPreviewUrl(previewUrl);
    setExtractionState('extracting');
    setExtractionError('');
    setExtractionWarnings([]);
    try {
      const formData = new FormData();
      formData.append('contract', file);
      formData.append('trecFormVersionId', currentTrecFormVersion.id);
      const response = await fetch('/api/agent-command-center/extract-contract', {
        method: 'POST',
        credentials: 'same-origin',
        body: formData,
      });
      const data: unknown = await response.json().catch(() => null);
      if (response.status === 401) {
        window.location.assign('/login?next=%2Fagents');
        return;
      }
      if (!response.ok || !data || typeof data !== 'object') {
        const error = data && typeof data === 'object' && 'error' in data
          ? String((data as { error?: unknown }).error ?? 'Could not read this contract.')
          : 'Could not read this contract.';
        throw new Error(error);
      }
      const extraction = (data as { extraction?: unknown }).extraction;
      if (!extraction || typeof extraction !== 'object') throw new Error('Contract suggestions were not available.');
      const record = extraction as Partial<ExtractionDraft>;
      if (!record.worksheet || typeof record.worksheet !== 'object' || !record.addenda || typeof record.addenda !== 'object') {
        throw new Error('Contract suggestions were not in the expected format.');
      }
      setExtractionDraft({
        title: typeof record.title === 'string' ? record.title : undefined,
        worksheet: Object.fromEntries(Object.entries(record.worksheet).filter(([, value]) => typeof value === 'string')) as Record<string, string>,
        formFields: record.formFields && typeof record.formFields === 'object'
          ? Object.fromEntries(Object.entries(record.formFields).filter(([, value]) => typeof value === 'string')) as Record<string, string>
          : {},
        addenda: Object.fromEntries(Object.entries(record.addenda).filter(([, value]) => typeof value === 'boolean')) as Record<string, boolean>,
        warnings: Array.isArray(record.warnings) ? record.warnings.filter((warning): warning is string => typeof warning === 'string') : [],
      });
      setExtractionWarnings(Array.isArray(record.warnings) ? record.warnings.filter((warning): warning is string => typeof warning === 'string') : []);
      setExtractionState('ready');
      trackEvent('agent_deal_desk_contract_extracted');
    } catch (error) {
      clearContractPreview();
      setExtractionError(error instanceof Error ? error.message : 'Could not read this contract.');
      setExtractionState('error');
    }
  };

  const captureContractPhoto = () => {
    const video = cameraVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError('The camera is still starting. Wait a moment, then try again.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setCameraError('The camera image could not be captured. Use the device camera option instead.');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setCameraError('The camera image could not be captured. Use the device camera option instead.');
        return;
      }
      setIsCameraOpen(false);
      void extractContract(new File([blob], `contract-photo-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  };

  const openContractCamera = () => {
    setCameraError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      contractCameraInputRef.current?.click();
      return;
    }
    setIsCameraOpen(true);
  };

  const applyExtraction = () => {
    if (!activeDeal || !extractionDraft) return;
    const worksheet = extractionDraft.worksheet;
    const detailKeys = CONTRACT_DETAIL_FIELDS.map(({ key }) => key);
    const nextDetails = { ...activeDeal.contractDetails };
    for (const key of detailKeys) {
      const value = worksheet[key];
      if (typeof value === 'string') nextDetails[key] = value;
    }
    const nextDeal: AgentDeal = {
      ...activeDeal,
      title: buyerLastNames(worksheet.buyerNames ?? '') || extractionDraft.title || activeDeal.title,
      propertyAddress: worksheet.propertyAddress ?? activeDeal.propertyAddress,
      buyerNames: worksheet.buyerNames ?? activeDeal.buyerNames,
      sellerNames: worksheet.sellerNames ?? activeDeal.sellerNames,
      effectiveDate: worksheet.effectiveDate ?? activeDeal.effectiveDate,
      optionPeriodDays: worksheet.optionDays ?? activeDeal.optionPeriodDays,
      additionalEarnestMoneyDays: worksheet.additionalEarnestMoneyDays ?? activeDeal.additionalEarnestMoneyDays,
      financingDeadlineDays: worksheet.financingDeadlineDays ?? activeDeal.financingDeadlineDays,
      appraisalDeadlineDays: worksheet.appraisalDeadlineDays ?? activeDeal.appraisalDeadlineDays,
      titleCommitmentDays: worksheet.titleCommitmentDays ?? activeDeal.titleCommitmentDays,
      surveyDays: worksheet.surveyDays ?? activeDeal.surveyDays,
      titleObjectionDays: worksheet.titleObjectionDays ?? activeDeal.titleObjectionDays,
      earnestMoneyDeliveredDate: worksheet.earnestMoneyDeliveredDate ?? activeDeal.earnestMoneyDeliveredDate,
      optionFeeDeliveredDate: worksheet.optionFeeDeliveredDate ?? activeDeal.optionFeeDeliveredDate,
      closingDate: worksheet.closingDate ?? activeDeal.closingDate,
      contractDetails: nextDetails,
      formFields: { ...activeDeal.formFields, ...extractionDraft.formFields },
      addenda: { ...activeDeal.addenda, ...extractionDraft.addenda },
      updatedAt: new Date().toISOString(),
      activity: [...activeDeal.activity, { id: getId('activity'), message: 'Applied reviewed contract extraction suggestions', createdAt: new Date().toISOString() }].slice(-300),
    };
    persistDeals(deals.map((deal) => deal.id === activeDeal.id ? nextDeal : deal));
    clearContractPreview();
    setExtractionDraft(null);
    setExtractionState('idle');
    trackEvent('agent_deal_desk_contract_suggestions_applied');
  };

  const updateTrecFormField = (key: string, value: string) => {
    if (!activeDeal) return;
    updateActiveDeal('formFields', { ...activeDeal.formFields, [key]: value });
  };

  const addCustomReminder = () => {
    if (!activeDeal || !reminderDeadlineId || !reminderDate) return;
    const deadline = activeDeadlines.find((item) => item.id === reminderDeadlineId);
    if (!deadline) return;
    const reminder: AgentReminder = {
      id: getId('reminder'), deadlineId: deadline.id, label: deadline.label, deadlineDate: deadline.date,
      reminderDate, note: reminderNote.trim(), preset: 'custom', complete: false,
    };
    applyActiveAction(`Added custom reminder for ${deadline.label}`, { reminders: [...activeDeal.reminders, reminder] });
    setReminderDeadlineId(''); setReminderDate(''); setReminderNote('');
  };

  const updateCalculatedDeadline = (
    key: 'optionPeriodDays' | 'appraisalDeadlineDays' | 'financingDeadlineDays',
    date: string,
  ) => {
    if (!activeDeal) return;
    if (!date) {
      updateActiveDeal(key, '');
      return;
    }
    if (!activeDeal.effectiveDate) return;
    const effective = new Date(`${activeDeal.effectiveDate}T12:00:00Z`).getTime();
    const deadline = new Date(`${date}T12:00:00Z`).getTime();
    const days = Math.round((deadline - effective) / 86_400_000);
    if (days > 0) updateActiveDeal(key, String(days));
  };

  const addTask = () => {
    if (!activeDeal || !taskTitle.trim()) return;
    const task: AgentTask = { id: getId('task'), title: taskTitle.trim(), dueDate: taskDueDate, priority: taskPriority, status: 'todo', complete: false };
    applyActiveAction(`Added ${taskPriority} priority task: ${task.title}`, { tasks: [...activeDeal.tasks, task] });
    setTaskTitle(''); setTaskDueDate(''); setTaskPriority('normal');
    trackEvent('agent_deal_desk_task_added');
  };

  const updateTask = (taskId: string, patch: Partial<AgentTask>) => {
    if (!activeDeal) return;
    const nextTasks = activeDeal.tasks.map((task) => task.id === taskId ? { ...task, ...patch } : task);
    applyActiveAction(`Updated task status`, { tasks: nextTasks });
  };

  const removeTask = (taskId: string) => {
    if (!activeDeal || isDealLocked(activeDeal)) return;
    applyActiveAction('Removed a transaction task', { tasks: activeDeal.tasks.filter((task) => task.id !== taskId) });
  };

  const updateReminder = (reminderId: string, patch: Partial<AgentReminder>) => {
    if (!activeDeal) return;
    applyActiveAction(patch.complete === true ? 'Completed a deadline reminder' : 'Updated a deadline reminder', { reminders: activeDeal.reminders.map((reminder) => reminder.id === reminderId ? { ...reminder, ...patch } : reminder) });
  };

  const addDocument = () => {
    if (!activeDeal || !documentName.trim()) return;
    const now = new Date().toISOString();
    const document: AgentDocument = { id: getId('document'), label: documentName.trim(), status: 'requested', complete: false, requestedAt: now, updatedAt: now };
    applyActiveAction(`Requested document: ${document.label}`, { documents: [...activeDeal.documents, document] });
    setDocumentName('');
  };

  const updateDocument = (documentId: string, status: AgentDocument['status']) => {
    if (!activeDeal) return;
    const now = new Date().toISOString();
    applyActiveAction(`Updated document request status to ${status.replace('_', ' ')}`, { documents: activeDeal.documents.map((document) => document.id === documentId ? { ...document, status, complete: status === 'received' || status === 'reviewed', updatedAt: now } : document) });
  };


  const removeDeal = (dealId: string) => {
    const dealToRemove = deals.find((deal) => deal.id === dealId);
    if (dealToRemove && isDealLocked(dealToRemove)) return;
    const nextDeals = deals.filter((deal) => deal.id !== dealId);
    persistDeals(nextDeals);
    setActiveDealId(nextDeals[0]?.id ?? null);
    setPendingRemoval(null);
    trackEvent('agent_deal_desk_transaction_removed');
  };

  const focusDeal = (dealId: string) => {
    setActiveDealId(dealId);
    window.setTimeout(() => document.getElementById('current-transaction')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const toggleReminderOffset = (offset: AgentDeadlineNotificationOffset) => {
    const alreadyEnabled = notificationPreferences.reminderOffsets.includes(offset);
    const nextOffsets = alreadyEnabled
      ? notificationPreferences.reminderOffsets.filter((value) => value !== offset)
      : [...notificationPreferences.reminderOffsets, offset].sort((left, right) => right - left);
    if (!nextOffsets.length) return;
    updateNotificationPreferences({ reminderOffsets: nextOffsets });
  };

  const exportActiveDealCalendar = () => {
    if (!activeDeal) return;
    downloadCalendar(calendarEventsForDeal(activeDeal), 'realty-news-now-deal-dates.ics');
    trackEvent('agent_deal_desk_calendar_exported', { scope: 'active_deal' });
  };

  const exportAllDealsCalendar = () => {
    const events = deals
      .filter((deal) => deal.status !== 'completed')
      .flatMap(calendarEventsForDeal);
    downloadCalendar(events, 'realty-news-now-active-deal-dates.ics');
    trackEvent('agent_deal_desk_calendar_exported', { scope: 'all_active_deals' });
  };

  const exportTextSummary = () => {
    if (!activeDeal) return;
    downloadTextSummary(activeDeal);
    trackEvent('agent_deal_desk_text_summary_exported');
  };

  const exportBackupRecord = (deal: AgentDeal) => {
    downloadBackupRecord(deal);
    trackEvent('agent_deal_desk_backup_record_exported');
  };

  const saveProgress = () => {
    if (!ready) return;
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    const now = new Date().toISOString();
    const nextDeals = activeDeal ? deals.map((deal) => deal.id === activeDeal.id ? {
      ...deal, updatedAt: now, activity: [...deal.activity, { id: getId('activity'), message: 'Saved transaction progress', createdAt: now }].slice(-300),
    } : deal) : deals;
    setDeals(nextDeals);
    void saveToCloud({ deals: nextDeals, notificationPreferences });
    trackEvent('agent_deal_desk_progress_saved');
  };

  if (panelsOnly) {
    return (
      <section id="agent-deal-tools" className="bg-[#F7F5F1]">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8 lg:py-10">
          <div className="grid items-stretch gap-3 bg-transparent sm:gap-5 sm:border sm:border-[#D9D0BF] sm:bg-[#FFFDF8] sm:p-5 lg:grid-cols-3 lg:p-6">
            <div className="order-1 h-full border border-slate-200 bg-white p-4 sm:p-6">
              <div className="flex items-start gap-3">
                <Bell className="rnn-heading-icon text-[#7059A8]" aria-hidden="true" />
                <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Pressing Deadlines</p><h2 className="mt-2 text-xl font-semibold tracking-[-0.025em] text-slate-950">Next {radarWindowDays} days</h2></div>
              </div>
              <div className="mt-5 space-y-2">
                {!radarItems.length ? <div className="border border-dashed border-slate-300 bg-white p-5 text-sm leading-6 text-slate-600">Add a transaction, signed contract effective date, and closing date to see pressing deadlines.</div> : radarItems.map((item) => (
                  <button type="button" key={item.id} onClick={() => focusDeal(item.dealId)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 border border-slate-200 bg-white p-3 text-left transition hover:border-[#7059A8] sm:flex-nowrap">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-md ${item.overdue ? 'bg-[#B6402C]' : item.kind === 'deadline' ? 'bg-[#7059A8]' : 'bg-[#C88A14]'}`} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-900">{item.label}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{item.dealTitle}</span></span>
                    <span className={`w-full pl-[22px] text-left text-xs font-bold sm:w-auto sm:pl-0 sm:text-right ${item.overdue ? 'text-[#B6402C]' : 'text-slate-700'}`}>{item.overdue ? 'Overdue' : formatDate(item.date)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="order-2 h-full border border-slate-200 bg-white p-4 sm:p-6">
              <div className="flex items-start gap-3">
                <CalendarDays className="rnn-heading-icon text-[#7059A8]" aria-hidden="true" />
                <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Calendar Exports</p><h2 className="mt-2 text-xl font-semibold tracking-[-0.025em] text-slate-950">Take Your Deadlines with You</h2></div>
              </div>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">Download calendar files for the active deal or every active transaction. Each export includes calculated contract dates, closing dates, open reminders, and open tasks.</p>
              <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
                <button type="button" onClick={exportActiveDealCalendar} disabled={!activeDeal || !calendarEventsForDeal(activeDeal).length} className="inline-flex h-[42px] items-center justify-center gap-2 rounded-md bg-[#301D5D] px-4 text-sm font-bold text-white transition hover:bg-[#42277c] disabled:cursor-not-allowed disabled:opacity-45"><Download className="rnn-inline-icon" aria-hidden="true" />Export this deal</button>
                <button type="button" onClick={exportAllDealsCalendar} disabled={!deals.some((deal) => deal.status !== 'completed' && calendarEventsForDeal(deal).length)} className="inline-flex h-[42px] items-center justify-center gap-2 rounded-md border border-[#7059A8] bg-white px-4 text-sm font-bold text-[#301D5D] transition hover:bg-[#F8F5FF] disabled:cursor-not-allowed disabled:opacity-45"><CalendarDays className="rnn-inline-icon" aria-hidden="true" />Export active deals</button>
              </div>
            </div>
            <div className="order-3 h-full border border-slate-200 bg-white p-4 sm:p-6">
              <div className="flex items-start gap-3">
                <Bell className="rnn-heading-icon text-[#7059A8]" aria-hidden="true" />
                <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Deadline Alerts</p><h2 className="mt-2 text-xl font-semibold tracking-[-0.025em] text-slate-950">Choose How You Are Notified</h2></div>
              </div>
              <div className="mt-4 space-y-3">
                <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-slate-800"><input type="checkbox" checked={notificationPreferences.emailEnabled} onChange={(event) => updateNotificationPreferences({ emailEnabled: event.target.checked })} className="h-4 w-4 accent-[#301D5D]" /><Mail className="rnn-inline-icon text-[#7059A8]" aria-hidden="true" />Send deadline alerts by email</label>
                <div className="flex flex-wrap items-center gap-3"><label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-slate-800"><input type="checkbox" checked={notificationPreferences.pushEnabled} onChange={(event) => updateNotificationPreferences({ pushEnabled: event.target.checked })} className="h-4 w-4 accent-[#301D5D]" /><Smartphone className="rnn-inline-icon text-[#7059A8]" aria-hidden="true" />Send browser push alerts</label><PushOptInButton realtorId={realtorId} label="Connect this device" className="inline-flex min-h-[36px] items-center rounded-md border border-[#7059A8] bg-white px-3 text-xs font-bold text-[#301D5D] transition hover:bg-[#F8F5FF]" /></div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-100 pt-3 sm:flex sm:flex-wrap sm:gap-x-4">
                  {([[7, '7 days before'], [3, '3 days before'], [1, '1 day before'], [0, 'Due today']] as const).map(([offset, label]) => <label key={offset} className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={notificationPreferences.reminderOffsets.includes(offset)} disabled={notificationPreferences.reminderOffsets.length === 1 && notificationPreferences.reminderOffsets[0] === offset} onChange={() => toggleReminderOffset(offset)} className="h-3.5 w-3.5 accent-[#301D5D]" />{label}</label>)}
                </div>
              </div>
              <p className="mt-4 text-xs leading-5 text-slate-500">Alerts are opt-in and send only for active transactions. Browser push requires permission on each device. Check the signed contract and your broker&apos;s process before acting.</p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (panelsOnly && window.location.hash === '#legacy-action-panels') {
    return (
      <section id="agent-deal-tools" className="bg-[#F7F5F1]">
        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-10">
          {!activeDeal ? (
            <div className="border border-dashed border-slate-300 bg-white p-6 text-center">
              <h2 className="text-xl font-semibold text-slate-950">Set up Your First Transaction</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">Create a secure transaction to manage tasks, documents, and closeout history here.</p>
              <button type="button" onClick={createDeal} className="mt-5 inline-flex min-h-[42px] items-center gap-2 rounded-md bg-[#301D5D] px-4 text-sm font-bold text-white">
                Create transaction <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="border border-slate-200 bg-white p-5 sm:p-6">
                  <div className="flex items-center gap-3">
                    <ListTodo className="rnn-heading-icon text-[#7059A8]" aria-hidden="true" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Action list</p>
                      <h2 className="mt-1 text-xl font-semibold text-slate-950">Tasks and Reminders</h2>
                    </div>
                  </div>
                  <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2">
                    <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} className="min-h-[44px] min-w-0 w-full border border-slate-300 px-3 text-sm outline-none focus:border-[#301D5D]" placeholder="Add a transaction task" />
                    <input type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} aria-label="Task due date" className="min-h-[44px] min-w-0 w-full border border-slate-300 px-3 text-sm outline-none focus:border-[#301D5D]" />
                    <select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as TrecTaskPriority)} aria-label="Task priority" className="min-h-[44px] min-w-0 w-full border border-slate-300 bg-white px-2 text-sm outline-none focus:border-[#301D5D]">{TREC_TASK_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select>
                    <button type="button" onClick={addTask} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-[#301D5D] px-4 text-sm font-bold text-white"><Plus className="rnn-inline-icon" aria-hidden="true" />Add</button>
                  </div>
                  <div className="mt-4 grid min-w-0 gap-2 border-y border-slate-100 py-4 sm:grid-cols-2">
                    <select value={reminderDeadlineId} onChange={(event) => setReminderDeadlineId(event.target.value)} aria-label="Reminder deadline" className="min-h-[42px] min-w-0 w-full border border-slate-300 bg-white px-2 text-sm"><option value="">Custom reminder deadline</option>{activeDeadlines.map((deadline) => <option key={deadline.id} value={deadline.id}>{deadline.label}</option>)}</select>
                    <input type="date" value={reminderDate} onChange={(event) => setReminderDate(event.target.value)} aria-label="Custom reminder date" className="min-h-[42px] min-w-0 w-full border border-slate-300 px-2 text-sm" />
                    <input value={reminderNote} onChange={(event) => setReminderNote(event.target.value)} aria-label="Custom reminder note" className="min-h-[42px] min-w-0 w-full border border-slate-300 px-3 text-sm" placeholder="Reminder note (optional)" />
                    <button type="button" onClick={addCustomReminder} disabled={!reminderDeadlineId || !reminderDate} className="inline-flex min-h-[42px] items-center justify-center rounded-md border border-[#7059A8] px-4 text-sm font-bold text-[#301D5D] disabled:opacity-40">Add reminder</button>
                  </div>
                  <div className="mt-5 space-y-2">
                    {!activeDeal.tasks.length && !activeDeal.reminders.length ? <p className="border border-dashed border-slate-300 bg-[#FCFBF9] p-4 text-sm text-slate-600">Use deadline presets (7d, 3d, 1d, due) in the review step or add a custom action here.</p> : <>
                      {activeDeal.reminders.map((reminder) => <div key={reminder.id} className="flex flex-wrap items-center gap-3 border border-[#E7C769] bg-[#FFF9E7] p-3"><button type="button" onClick={() => updateReminder(reminder.id, { complete: !reminder.complete })} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${reminder.complete ? 'border-[#301D5D] bg-[#301D5D] text-white' : 'border-[#A97A1A] bg-white text-transparent'}`} aria-label={`Mark ${reminder.label} reminder ${reminder.complete ? 'incomplete' : 'complete'}`}><Check className="h-3.5 w-3.5" aria-hidden="true" /></button><span className={`min-w-0 flex-1 text-sm font-semibold ${reminder.complete ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{reminder.label}{reminder.note ? <span className="block text-xs font-normal text-slate-600">{reminder.note}</span> : null}</span><span className="text-xs font-bold text-[#855D10]">{formatDate(reminder.reminderDate)}</span></div>)}
                      {activeDeal.tasks.map((task) => <div key={task.id} className="flex flex-wrap items-center gap-3 border border-slate-200 p-3"><button type="button" onClick={() => updateTask(task.id, { status: task.status === 'done' ? 'todo' : 'done', complete: task.status !== 'done' })} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${task.complete ? 'border-[#301D5D] bg-[#301D5D] text-white' : 'border-slate-400 bg-white text-transparent'}`} aria-label={`Mark ${task.title} ${task.complete ? 'incomplete' : 'complete'}`}><Check className="h-3.5 w-3.5" aria-hidden="true" /></button><span className={`min-w-0 flex-1 text-sm font-semibold ${task.complete ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{task.title}</span><span className={`rounded-md px-2 py-1 text-xs font-bold ${task.priority === 'critical' ? 'bg-red-100 text-red-800' : task.priority === 'high' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{task.priority}</span><select value={task.status} onChange={(event) => { const status = event.target.value as TrecTaskStatus; updateTask(task.id, { status, complete: status === 'done' || status === 'skipped' }); }} aria-label={`Status for ${task.title}`} className="min-h-[34px] border border-slate-300 bg-white px-2 text-xs font-semibold">{TREC_TASK_STATUSES.map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}</select>{task.dueDate && <span className={`text-xs font-bold ${task.dueDate < today && !task.complete ? 'text-[#B6402C]' : 'text-slate-500'}`}>{formatDate(task.dueDate)}</span>}<button type="button" onClick={() => removeTask(task.id)} className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-slate-400 transition hover:text-[#9A3D2B]" aria-label={`Remove ${task.title}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></button></div>)}
                    </>}
                  </div>
                </div>

                <ReadinessChecklist
                  headingTag="h2"
                  documents={activeDeal.documents}
                  documentName={documentName}
                  setDocumentName={setDocumentName}
                  addDocument={addDocument}
                  updateDocument={updateDocument}
                  reviewAlerts={reviewAlerts}
                />
              </div>
              <section className="mt-6 border border-slate-200 bg-white p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><History className="rnn-heading-icon text-[#7059A8]" aria-hidden="true" /><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Closeout and history</p><h2 className="mt-1 text-xl font-semibold text-slate-950">Outcome, Record, and Export</h2></div></div><button type="button" onClick={exportTextSummary} className="inline-flex min-h-[40px] items-center gap-2 rounded-md border border-[#7059A8] px-4 text-sm font-bold text-[#301D5D]"><Download className="h-4 w-4" aria-hidden="true" />Download summary</button></div>
                <div className="mt-5 grid gap-3 md:grid-cols-3"><select value={activeDeal.closeoutOutcome} onChange={(event) => updateActiveDeal('closeoutOutcome', event.target.value)} aria-label="Closeout outcome" className="min-h-[44px] border border-slate-300 bg-white px-3 text-sm"><option value="">Closeout outcome</option><option value="closed">Closed</option><option value="cancelled">Cancelled</option><option value="withdrawn">Withdrawn</option><option value="expired">Expired</option></select><input type="date" value={activeDeal.closeoutDate} onChange={(event) => updateActiveDeal('closeoutDate', event.target.value)} aria-label="Closeout date" className="min-h-[44px] border border-slate-300 px-3 text-sm" /><input value={activeDeal.closeoutNote} onChange={(event) => updateActiveDeal('closeoutNote', event.target.value)} aria-label="Closeout note" className="min-h-[44px] border border-slate-300 px-3 text-sm" placeholder="Closeout note" /></div>
                <ul className="mt-5 max-h-52 space-y-2 overflow-auto">{[...activeDeal.activity].reverse().map((item) => <li key={item.id} className="border-l-2 border-[#E7C769] bg-[#FCFBF9] px-3 py-2 text-sm text-slate-700"><span className="font-bold text-slate-900">{formatTimestamp(item.createdAt)}</span> · {item.message}</li>)}</ul>
              </section>
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <main id="agent-desk" className="min-h-screen bg-[#F7F5F1]">
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:py-16">
        <div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7059A8]">Private agent workspace</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-4xl">Your Deal Desktop</h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
              Turn contract terms into a working desk with live timing, task and document checks, and Pressing Deadlines across your active transactions.
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-start gap-3 border border-[#D9D0BF] bg-[#FFFDF8] px-4 py-3 text-sm leading-6 text-slate-600">
          <Save className="rnn-inline-icon text-[#7059A8]" aria-hidden="true" />
          <p>
            <span className="font-semibold text-slate-900">{ready ? syncMessage : 'Loading your secure workspace.'}</span>{' '}
            Verify all dates against the signed contract and your broker&apos;s process.
          </p>
        </div>

        <nav aria-label="Deal Desktop pages" className="mt-5 border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {workspacePage === 1 && <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7059A8]">
              Page 1 of 2
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              Overview, Pressing Deadlines, calendar and alerts
            </p>
          </div>}
          {workspacePage === 2 ? (
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7059A8]">
                Page 2 of 2
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                Workspace, Transaction Forms, Reminders & Tasks
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Link href="/agents" className="inline-flex min-h-[42px] items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:border-[#301D5D]">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Deal Desktop
              </Link>
              <button type="button" onClick={saveProgress} disabled={!ready || syncState === 'saving'} className="inline-flex min-h-[42px] items-center gap-2 rounded-md border border-[#7059A8] bg-white px-4 text-sm font-bold text-[#301D5D] disabled:opacity-50">
                <Save className="rnn-inline-icon" aria-hidden="true" /> {syncState === 'saving' ? 'Saving…' : 'Save for later'}
              </button>
              <button type="button" onClick={() => setWorkspacePage(2)} className="inline-flex min-h-[42px] items-center gap-2 rounded-md bg-[#301D5D] px-4 text-sm font-bold text-white hover:bg-[#42277c]">
                Open worksheet <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
          </div>
        </nav>

        {workspacePage === 1 && (
          <>
        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Agent transactions', activeDealCount, ClipboardCheck, 'bg-[#F8F5FF] text-[#301D5D]'],
            ['Closing in 30 days', closingSoonCount, CalendarDays, 'bg-[#FFF9E7] text-[#855D10]'],
            ['Review alerts', reviewAlerts.length, AlertTriangle, 'bg-[#FFF0EC] text-[#9A3D2B]'],
            ['Overdue tasks', overdueTaskCount, ListTodo, 'bg-[#F2EEE7] text-[#4C3B67]'],
          ].map(([label, value, Icon, tone]) => {
            const MetricIcon = Icon as typeof CalendarDays;
            return (
              <div key={label as string} className="border border-slate-200 bg-white p-4">
                <div className={`flex h-9 w-9 items-center justify-center rounded-full ${tone as string}`}>
                  <MetricIcon className="h-4 w-4" aria-hidden="true" />
                </div>
                <p className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{value as number}</p>
                <p className="mt-1 text-sm font-medium text-slate-600">{label as string}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-6 hidden grid items-stretch gap-5 border border-[#D9D0BF] bg-[#FFFDF8] p-5 lg:grid-cols-3 lg:p-6">
          <div className="order-2 h-full border border-slate-200 bg-white p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <CalendarDays className="rnn-heading-icon text-[#7059A8]" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Calendar Exports</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-950">Take Your Deadlines with You</h3>
              </div>
            </div>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
              Download calendar files for the active deal or every active transaction. Each export includes calculated contract dates, closing dates, open reminders, and open tasks.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={exportActiveDealCalendar}
                disabled={!activeDeal || !calendarEventsForDeal(activeDeal).length}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-md bg-[#301D5D] px-4 text-sm font-bold text-white transition hover:bg-[#42277c] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Download className="rnn-inline-icon" aria-hidden="true" />
                Export this deal
              </button>
              <button
                type="button"
                onClick={exportAllDealsCalendar}
                disabled={!deals.some((deal) => deal.status !== 'completed' && calendarEventsForDeal(deal).length)}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-md border border-[#7059A8] bg-white px-4 text-sm font-bold text-[#301D5D] transition hover:bg-[#F8F5FF] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <CalendarDays className="rnn-inline-icon" aria-hidden="true" />
                Export active deals
              </button>
            </div>
          </div>

          <div className="order-3 h-full border border-slate-200 bg-white p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <Bell className="rnn-heading-icon text-[#7059A8]" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Deadline Alerts</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-950">Choose How You Are Notified</h3>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={notificationPreferences.emailEnabled}
                  onChange={(event) => updateNotificationPreferences({ emailEnabled: event.target.checked })}
                  className="h-4 w-4 accent-[#301D5D]"
                />
                <Mail className="rnn-inline-icon text-[#7059A8]" aria-hidden="true" />
                Send deadline alerts by email
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={notificationPreferences.pushEnabled}
                    onChange={(event) => updateNotificationPreferences({ pushEnabled: event.target.checked })}
                    className="h-4 w-4 accent-[#301D5D]"
                  />
                  <Smartphone className="rnn-inline-icon text-[#7059A8]" aria-hidden="true" />
                  Send browser push alerts
                </label>
                <PushOptInButton
                  realtorId={realtorId}
                  label="Connect this device"
                  className="inline-flex min-h-[36px] items-center rounded-md border border-[#7059A8] bg-white px-3 text-xs font-bold text-[#301D5D] transition hover:bg-[#F8F5FF]"
                />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
                {([
                  [7, '7 days before'],
                  [3, '3 days before'],
                  [1, '1 day before'],
                  [0, 'Due today'],
                ] as const).map(([offset, label]) => (
                  <label key={offset} className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                    <input
                      type="checkbox"
                      checked={notificationPreferences.reminderOffsets.includes(offset)}
                      disabled={notificationPreferences.reminderOffsets.length === 1 && notificationPreferences.reminderOffsets[0] === offset}
                      onChange={() => toggleReminderOffset(offset)}
                      className="h-3.5 w-3.5 accent-[#301D5D]"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">
              Alerts are opt-in and send only for active transactions. Browser push requires permission on each device. Check the signed contract and your broker&apos;s process before acting.
            </p>
          </div>
          <div className="order-1 h-full border border-slate-200 bg-white p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <Bell className="rnn-heading-icon text-[#7059A8]" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Pressing Deadlines</p>
                <h3 className="mt-2 text-xl font-semibold tracking-[-0.025em] text-slate-950">Next {radarWindowDays} days</h3>
              </div>
            </div>
            <div className="mt-5 space-y-2">
              {!radarItems.length ? (
                <div className="border border-dashed border-slate-300 bg-white p-5 text-sm leading-6 text-slate-600">
                  Add a transaction, signed contract effective date, and closing date to see pressing deadlines.
                </div>
              ) : radarItems.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => focusDeal(item.dealId)}
                  className="flex w-full items-center gap-3 border border-slate-200 bg-white p-3 text-left transition hover:border-[#7059A8]"
                >
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-md ${item.overdue ? 'bg-[#B6402C]' : item.kind === 'deadline' ? 'bg-[#7059A8]' : 'bg-[#C88A14]'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">{item.label}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">{item.dealTitle}</span>
                  </span>
                  <span className={`text-right text-xs font-bold ${item.overdue ? 'text-[#B6402C]' : 'text-slate-700'}`}>
                    {item.overdue ? 'Overdue' : formatDate(item.date)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
          </>
        )}

        {workspacePage === 2 && (
          <div id="current-transaction" className="scroll-mt-24 border border-slate-200 bg-white p-5 sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Current transaction</p>
                <h3 className="mt-2 text-xl font-semibold tracking-[-0.025em] text-slate-950">
                  {activeDeal?.propertyAddress || activeDeal?.title || 'Start a transaction'}
                </h3>
                {selectedFormVersions.length > 0 && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                    <FileText className="h-3.5 w-3.5 text-[#7059A8]" aria-hidden="true" />
                    {selectedFormVersions.length} form{selectedFormVersions.length === 1 ? '' : 's'} selected: {selectedFormVersions.map((version) => version.formNumber).join(', ')}
                  </p>
                )}
              </div>
              {deals.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      createDeal();
                      setPendingRemoval(null);
                    }}
                    className="inline-flex min-h-[42px] items-center gap-2 rounded-md bg-[#301D5D] px-4 text-sm font-bold text-white"
                  >
                    Start a New Transaction
                  </button>
                  {activeDeal && isDealLocked(activeDeal) && (
                    <span className="inline-flex min-h-[42px] items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-500">
                      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                      Locked — closed record
                    </span>
                  )}
                  {activeDeal && !isDealLocked(activeDeal) && (
                    pendingRemoval === activeDeal.id ? (
                      <button
                        type="button"
                        onClick={() => removeDeal(activeDeal.id)}
                        className="inline-flex min-h-[42px] items-center gap-2 rounded-md bg-[#9A3D2B] px-4 text-sm font-bold text-white"
                      >
                        Confirm remove
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPendingRemoval(activeDeal.id)}
                        className="inline-flex min-h-[42px] items-center gap-2 rounded-md border border-[#D8A79D] px-4 text-sm font-semibold text-[#9A3D2B] transition hover:bg-[#FFF0EC]"
                      >
                        <Trash2 className="rnn-inline-icon" aria-hidden="true" />
                        Remove
                      </button>
                    )
                  )}
                </div>
              )}
            </div>

            {!activeDeal ? (
              <div className="mt-7 flex min-h-[260px] flex-col items-center justify-center border border-dashed border-slate-300 bg-[#FCFBF9] px-6 text-center">
                <ClipboardCheck className="rnn-heading-icon text-[#7059A8]" aria-hidden="true" />
                <h4 className="mt-4 text-lg font-semibold text-slate-950">Build Your First Deal Desktop</h4>
                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">Create a private workspace to turn the contract terms in front of you into a workable list of actions.</p>
                <button type="button" onClick={createDeal} className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-md bg-[#301D5D] px-4 text-sm font-bold text-white">
                  Create transaction
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <>
                <div className="mt-5">
                  {extractionState === 'ready' && extractionDraft && (
                    <section role="status" className="mt-4 border border-emerald-200 bg-emerald-50 p-4">
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                        <div>
                          <p className="text-sm font-semibold text-emerald-950">Contract suggestions are ready to review</p>
                          <p className="mt-1 text-sm leading-6 text-emerald-800">
                            {Object.values(extractionDraft.worksheet).filter(Boolean).length} operational facts, {Object.values(extractionDraft.formFields).filter(Boolean).length} official TREC fields, and {Object.values(extractionDraft.addenda).filter(Boolean).length} selected addenda were found. Review the preview before applying.
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button type="button" onClick={applyExtraction} className="inline-flex min-h-[40px] items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800">Apply to this deal</button>
                          <button type="button" onClick={() => { clearContractPreview(); setExtractionDraft(null); setExtractionState('idle'); }} className="inline-flex min-h-[40px] items-center justify-center rounded-md border border-emerald-300 bg-white px-4 text-sm font-bold text-emerald-800 hover:bg-emerald-100">Discard</button>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        <div className="overflow-hidden border border-emerald-200 bg-white">
                          <div className="border-b border-emerald-100 px-3 py-2">
                            <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-900">Uploaded contract</p>
                          </div>
                          {contractPreviewUrl ? (
                            <iframe
                              src={contractPreviewUrl}
                              title="Uploaded contract preview"
                              className="h-[420px] w-full bg-slate-100 sm:h-[560px]"
                            />
                          ) : (
                            <div className="flex h-[280px] items-center justify-center px-5 text-center text-sm text-slate-600">
                              The temporary contract preview is no longer available.
                            </div>
                          )}
                        </div>
                        <div className="max-h-[560px] overflow-y-auto border border-emerald-200 bg-white">
                          <div className="sticky top-0 z-10 border-b border-emerald-100 bg-white px-3 py-2">
                            <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-900">Proposed entries</p>
                            <p className="mt-1 text-xs text-slate-600">Compare each entry with the unchanged contract before applying.</p>
                          </div>
                          <div className="space-y-5 p-3">
                            {Object.entries(extractionDraft.worksheet).filter(([, value]) => Boolean(value)).length > 0 && (
                              <div>
                                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Workspace summary and timing</p>
                                <dl className="mt-2 space-y-2">
                                  {Object.entries(extractionDraft.worksheet).filter(([, value]) => Boolean(value)).map(([key, value]) => (
                                    <div key={key} className="border border-slate-200 bg-[#FCFBF9] px-3 py-2 text-xs">
                                      <dt className="font-semibold text-slate-900">{sentenceCaseKey(key)}</dt>
                                      <dd className="mt-1 break-words text-slate-700">{value}</dd>
                                    </div>
                                  ))}
                                </dl>
                              </div>
                            )}
                            {Object.entries(extractionDraft.formFields).filter(([, value]) => Boolean(value)).length > 0 && (
                              <div>
                                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Official TREC fields</p>
                                <dl className="mt-2 space-y-2">
                                  {Object.entries(extractionDraft.formFields).filter(([, value]) => Boolean(value)).map(([key, value]) => {
                                    const field = trecFormFieldById.get(key);
                                    return (
                                      <div key={key} className="border border-slate-200 bg-[#FCFBF9] px-3 py-2 text-xs">
                                        <dt className="font-semibold leading-5 text-slate-900">{field?.label ?? key}</dt>
                                        <dd className="mt-1 break-words text-slate-700">{value === 'true' ? 'Selected' : value}</dd>
                                        {field && <dd className="mt-1 text-[11px] text-slate-500">Page {field.page}</dd>}
                                      </div>
                                    );
                                  })}
                                </dl>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <p className="mt-3 text-xs leading-5 text-emerald-800">The preview exists only in this browser tab while you review it. The source contract is not added to your cloud workspace; only values you approve are saved.</p>
                    </section>
                  )}
                  {extractionState === 'error' && (
                    <p role="alert" className="mt-4 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                      {extractionError || 'The contract could not be read. Use a clear PDF or image smaller than 15 MB, then try again.'}
                    </p>
                  )}
                  {extractionWarnings.length > 0 && (
                    <ul className="mt-4 list-disc space-y-1 border-l-2 border-amber-300 pl-6 text-xs leading-5 text-amber-900">
                      {extractionWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                    </ul>
                  )}
                </div>

                <div className="mt-7 min-w-0">
                  <label className="block min-w-0">
                    <span className="mb-2 block text-sm font-semibold text-slate-800">Deal Name: Buyer&apos;s Last Name</span>
                    <input value={activeDeal.title} onChange={(event) => updateActiveDeal('title', event.target.value)} className="h-[46px] min-w-0 w-full rounded-md border border-slate-300 px-3 text-base outline-none focus:border-[#301D5D] sm:max-w-xl sm:text-sm" placeholder="Buyer’s last name" />
                  </label>
                </div>

                <div className="mt-7 rounded-md border border-slate-200 bg-[#FCFBF9] p-5 sm:p-7">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="rnn-heading-icon text-[#7059A8]" aria-hidden="true" />
                    <div>
                      <h4 className="text-lg font-semibold text-slate-950">Pressing Deadlines</h4>
                      <p className="mt-1 text-sm text-slate-600">Enter the signed contract&apos;s effective date first. Deadline dates auto-populate from it using the contract terms and TREC timing rules, then sync with Calendar Exports and Deadline Alerts.</p>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="flex min-w-0 flex-col rounded-md border border-slate-200 bg-white p-4">
                      <span className="block text-sm font-bold text-slate-900">Signed Contract / Effective Date</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500 sm:min-h-[84px]">TREC rule: use the contract&apos;s effective date after final acceptance. This is day zero; deadline counting begins on the following calendar day.</span>
                      <input
                        type="date"
                        value={activeDeal.effectiveDate}
                        onChange={(event) => updateActiveDeal('effectiveDate', event.target.value)}
                        className="mt-4"
                      />
                    </label>
                    <div className="flex min-w-0 flex-col rounded-md border border-slate-200 bg-white p-4">
                      <p className="text-sm font-bold text-slate-900">Earnest Money Deposit</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500 sm:min-h-[84px]">TREC rule: due by the end of the third calendar day after the effective date; weekend and legal-holiday rollover applies.</p>
                      <input
                        type="date"
                        readOnly
                        value={activeDeadlines.find((deadline) => deadline.id === 'earnest-money-delivery')?.date ?? ''}
                        className="mt-4 bg-slate-50 text-slate-700"
                        aria-label="Calculated earnest money deposit deadline"
                      />
                    </div>
                    {CALCULATED_TIMELINE_FIELDS.map(({ key, deadlineId, label, rule }) => (
                      <label key={key} className="flex min-w-0 flex-col rounded-md border border-slate-200 bg-white p-4">
                        <span className="block text-sm font-bold text-slate-900">{label}</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500 sm:min-h-[84px]">TREC rule: {rule}</span>
                        <input
                          type="date"
                          value={activeDeadlines.find((deadline) => deadline.id === deadlineId)?.date ?? ''}
                          disabled={!activeDeal.effectiveDate}
                          onChange={(event) => updateCalculatedDeadline(key, event.target.value)}
                          className="mt-4 disabled:cursor-not-allowed disabled:bg-slate-50"
                        />
                      </label>
                    ))}
                    <label className="flex min-w-0 flex-col rounded-md border border-slate-200 bg-white p-4">
                      <span className="block text-sm font-bold text-slate-900">Closing Date</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500 sm:min-h-[84px]">TREC rule: use the negotiated closing date stated in Paragraph 9; TREC does not supply a default number of days.</span>
                      <input
                        type="date"
                        value={activeDeal.closingDate}
                        onChange={(event) => updateActiveDeal('closingDate', event.target.value)}
                        className="mt-4"
                      />
                    </label>
                  </div>
                </div>

                <section id="trec-form-workspace" className="mt-7 scroll-mt-24 border border-[#D9D0BF] bg-white" aria-labelledby="official-trec-fields-title">
                  <div className="border-b border-[#D9D0BF] bg-[#F7F3EB] px-5 py-4 sm:px-6">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7059A8]">Transaction Forms</p>
                      <h4 id="official-trec-fields-title" className="mt-1 text-lg font-semibold text-slate-950">
                          TREC {currentTrecFormVersion.formNumber} · {currentTrecFormVersion.title}
                      </h4>
                      </div>
                      <p className="text-xs font-semibold text-slate-600">{currentTrecFormVersion.fields.length} total fillable controls · Effective {currentTrecFormVersion.effectiveDate}</p>
                    </div>
                    <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <p className="max-w-3xl text-sm leading-6 text-slate-600">Complete the contract and attached addenda directly on their official PDFs. Values remain separated by form and are saved with this transaction. Use the Upload &amp; Auto-fill Contract action below to import values.</p>
                    </div>
                    <div
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (extractionState !== 'extracting') setIsContractDropActive(true);
                      }}
                      onDragLeave={() => setIsContractDropActive(false)}
                      onDrop={(event) => {
                        event.preventDefault();
                        setIsContractDropActive(false);
                        void extractContract(event.dataTransfer.files?.[0]);
                      }}
                      className={`mt-4 ${extractionState === 'extracting' ? 'pointer-events-none opacity-70' : ''}`}
                    >
                      <div className="relative w-full sm:w-[290px]">
                        <div
                          className={`flex h-[42px] overflow-hidden rounded-md border text-sm font-bold transition ${
                            isContractDropActive
                              ? 'border-violet-600 bg-violet-100 text-violet-950'
                              : 'border-[#7059A8] bg-white text-[#301D5D]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => contractUploadInputRef.current?.click()}
                            disabled={extractionState === 'extracting'}
                            className="flex min-w-0 flex-1 items-center justify-center gap-2 px-3 transition hover:bg-violet-50"
                          >
                            {extractionState === 'extracting' ? (
                              <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                            ) : (
                              <FileUp className="rnn-inline-icon" aria-hidden="true" />
                            )}
                            <span className="truncate">
                              {extractionState === 'extracting'
                                ? 'Reading contract…'
                                : isContractDropActive
                                  ? 'Drop to upload'
                                  : 'Upload & Auto-fill Contract'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsUploadMenuOpen((isOpen) => !isOpen)}
                            disabled={extractionState === 'extracting'}
                            aria-label="More contract upload options"
                            aria-expanded={isUploadMenuOpen}
                            aria-haspopup="menu"
                            className="flex w-10 shrink-0 items-center justify-center border-l border-[#7059A8] transition hover:bg-violet-50"
                          >
                            <ChevronDown className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>

                        {isUploadMenuOpen && extractionState !== 'extracting' && (
                          <div
                            role="menu"
                            className="absolute right-0 z-20 mt-2 w-[280px] rounded-md border border-slate-200 bg-white p-2 text-left shadow-lg"
                          >
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                contractUploadInputRef.current?.click();
                                setIsUploadMenuOpen(false);
                              }}
                              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-bold text-slate-800 transition hover:bg-violet-50"
                            >
                              <FileUp className="rnn-inline-icon text-[#7059A8]" aria-hidden="true" />
                              Choose PDF or image
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setIsUploadMenuOpen(false);
                                openContractCamera();
                              }}
                              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-bold text-slate-800 transition hover:bg-violet-50"
                            >
                              <Camera className="rnn-inline-icon text-[#7059A8]" aria-hidden="true" />
                              Take a photo
                            </button>
                            <p className="border-t border-slate-100 px-3 pt-2.5 text-xs leading-5 text-slate-500">
                              PDF, PNG, JPG, or WEBP · 15 MB maximum. Your file is read securely, then discarded.
                            </p>
                          </div>
                        )}
                        <input
                          ref={contractUploadInputRef}
                          type="file"
                          accept="application/pdf,image/png,image/jpeg,image/webp"
                          disabled={extractionState === 'extracting'}
                          onChange={async (event) => {
                            const input = event.currentTarget;
                            const file = input.files?.[0];
                            await extractContract(file);
                            input.value = '';
                          }}
                          className="sr-only"
                          tabIndex={-1}
                        />
                        <input
                          ref={contractCameraInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          capture="environment"
                          disabled={extractionState === 'extracting'}
                          onChange={async (event) => {
                            const input = event.currentTarget;
                            const file = input.files?.[0];
                            await extractContract(file);
                            input.value = '';
                          }}
                          className="sr-only"
                          tabIndex={-1}
                        />
                      </div>
                    </div>
                    <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-600">
                      <Save className="rnn-inline-icon text-[#7059A8]" aria-hidden="true" />
                      Progress is saved in your private cloud workspace.
                    </p>
                  </div>
                  <div className="p-6 sm:p-10">
                    <div className="mb-4">
                      <span className="mb-1.5 block text-sm font-bold text-slate-900">Select A TREC Contract Or Form</span>
                      <p className="mb-2 text-xs text-slate-500">Check the forms needed; click a name to fill it in.</p>
                      <div className="max-h-[172px] divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-300 bg-white">
                        {activePacketForms.map((version) => {
                          const isSelected = activeDeal.selectedFormFamilies[version.formFamily] ?? false;
                          const isViewing = version.formFamily === currentTrecFormVersion.formFamily;
                          return (
                            <div
                              key={version.id}
                              className={`flex items-center gap-2 px-2.5 py-1.5 ${isViewing ? 'bg-[#F8F5FF]' : ''}`}
                            >
                              <input
                                type="checkbox"
                                id={`form-family-${version.id}`}
                                checked={isSelected}
                                disabled={isDealLocked(activeDeal)}
                                onChange={(event) => {
                                  updateActiveDeal('selectedFormFamilies', {
                                    ...activeDeal.selectedFormFamilies,
                                    [version.formFamily]: event.target.checked,
                                  });
                                }}
                                className="h-3.5 w-3.5 shrink-0 rounded border-slate-400 text-[#301D5D] focus:ring-[#301D5D] disabled:cursor-not-allowed disabled:opacity-50"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTrecFormFamily(version.formFamily);
                                  setActiveTrecPage(1);
                                }}
                                title={version.title}
                                className={`min-w-0 flex-1 truncate text-left text-xs font-semibold ${isViewing ? 'text-[#301D5D]' : 'text-slate-800 hover:text-[#301D5D]'}`}
                              >
                                {version.formNumber} · {version.title}
                              </button>
                              {isViewing && (
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#301D5D]" aria-label="Currently viewing" title="Currently viewing" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {selectedFormVersions.length > 0 && (
                      <div className="mb-4">
                        <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Selected Forms ({selectedFormVersions.length})</span>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedFormVersions.map((version) => {
                            const isViewing = version.formFamily === currentTrecFormVersion.formFamily;
                            return (
                              <button
                                key={version.id}
                                type="button"
                                title={version.title}
                                onClick={() => {
                                  setActiveTrecFormFamily(version.formFamily);
                                  setActiveTrecPage(1);
                                }}
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${isViewing ? 'border-[#301D5D] bg-[#301D5D] text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-[#301D5D] hover:text-[#301D5D]'}`}
                              >
                                {version.formNumber}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div className="mb-4 flex flex-col gap-3 rounded-md border border-slate-200 bg-[#FCFBF9] p-3 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        type="button"
                        onClick={() => setActiveTrecPage((page) => Math.max(1, page - 1))}
                        disabled={currentTrecPage === 1}
                        className="inline-flex min-h-[42px] min-w-[112px] items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-[#301D5D] hover:bg-[#F8F5FF] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                        Back
                      </button>
                      <div className="min-w-0 text-center">
                        <p className="text-sm font-bold text-slate-950">Page {currentTrecPage} of {currentTrecFormVersion.pageCount}</p>
                        <p className="mt-1 truncate text-xs font-semibold text-slate-600">{currentTrecFormVersion.pageSections[currentTrecPage] ?? `Official TREC page ${currentTrecPage}`}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTrecPage((page) => Math.min(currentTrecFormVersion.pageCount, page + 1))}
                        disabled={currentTrecPage === currentTrecFormVersion.pageCount}
                        className="inline-flex min-h-[42px] min-w-[112px] items-center justify-center gap-2 rounded-md bg-[#301D5D] px-4 text-sm font-bold text-white transition hover:bg-[#42277c] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="mt-7 rounded-md border border-slate-200 bg-slate-100 p-6 sm:p-10 lg:p-14">
                      <div className="mx-auto max-w-[1020px] overflow-hidden border border-slate-300 bg-white shadow-sm">
                        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-2">
                          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-700">Official TREC {currentTrecFormVersion.formNumber} · Page {currentTrecPage}</p>
                          <a href={currentTrecFormVersion.pdfUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-[#5B438C] underline underline-offset-2">Open full form</a>
                        </div>
                        <TrecPdfPagePreview
                          pdfUrl={currentTrecFormVersion.pdfUrl}
                          pageNumber={currentTrecPage}
                          formNumber={currentTrecFormVersion.formNumber}
                          fields={currentTrecFormVersion.fields.filter((field) => field.page === currentTrecPage)}
                          values={currentFormValues}
                          onFieldChange={updateTrecFormField}
                        />
                      </div>
                    </div>
                  </div>
                </section>

              </>
            )}
          </div>
        )}

        {workspacePage === 2 && activeDeals.length > 0 && (
          <section className="mt-6 border border-slate-200 bg-white p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <Building2 className="rnn-heading-icon text-[#7059A8]" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Active Deals</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-950">{activeDeals.length} Transaction{activeDeals.length === 1 ? '' : 's'} In Progress</h3>
              </div>
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
                    <th scope="col" className="py-2 pr-4 font-bold">Transaction</th>
                    <th scope="col" className="py-2 pr-4 font-bold">Stage</th>
                    <th scope="col" className="py-2 pr-4 font-bold">Effective Date</th>
                    <th scope="col" className="py-2 pr-4 font-bold">Closing Date</th>
                    <th scope="col" className="py-2 pr-4 font-bold">Forms</th>
                    <th scope="col" className="py-2 pr-4 font-bold">Tasks</th>
                    <th scope="col" className="py-2 pr-4 font-bold">Reminders</th>
                    <th scope="col" className="py-2 pl-4" aria-label="Open transaction" />
                  </tr>
                </thead>
                <tbody>
                  {activeDeals.map((deal) => (
                    <tr
                      key={deal.id}
                      onClick={() => {
                        focusDeal(deal.id);
                        setFormsStatusDealId(deal.id);
                      }}
                      className={`cursor-pointer border-b border-slate-100 transition last:border-0 hover:bg-[#F8F5FF] ${deal.id === activeDealId ? 'bg-[#F8F5FF]' : ''}`}
                    >
                      <td className="py-3 pr-4">
                        <span className="block font-semibold text-slate-900">{deal.propertyAddress || deal.title}</span>
                        {(deal.buyerNames || deal.sellerNames) && (
                          <span className="mt-0.5 block text-xs text-slate-500">{[deal.buyerNames, deal.sellerNames].filter(Boolean).join(' · ')}</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{TREC_DEAL_WORKFLOW_STATUS_LABELS[deal.workflowStatus]}</span>
                      </td>
                      <td className="py-3 pr-4 text-slate-700">{deal.effectiveDate ? formatDate(deal.effectiveDate) : '—'}</td>
                      <td className="py-3 pr-4 text-slate-700">{deal.closingDate ? formatDate(deal.closingDate) : '—'}</td>
                      <td className="py-3 pr-4">
                        {(() => {
                          const dealFormVersions = activePacketForms.filter((version) => deal.selectedFormFamilies[version.formFamily]);
                          if (dealFormVersions.length === 0) return <span className="text-slate-400">—</span>;
                          return (
                            <span
                              title={dealFormVersions.map((version) => version.formNumber).join(', ')}
                              className="inline-flex rounded-md bg-[#F8F5FF] px-2 py-1 text-xs font-bold text-[#5B438C]"
                            >
                              {dealFormVersions.length} form{dealFormVersions.length === 1 ? '' : 's'}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-3 pr-4">
                        {(() => {
                          if (deal.tasks.length === 0) return <span className="text-slate-400">—</span>;
                          const openCount = deal.tasks.filter((task) => !task.complete).length;
                          const doneCount = deal.tasks.length - openCount;
                          return (
                            <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                              {openCount} open / {doneCount} done
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-3 pr-4">
                        {(() => {
                          if (deal.reminders.length === 0) return <span className="text-slate-400">—</span>;
                          const openCount = deal.reminders.filter((reminder) => !reminder.complete).length;
                          const doneCount = deal.reminders.length - openCount;
                          return (
                            <span className="inline-flex rounded-md bg-[#FFF9E7] px-2 py-1 text-xs font-bold text-[#855D10]">
                              {openCount} open / {doneCount} done
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-3 pl-4 text-right">
                        <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {workspacePage === 2 && closedDeals.length > 0 && (
          <section className="mt-6 border border-slate-200 bg-white p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <Lock className="rnn-heading-icon text-[#7059A8]" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Closed & Audit</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-950">{closedDeals.length} Closed Transaction{closedDeals.length === 1 ? '' : 's'}</h3>
              </div>
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
                    <th scope="col" className="py-2 pr-4 font-bold">Transaction</th>
                    <th scope="col" className="py-2 pr-4 font-bold">Outcome</th>
                    <th scope="col" className="py-2 pr-4 font-bold">Closing Date</th>
                    <th scope="col" className="py-2 pr-4 font-bold">Forms</th>
                    <th scope="col" className="py-2 pl-4" aria-label="Open transaction" />
                  </tr>
                </thead>
                <tbody>
                  {closedDeals.map((deal) => (
                    <tr
                      key={deal.id}
                      onClick={() => {
                        focusDeal(deal.id);
                        setFormsStatusDealId(deal.id);
                      }}
                      className={`cursor-pointer border-b border-slate-100 transition last:border-0 hover:bg-[#F8F5FF] ${deal.id === activeDealId ? 'bg-[#F8F5FF]' : ''}`}
                    >
                      <td className="py-3 pr-4">
                        <span className="flex items-center gap-1.5 font-semibold text-slate-900">
                          <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                          {deal.propertyAddress || deal.title}
                        </span>
                        {(deal.buyerNames || deal.sellerNames) && (
                          <span className="mt-0.5 block text-xs text-slate-500">{[deal.buyerNames, deal.sellerNames].filter(Boolean).join(' · ')}</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-bold capitalize text-slate-700">{deal.closeoutOutcome}</span>
                      </td>
                      <td className="py-3 pr-4 text-slate-700">{deal.closeoutDate ? formatDate(deal.closeoutDate) : '—'}</td>
                      <td className="py-3 pr-4">
                        {(() => {
                          const dealFormVersions = activePacketForms.filter((version) => deal.selectedFormFamilies[version.formFamily]);
                          if (dealFormVersions.length === 0) return <span className="text-slate-400">—</span>;
                          return (
                            <span
                              title={dealFormVersions.map((version) => version.formNumber).join(', ')}
                              className="inline-flex rounded-md bg-[#F8F5FF] px-2 py-1 text-xs font-bold text-[#5B438C]"
                            >
                              {dealFormVersions.length} form{dealFormVersions.length === 1 ? '' : 's'}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-3 pl-4 text-right">
                        <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {formsStatusDealId && (() => {
          const statusDeal = deals.find((deal) => deal.id === formsStatusDealId);
          if (!statusDeal) return null;
          const statusFormVersions = activePacketForms.filter((version) => statusDeal.selectedFormFamilies[version.formFamily]);
          const STATUS_META = {
            completed: { label: 'Completed', icon: CheckCircle2, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
            needs_attention: { label: 'Needs Attention', icon: AlertTriangle, className: 'bg-amber-50 text-amber-700 border-amber-200' },
            not_started: { label: 'Not Started', icon: Circle, className: 'bg-slate-100 text-slate-600 border-slate-200' },
          } as const;
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
              onClick={() => setFormsStatusDealId(null)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Transaction forms status"
                onClick={(event) => event.stopPropagation()}
                className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-md border border-slate-200 bg-white shadow-xl"
              >
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7059A8]">{isDealLocked(statusDeal) ? 'Closed & Audit' : 'Transaction Forms'}</p>
                    <h4 className="mt-0.5 text-lg font-semibold text-slate-950">{statusDeal.propertyAddress || statusDeal.title}</h4>
                  </div>
                  <div className="flex items-center gap-2">
                    {isDealLocked(statusDeal) && (
                      <button
                        type="button"
                        onClick={() => exportBackupRecord(statusDeal)}
                        title="Download backup record"
                        aria-label="Download backup record"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#7059A8] text-[#301D5D] hover:bg-[#F8F5FF]"
                      >
                        <Download className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setFormsStatusDealId(null)}
                      aria-label="Close"
                      className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    >
                      <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <div className="p-5">
                  {statusFormVersions.length === 0 ? (
                    <p className="text-sm text-slate-600">No forms have been selected for this transaction yet. Check off forms in Transaction Forms to add them here.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {statusFormVersions.map((version) => {
                        const status = dealFormStatus(statusDeal, version);
                        const meta = STATUS_META[status];
                        const StatusIcon = meta.icon;
                        return (
                          <li key={version.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveDealId(statusDeal.id);
                                setActiveTrecFormFamily(version.formFamily);
                                setActiveTrecPage(1);
                                setFormsStatusDealId(null);
                                window.setTimeout(() => document.getElementById('trec-form-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
                              }}
                              className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:bg-[#F8F5FF]"
                            >
                              <span className="min-w-0 truncate text-sm font-semibold text-slate-800">{version.formNumber} · {version.title}</span>
                              <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${meta.className}`}>
                                <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                                {meta.label}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {(() => {
                    const taskOpen = statusDeal.tasks.filter((task) => !task.complete).length;
                    const taskDone = statusDeal.tasks.length - taskOpen;
                    const reminderOpen = statusDeal.reminders.filter((reminder) => !reminder.complete).length;
                    const reminderDone = statusDeal.reminders.length - reminderOpen;
                    return (
                      <div className="mt-5 grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-2">
                        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Tasks</p>
                          <p className="mt-1 text-sm font-bold text-slate-800">
                            {statusDeal.tasks.length === 0 ? 'No tasks yet' : `${taskOpen} open / ${taskDone} done`}
                          </p>
                        </div>
                        <div className="rounded-md border border-[#E7C769] bg-[#FFF9E7] p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#855D10]">Reminders</p>
                          <p className="mt-1 text-sm font-bold text-[#855D10]">
                            {statusDeal.reminders.length === 0 ? 'No reminders yet' : `${reminderOpen} open / ${reminderDone} done`}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          );
        })()}

        {workspacePage === 2 && activeDeal && (
          <>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <ListTodo className="rnn-heading-icon text-[#7059A8]" aria-hidden="true" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Action list</p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-950">Tasks and Reminders</h3>
                </div>
              </div>
              <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2">
                <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} className="min-h-[44px] min-w-0 w-full border border-slate-300 px-3 text-sm outline-none focus:border-[#301D5D]" placeholder="Add a transaction task" />
                <input type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} aria-label="Task due date" className="min-h-[44px] min-w-0 w-full border border-slate-300 px-3 text-sm outline-none focus:border-[#301D5D]" />
                <select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as TrecTaskPriority)} aria-label="Task priority" className="min-h-[44px] min-w-0 w-full border border-slate-300 bg-white px-2 text-sm outline-none focus:border-[#301D5D]">{TREC_TASK_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select>
                <button type="button" onClick={addTask} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-[#301D5D] px-4 text-sm font-bold text-white"><Plus className="rnn-inline-icon" aria-hidden="true" />Add</button>
              </div>
              <div className="mt-4 grid min-w-0 gap-2 border-y border-slate-100 py-4 sm:grid-cols-2">
                <select value={reminderDeadlineId} onChange={(event) => setReminderDeadlineId(event.target.value)} aria-label="Reminder deadline" className="min-h-[42px] min-w-0 w-full border border-slate-300 bg-white px-2 text-sm"><option value="">Custom reminder deadline</option>{activeDeadlines.map((deadline) => <option key={deadline.id} value={deadline.id}>{deadline.label}</option>)}</select>
                <input type="date" value={reminderDate} onChange={(event) => setReminderDate(event.target.value)} aria-label="Custom reminder date" className="min-h-[42px] min-w-0 w-full border border-slate-300 px-2 text-sm" />
                <input value={reminderNote} onChange={(event) => setReminderNote(event.target.value)} aria-label="Custom reminder note" className="min-h-[42px] min-w-0 w-full border border-slate-300 px-3 text-sm" placeholder="Reminder note (optional)" />
                <button type="button" onClick={addCustomReminder} disabled={!reminderDeadlineId || !reminderDate} className="inline-flex min-h-[42px] items-center justify-center rounded-md border border-[#7059A8] px-4 text-sm font-bold text-[#301D5D] disabled:opacity-40">Add reminder</button>
              </div>
              <div className="mt-5 space-y-2">
                {!activeDeal.tasks.length && !activeDeal.reminders.length ? <p className="border border-dashed border-slate-300 bg-[#FCFBF9] p-4 text-sm text-slate-600">Use deadline presets (7d, 3d, 1d, due) in the review step or add a custom action here.</p> : <>
                  {activeDeal.reminders.map((reminder) => <div key={reminder.id} className="flex flex-wrap items-center gap-3 border border-[#E7C769] bg-[#FFF9E7] p-3"><button type="button" onClick={() => updateReminder(reminder.id, { complete: !reminder.complete })} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${reminder.complete ? 'border-[#301D5D] bg-[#301D5D] text-white' : 'border-[#A97A1A] bg-white text-transparent'}`} aria-label={`Mark ${reminder.label} reminder ${reminder.complete ? 'incomplete' : 'complete'}`}><Check className="h-3.5 w-3.5" aria-hidden="true" /></button><span className={`min-w-0 flex-1 text-sm font-semibold ${reminder.complete ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{reminder.label}{reminder.note ? <span className="block text-xs font-normal text-slate-600">{reminder.note}</span> : null}</span><span className="text-xs font-bold text-[#855D10]">{formatDate(reminder.reminderDate)}</span></div>)}
                  {activeDeal.tasks.map((task) => <div key={task.id} className="flex flex-wrap items-center gap-3 border border-slate-200 p-3"><button type="button" onClick={() => updateTask(task.id, { status: task.status === 'done' ? 'todo' : 'done', complete: task.status !== 'done' })} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${task.complete ? 'border-[#301D5D] bg-[#301D5D] text-white' : 'border-slate-400 bg-white text-transparent'}`} aria-label={`Mark ${task.title} ${task.complete ? 'incomplete' : 'complete'}`}><Check className="h-3.5 w-3.5" aria-hidden="true" /></button><span className={`min-w-0 flex-1 text-sm font-semibold ${task.complete ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{task.title}</span><span className={`rounded-md px-2 py-1 text-xs font-bold ${task.priority === 'critical' ? 'bg-red-100 text-red-800' : task.priority === 'high' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{task.priority}</span><select value={task.status} onChange={(event) => { const status = event.target.value as TrecTaskStatus; updateTask(task.id, { status, complete: status === 'done' || status === 'skipped' }); }} aria-label={`Status for ${task.title}`} className="min-h-[34px] border border-slate-300 bg-white px-2 text-xs font-semibold">{TREC_TASK_STATUSES.map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}</select>{task.dueDate && <span className={`text-xs font-bold ${task.dueDate < today && !task.complete ? 'text-[#B6402C]' : 'text-slate-500'}`}>{formatDate(task.dueDate)}</span>}{!isDealLocked(activeDeal) && <button type="button" onClick={() => removeTask(task.id)} className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-slate-400 transition hover:text-[#9A3D2B]" aria-label={`Remove ${task.title}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}</div>)}
                </>}
              </div>
            </div>

            <ReadinessChecklist
              documents={activeDeal.documents}
              documentName={documentName}
              setDocumentName={setDocumentName}
              addDocument={addDocument}
              updateDocument={updateDocument}
              reviewAlerts={reviewAlerts}
            />
          </div>
          <section className="mt-6 border border-slate-200 bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {isDealLocked(activeDeal) ? <Lock className="rnn-heading-icon text-[#7059A8]" aria-hidden="true" /> : <History className="rnn-heading-icon text-[#7059A8]" aria-hidden="true" />}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">{isDealLocked(activeDeal) ? 'Closed & audit' : 'Closeout and history'}</p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-950">
                    {isDealLocked(activeDeal) ? `${activeDeal.propertyAddress || activeDeal.title}, Closed & Audit` : 'Outcome, Record, and Export'}
                  </h3>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={exportTextSummary} className="inline-flex min-h-[40px] items-center gap-2 rounded-md border border-[#7059A8] px-4 text-sm font-bold text-[#301D5D]"><Download className="h-4 w-4" aria-hidden="true" />Download summary</button>
                {isDealLocked(activeDeal) && (
                  <button type="button" onClick={() => exportBackupRecord(activeDeal)} className="inline-flex min-h-[40px] items-center gap-2 rounded-md bg-[#301D5D] px-4 text-sm font-bold text-white"><Download className="h-4 w-4" aria-hidden="true" />Download backup record</button>
                )}
              </div>
            </div>
            {isDealLocked(activeDeal) && (
              <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#5B438C]">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                Closed on {formatDate(activeDeal.closeoutDate)}. Per TREC Rules 535.2(h) and 535.146, this record is locked and retained for at least four years from the closing date — tasks and this transaction can no longer be removed.
              </p>
            )}
            {Boolean(activeDeal.closeoutOutcome) && !isDealFullyComplete(activeDeal) && (
              <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#9A6B1A]">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Outcome set to {activeDeal.closeoutOutcome}, but this transaction stays in Transactions In Progress and unlocked until every task, reminder, and readiness document is marked complete.
              </p>
            )}
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <select value={activeDeal.closeoutOutcome} onChange={(event) => updateActiveDeal('closeoutOutcome', event.target.value)} disabled={isDealLocked(activeDeal)} aria-label="Closeout outcome" className="min-h-[44px] border border-slate-300 bg-white px-3 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"><option value="">Closeout outcome</option><option value="closed">Closed</option><option value="cancelled">Cancelled</option><option value="withdrawn">Withdrawn</option><option value="expired">Expired</option></select>
              <input type="date" value={activeDeal.closeoutDate} onChange={(event) => updateActiveDeal('closeoutDate', event.target.value)} disabled={isDealLocked(activeDeal)} aria-label="Closeout date" className="min-h-[44px] border border-slate-300 px-3 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500" />
              <input value={activeDeal.closeoutNote} onChange={(event) => updateActiveDeal('closeoutNote', event.target.value)} disabled={isDealLocked(activeDeal)} aria-label="Closeout note" className="min-h-[44px] border border-slate-300 px-3 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500" placeholder="Closeout note" />
            </div>
            <ul className="mt-5 max-h-52 space-y-2 overflow-auto">{[...activeDeal.activity].reverse().map((item) => <li key={item.id} className="border-l-2 border-[#E7C769] bg-[#FCFBF9] px-3 py-2 text-sm text-slate-700"><span className="font-bold text-slate-900">{formatTimestamp(item.createdAt)}</span> · {item.message}</li>)}</ul>
          </section>
          </>
        )}

        {isCameraOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="contract-camera-title"
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4"
          >
            <div className="w-full max-w-2xl rounded-md bg-white p-4 shadow-2xl sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="contract-camera-title" className="text-xl font-semibold text-slate-950">Take a Contract Photo</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">Place the page inside the frame and keep all text in focus.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCameraOpen(false)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-300 text-xl text-slate-700 transition hover:bg-slate-100"
                  aria-label="Close camera"
                >
                  ×
                </button>
              </div>

              <div className="mt-4 overflow-hidden rounded-md bg-slate-950">
                <video
                  ref={cameraVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="aspect-[4/3] w-full object-contain"
                />
              </div>

              {cameraError && (
                <p role="alert" className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">
                  {cameraError}
                </p>
              )}

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setIsCameraOpen(false)}
                  className="inline-flex h-[42px] items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    contractCameraInputRef.current?.click();
                    setIsCameraOpen(false);
                  }}
                  className="inline-flex h-[42px] items-center justify-center rounded-md border border-[#7059A8] bg-white px-4 text-sm font-bold text-[#301D5D] transition hover:bg-violet-50"
                >
                  Device camera
                </button>
                <button
                  type="button"
                  onClick={captureContractPhoto}
                  disabled={Boolean(cameraError)}
                  className="inline-flex h-[42px] items-center justify-center gap-2 rounded-md bg-[#301D5D] px-4 text-sm font-bold text-white transition hover:bg-[#42277c] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Camera className="rnn-inline-icon" aria-hidden="true" />
                  Take picture
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
