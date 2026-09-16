'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Camera,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  FileText,
  FileUp,
  History,
  ListTodo,
  LoaderCircle,
  Mail,
  Plus,
  Save,
  Smartphone,
  Trash2,
} from 'lucide-react';
import PushOptInButton from '@/components/PushOptInButton';
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
  type AgentDealStatus,
  type AgentNotificationPreferences,
  type AgentReminder,
  type AgentTask,
  type AgentDocument,
  type AgentActivity,
} from '@/lib/agent-command-center-workspace';
import { calculateTrecDeadlines, type TrecDeadline } from '@/lib/trec-deadlines';
import {
  buildTrecValidation,
  TREC_DEAL_WORKFLOW_STATUS_LABELS,
  TREC_REMINDER_PRESET_OFFSETS,
  TREC_TASK_PRIORITIES,
  TREC_TASK_STATUSES,
  TREC_WORKFLOW_STAGE_LABELS,
  TREC_WORKFLOW_STAGES,
  type TrecDealWorkflowStatus,
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

const STATUS_LABELS: Record<AgentDealStatus, string> = {
  prep: 'Deal prep',
  active: 'Under contract',
  closing: 'Closing',
  completed: 'Completed',
};

const DOCUMENT_TEMPLATES = [
  ['executed-contract', 'Executed TREC contract'],
  ['financing-addendum', 'Financing addendum, if applicable'],
  ['seller-disclosure', 'Seller disclosure'],
  ['title-commitment', 'Title commitment'],
  ['survey', 'Survey or survey election'],
  ['delivery-confirmation', 'Earnest and option delivery confirmation'],
] as const;

const ADDENDA = [
  'Third-Party Financing Addendum',
  'HOA Addendum',
  'Seller’s Disclosure',
  'Lead-Based Paint Addendum',
  'Non-Realty Items Addendum',
  'Temporary Lease Addendum',
  'Back-Up Contract Addendum',
  'VA Loan Addendum',
  'PID / MUD Notice',
] as const;

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

const WORKSHEET_STEPS = TREC_WORKFLOW_STAGES.map((id) => ({ id, label: TREC_WORKFLOW_STAGE_LABELS[id] }));

const CONTRACT_FIELD_STEPS: Partial<Record<keyof AgentContractDetails, number>> = {
  county: 0, legalDescription: 0, improvementsAndAccessories: 0, exclusions: 0,
  cashPortion: 1, loanAmount: 1, salesPrice: 1, financingType: 1, financingNotes: 1,
  earnestMoney: 2, titleCompany: 2, optionFee: 2, additionalEarnestMoney: 2,
  titlePolicyPayer: 3, surveyPlan: 3, titleAndSurveyNotes: 3, conditionAndRepairNotes: 3, possessionPlan: 3,
  specialProvisionsNotes: 4, settlementNotes: 4, notices: 4,
};
const TIMING_FIELDS: ReadonlyArray<{ key: keyof AgentDeal; label: string; type: 'date' | 'number'; step: number }> = [
  { key: 'effectiveDate', label: 'Effective date', type: 'date', step: 0 },
  { key: 'financingDeadlineDays', label: 'Financing days', type: 'number', step: 1 },
  { key: 'appraisalDeadlineDays', label: 'Appraisal days', type: 'number', step: 1 },
  { key: 'optionPeriodDays', label: 'Option period days', type: 'number', step: 2 },
  { key: 'additionalEarnestMoneyDays', label: 'Additional earnest days', type: 'number', step: 2 },
  { key: 'earnestMoneyDeliveredDate', label: 'Earnest money actual delivery', type: 'date', step: 2 },
  { key: 'optionFeeDeliveredDate', label: 'Option fee actual delivery', type: 'date', step: 2 },
  { key: 'titleCommitmentDays', label: 'Title commitment days', type: 'number', step: 3 },
  { key: 'surveyDays', label: 'Survey days', type: 'number', step: 3 },
  { key: 'titleObjectionDays', label: 'Title objection days', type: 'number', step: 3 },
  { key: 'closingDate', label: 'Closing date', type: 'date', step: 3 },
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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function newDeal(): AgentDeal {
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
    closeoutOutcome: '',
    closeoutDate: '',
    closeoutNote: '',
    contractDetails: defaultAgentContractDetails(),
    addenda: {},
    reminders: [],
    tasks: [],
    documents: DOCUMENT_TEMPLATES.map(([id, label]) => ({ id, label, status: 'requested' as const, complete: false, requestedAt: now, updatedAt: now })),
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

function deadlineColor(deadline: TrecDeadline): string {
  if (deadline.category === 'money') return 'border-[#E7C769] bg-[#FFF9E7]';
  if (deadline.category === 'option') return 'border-[#CFC4E8] bg-[#F8F5FF]';
  return 'border-slate-200 bg-white';
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
  link.click();
  URL.revokeObjectURL(url);
}

type SyncState = 'loading' | 'ready' | 'saving' | 'conflict' | 'error';

export default function AgentDealDesk({
  workspaceKey,
  realtorId,
  initialWorkspace,
  initialWorkspaceVersion,
  panelsOnly = false,
}: {
  workspaceKey: string;
  realtorId: string;
  initialWorkspace: AgentCommandCenterWorkspace | null;
  initialWorkspaceVersion: number | null;
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
  const [workspacePage, setWorkspacePage] = useState<1 | 2>(1);
  const versionRef = useRef<number | null>(initialWorkspaceVersion);
  const syncTimerRef = useRef<number | null>(null);
  const saveInFlightRef = useRef(false);
  const queuedWorkspaceRef = useRef<AgentCommandCenterWorkspace | null>(null);

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

    queueMicrotask(() => {
      if (cancelled) return;
      versionRef.current = initialWorkspaceVersion;
      setDeals(startingWorkspace.deals);
      setNotificationPreferences(startingWorkspace.notificationPreferences);
      setActiveDealId(startingWorkspace.deals[0]?.id ?? null);
      setReady(true);
      setSyncState(cloudWorkspace ? 'ready' : 'loading');
    });

    if (cloudWorkspace) {
      window.localStorage.removeItem(workspaceKey);
    } else if (legacyDeals.length) {
      window.setTimeout(() => {
        if (!cancelled) void saveToCloud(startingWorkspace);
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
  }, []);

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
    const deal = newDeal();
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
    setExtractionState('extracting');
    setExtractionError('');
    setExtractionWarnings([]);
    try {
      const formData = new FormData();
      formData.append('contract', file);
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
        addenda: Object.fromEntries(Object.entries(record.addenda).filter(([, value]) => typeof value === 'boolean')) as Record<string, boolean>,
        warnings: Array.isArray(record.warnings) ? record.warnings.filter((warning): warning is string => typeof warning === 'string') : [],
      });
      setExtractionWarnings(Array.isArray(record.warnings) ? record.warnings.filter((warning): warning is string => typeof warning === 'string') : []);
      setExtractionState('ready');
      trackEvent('agent_deal_desk_contract_extracted');
    } catch (error) {
      setExtractionError(error instanceof Error ? error.message : 'Could not read this contract.');
      setExtractionState('error');
    }
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
      title: extractionDraft.title || worksheet.propertyAddress || activeDeal.title,
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
      addenda: { ...activeDeal.addenda, ...extractionDraft.addenda },
      updatedAt: new Date().toISOString(),
      activity: [...activeDeal.activity, { id: getId('activity'), message: 'Applied reviewed contract extraction suggestions', createdAt: new Date().toISOString() }].slice(-300),
    };
    persistDeals(deals.map((deal) => deal.id === activeDeal.id ? nextDeal : deal));
    setExtractionDraft(null);
    setExtractionState('idle');
    trackEvent('agent_deal_desk_contract_suggestions_applied');
  };

  const updateContractDetail = (key: keyof AgentContractDetails, value: string) => {
    if (!activeDeal) return;
    updateActiveDeal('contractDetails', { ...activeDeal.contractDetails, [key]: value });
  };

  const toggleAddendum = (addendum: string) => {
    if (!activeDeal) return;
    updateActiveDeal('addenda', {
      ...activeDeal.addenda,
      [addendum]: !activeDeal.addenda[addendum],
    });
  };

  const addReminder = (deadline: TrecDeadline, preset: '7d' | '3d' | '1d' | 'due' = '1d') => {
    if (!activeDeal) return;
    const offset = TREC_REMINDER_PRESET_OFFSETS.find((item) => item.id === preset)?.daysBefore ?? 1;
    const proposedDate = addDays(deadline.date, -offset);
    const reminder: AgentReminder = {
      id: getId('reminder'), deadlineId: deadline.id, label: deadline.label, deadlineDate: deadline.date,
      reminderDate: proposedDate < today ? today : proposedDate, note: '', preset, complete: false,
    };
    applyActiveAction(`Added ${preset === 'due' ? 'due-date' : `${offset}-day`} reminder for ${deadline.label}`, { reminders: [...activeDeal.reminders, reminder] });
    trackEvent('agent_deal_desk_reminder_added', { deadline: deadline.id, preset });
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
    if (!activeDeal) return;
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

  const setWorksheetStep = (step: number) => {
    if (!activeDeal || step < 0 || step >= WORKSHEET_STEPS.length) return;
    applyActiveAction(`Moved to worksheet step ${step + 1}: ${WORKSHEET_STEPS[step].label}`, { worksheetStep: step });
  };

  const exportTextSummary = () => {
    if (!activeDeal) return;
    downloadTextSummary(activeDeal);
    trackEvent('agent_deal_desk_text_summary_exported');
  };

  const saveProgress = () => {
    if (!ready) return;
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    const now = new Date().toISOString();
    const nextDeals = activeDeal ? deals.map((deal) => deal.id === activeDeal.id ? {
      ...deal, updatedAt: now, activity: [...deal.activity, { id: getId('activity'), message: `Saved worksheet progress (step ${deal.worksheetStep + 1} of 6)`, createdAt: now }].slice(-300),
    } : deal) : deals;
    setDeals(nextDeals);
    void saveToCloud({ deals: nextDeals, notificationPreferences });
    trackEvent('agent_deal_desk_progress_saved');
  };

  if (panelsOnly) {
    return (
      <section id="agent-deal-tools" className="bg-[#F7F5F1]">
        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-10">
          <div className="grid items-stretch gap-5 border border-[#D9D0BF] bg-[#FFFDF8] p-5 lg:grid-cols-3 lg:p-6">
            <div className="order-1 h-full border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <Bell className="mt-0.5 h-5 w-5 shrink-0 text-[#7059A8]" aria-hidden="true" />
                <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Date Radar</p><h2 className="mt-2 text-xl font-semibold tracking-[-0.025em] text-slate-950">Next {radarWindowDays} days</h2></div>
              </div>
              <div className="mt-5 space-y-2">
                {!radarItems.length ? <div className="border border-dashed border-slate-300 bg-white p-5 text-sm leading-6 text-slate-600">Add a transaction, effective date, and closing date to set this Date Radar window.</div> : radarItems.map((item) => (
                  <button type="button" key={item.id} onClick={() => focusDeal(item.dealId)} className="flex w-full items-center gap-3 border border-slate-200 bg-white p-3 text-left transition hover:border-[#7059A8]">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-md ${item.overdue ? 'bg-[#B6402C]' : item.kind === 'deadline' ? 'bg-[#7059A8]' : 'bg-[#C88A14]'}`} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-900">{item.label}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{item.dealTitle}</span></span>
                    <span className={`text-right text-xs font-bold ${item.overdue ? 'text-[#B6402C]' : 'text-slate-700'}`}>{item.overdue ? 'Overdue' : formatDate(item.date)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="order-2 h-full border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-[#7059A8]" aria-hidden="true" />
                <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Calendar</p><h2 className="mt-1 text-xl font-semibold text-slate-950">Take your deadlines with you</h2></div>
              </div>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">Download calendar files for the active deal or every active transaction. Each export includes calculated contract dates, closing dates, open reminders, and open tasks.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={exportActiveDealCalendar} disabled={!activeDeal || !calendarEventsForDeal(activeDeal).length} className="inline-flex min-h-[42px] items-center gap-2 rounded-md bg-[#301D5D] px-4 text-sm font-bold text-white transition hover:bg-[#42277c] disabled:cursor-not-allowed disabled:opacity-45"><Download className="h-4 w-4" aria-hidden="true" />Export this deal</button>
                <button type="button" onClick={exportAllDealsCalendar} disabled={!deals.some((deal) => deal.status !== 'completed' && calendarEventsForDeal(deal).length)} className="inline-flex min-h-[42px] items-center gap-2 rounded-md border border-[#7059A8] bg-white px-4 text-sm font-bold text-[#301D5D] transition hover:bg-[#F8F5FF] disabled:cursor-not-allowed disabled:opacity-45"><CalendarDays className="h-4 w-4" aria-hidden="true" />Export active deals</button>
              </div>
            </div>
            <div className="order-3 h-full border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <Bell className="mt-0.5 h-5 w-5 shrink-0 text-[#7059A8]" aria-hidden="true" />
                <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Deadline alerts</p><h2 className="mt-1 text-xl font-semibold text-slate-950">Choose how you are notified</h2></div>
              </div>
              <div className="mt-4 space-y-3">
                <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-slate-800"><input type="checkbox" checked={notificationPreferences.emailEnabled} onChange={(event) => updateNotificationPreferences({ emailEnabled: event.target.checked })} className="h-4 w-4 accent-[#301D5D]" /><Mail className="h-4 w-4 text-[#7059A8]" aria-hidden="true" />Send deadline alerts by email</label>
                <div className="flex flex-wrap items-center gap-3"><label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-slate-800"><input type="checkbox" checked={notificationPreferences.pushEnabled} onChange={(event) => updateNotificationPreferences({ pushEnabled: event.target.checked })} className="h-4 w-4 accent-[#301D5D]" /><Smartphone className="h-4 w-4 text-[#7059A8]" aria-hidden="true" />Send browser push alerts</label><PushOptInButton realtorId={realtorId} label="Connect this device" className="inline-flex min-h-[36px] items-center rounded-md border border-[#7059A8] bg-white px-3 text-xs font-bold text-[#301D5D] transition hover:bg-[#F8F5FF]" /></div>
                <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
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
              <h2 className="text-xl font-semibold text-slate-950">Set up your first transaction</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">Create a secure transaction to manage tasks, documents, and closeout history here.</p>
              <button type="button" onClick={createDeal} className="mt-5 inline-flex min-h-[42px] items-center gap-2 rounded-md bg-[#301D5D] px-4 text-sm font-bold text-white">
                Create transaction <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="border border-slate-200 bg-white p-5 sm:p-6">
                  <div className="flex items-center gap-2">
                    <ListTodo className="h-5 w-5 text-[#7059A8]" aria-hidden="true" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Action list</p>
                      <h2 className="mt-1 text-xl font-semibold text-slate-950">Tasks and reminders</h2>
                    </div>
                  </div>
                  <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2">
                    <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} className="min-h-[44px] min-w-0 w-full border border-slate-300 px-3 text-sm outline-none focus:border-[#301D5D]" placeholder="Add a transaction task" />
                    <input type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} aria-label="Task due date" className="min-h-[44px] min-w-0 w-full border border-slate-300 px-3 text-sm outline-none focus:border-[#301D5D]" />
                    <select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as TrecTaskPriority)} aria-label="Task priority" className="min-h-[44px] min-w-0 w-full border border-slate-300 bg-white px-2 text-sm outline-none focus:border-[#301D5D]">{TREC_TASK_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select>
                    <button type="button" onClick={addTask} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-[#301D5D] px-4 text-sm font-bold text-white"><Plus className="h-4 w-4" aria-hidden="true" />Add</button>
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

                <div className="border border-slate-200 bg-white p-5 sm:p-6">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-[#7059A8]" aria-hidden="true" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Readiness check</p>
                      <h2 className="mt-1 text-xl font-semibold text-slate-950">Document checklist</h2>
                    </div>
                  </div>
                  <div className="mt-5 flex gap-2"><input value={documentName} onChange={(event) => setDocumentName(event.target.value)} className="min-h-[42px] min-w-0 flex-1 border border-slate-300 px-3 text-sm" placeholder="Custom document request" /><button type="button" onClick={addDocument} disabled={!documentName.trim()} className="inline-flex min-h-[42px] items-center rounded-md border border-[#7059A8] px-4 text-sm font-bold text-[#301D5D] disabled:opacity-40">Request</button></div>
                  <div className="mt-4 space-y-2">
                    {activeDeal.documents.map((document) => <div key={document.id} className="flex flex-wrap items-center gap-3 border border-slate-200 p-3"><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${document.complete ? 'border-[#301D5D] bg-[#301D5D] text-white' : 'border-slate-400 bg-white text-transparent'}`}><Check className="h-3.5 w-3.5" aria-hidden="true" /></span><span className={`min-w-0 flex-1 text-sm font-semibold ${document.complete ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{document.label}</span><select value={document.status} onChange={(event) => updateDocument(document.id, event.target.value as AgentDocument['status'])} aria-label={`Status for ${document.label}`} className="min-h-[34px] border border-slate-300 bg-white px-2 text-xs font-semibold"><option value="requested">Requested</option><option value="received">Received</option><option value="reviewed">Reviewed</option><option value="not_needed">Not needed</option></select></div>)}
                  </div>
                  <div className="mt-5 border-t border-slate-200 pt-5">
                    <p className="text-sm font-semibold text-slate-800">Operational review alerts</p>
                    {reviewAlerts.length ? <ul className="mt-3 space-y-2">{reviewAlerts.slice(0, 4).map((alert) => <li key={alert} className="flex gap-2 text-sm leading-5 text-slate-600"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B6402C]" aria-hidden="true" />{alert}</li>)}</ul> : <p className="mt-2 flex items-center gap-2 text-sm text-[#38643A]"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />No worksheet alerts for your active transactions.</p>}
                  </div>
                </div>
              </div>
              <section className="mt-6 border border-slate-200 bg-white p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><History className="h-5 w-5 text-[#7059A8]" aria-hidden="true" /><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Closeout and history</p><h2 className="mt-1 text-xl font-semibold text-slate-950">Outcome, record, and export</h2></div></div><button type="button" onClick={exportTextSummary} className="inline-flex min-h-[40px] items-center gap-2 rounded-md border border-[#7059A8] px-4 text-sm font-bold text-[#301D5D]"><Download className="h-4 w-4" aria-hidden="true" />Download summary</button></div>
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
              Turn contract terms into a working desk with live timing, task and document checks, and an in-app Date Radar across your active transactions.
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-start gap-3 border border-[#D9D0BF] bg-[#FFFDF8] px-4 py-3 text-sm leading-6 text-slate-600">
          <Save className="mt-0.5 h-4 w-4 shrink-0 text-[#7059A8]" aria-hidden="true" />
          <p>
            <span className="font-semibold text-slate-900">{ready ? syncMessage : 'Loading your secure workspace.'}</span>{' '}
            Verify all dates against the signed contract and your broker&apos;s process.
          </p>
        </div>

        <nav aria-label="Deal Desktop pages" className="mt-5 border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7059A8]">
              {workspacePage === 1 ? 'Page 1 of 2' : `Worksheet step ${activeDeal ? activeDeal.worksheetStep + 1 : 1} of ${WORKSHEET_STEPS.length}`}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {workspacePage === 1
                ? 'Overview, Date Radar, calendar and alerts'
                : activeDeal
                  ? WORKSHEET_STEPS[activeDeal.worksheetStep].label
                  : 'Transaction details, upload, tasks and documents'}
            </p>
          </div>
          {workspacePage === 2 ? (
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
              className={extractionState === 'extracting' ? 'pointer-events-none opacity-70' : ''}
            >
              <div className="relative w-full sm:w-[228px]">
                <div
                  className={`flex h-[42px] overflow-hidden rounded-md border text-sm font-bold transition ${
                    isContractDropActive
                      ? 'border-violet-600 bg-violet-100 text-violet-950'
                      : 'border-[#7059A8] bg-white text-[#301D5D]'
                  }`}
                >
                  <label
                    htmlFor="agentContractUpload"
                    className="flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 px-3 transition hover:bg-violet-50"
                  >
                    {extractionState === 'extracting' ? (
                      <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                    ) : (
                      <FileUp className="h-4 w-4 shrink-0" aria-hidden="true" />
                    )}
                    <span className="truncate">
                      {extractionState === 'extracting'
                        ? 'Reading contract…'
                        : isContractDropActive
                          ? 'Drop to upload'
                          : 'Upload contract'}
                    </span>
                    <input
                      id="agentContractUpload"
                      type="file"
                      accept="application/pdf,image/png,image/jpeg,image/webp"
                      disabled={extractionState === 'extracting'}
                      onChange={(event) => {
                        void extractContract(event.target.files?.[0]);
                        event.currentTarget.value = '';
                      }}
                      className="sr-only"
                    />
                  </label>
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
                    <label
                      htmlFor="agentContractUploadMenu"
                      role="menuitem"
                      onClick={() => setIsUploadMenuOpen(false)}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm font-bold text-slate-800 transition hover:bg-violet-50"
                    >
                      <FileUp className="h-4 w-4 shrink-0 text-[#7059A8]" aria-hidden="true" />
                      Choose PDF or image
                      <input
                        id="agentContractUploadMenu"
                        type="file"
                        accept="application/pdf,image/png,image/jpeg,image/webp"
                        onChange={(event) => {
                          void extractContract(event.target.files?.[0]);
                          event.currentTarget.value = '';
                        }}
                        className="sr-only"
                      />
                    </label>
                    <label
                      htmlFor="agentContractCameraUpload"
                      role="menuitem"
                      onClick={() => setIsUploadMenuOpen(false)}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm font-bold text-slate-800 transition hover:bg-violet-50"
                    >
                      <Camera className="h-4 w-4 shrink-0 text-[#7059A8]" aria-hidden="true" />
                      Take a photo
                      <input
                        id="agentContractCameraUpload"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        capture="environment"
                        onChange={(event) => {
                          void extractContract(event.target.files?.[0]);
                          event.currentTarget.value = '';
                        }}
                        className="sr-only"
                      />
                    </label>
                    <p className="border-t border-slate-100 px-3 pt-2.5 text-xs leading-5 text-slate-500">
                      PDF, PNG, JPG, or WEBP · 15 MB maximum. Your file is read securely, then discarded.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Link href="/agents" className="inline-flex min-h-[42px] items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:border-[#301D5D]">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Deal Desktop
              </Link>
              <button type="button" onClick={saveProgress} disabled={!ready || syncState === 'saving'} className="inline-flex min-h-[42px] items-center gap-2 rounded-md border border-[#7059A8] bg-white px-4 text-sm font-bold text-[#301D5D] disabled:opacity-50">
                <Save className="h-4 w-4" aria-hidden="true" /> {syncState === 'saving' ? 'Saving…' : 'Save for later'}
              </button>
              <button type="button" onClick={() => setWorkspacePage(2)} className="inline-flex min-h-[42px] items-center gap-2 rounded-md bg-[#301D5D] px-4 text-sm font-bold text-white hover:bg-[#42277c]">
                Open worksheet <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
          </div>
          <div
            className="mt-4 h-2 overflow-hidden rounded-md bg-slate-100"
            aria-label={workspacePage === 1 ? 'Workspace overview' : `Worksheet progress: step ${activeDeal ? activeDeal.worksheetStep + 1 : 1} of ${WORKSHEET_STEPS.length}`}
          >
            <div
              className="h-full rounded-md bg-[#7059A8] transition-[width]"
              style={{ width: workspacePage === 1 ? '12%' : `${Math.max(20, (((activeDeal?.worksheetStep ?? 0) + 1) / WORKSHEET_STEPS.length) * 100)}%` }}
            />
          </div>
          {workspacePage === 2 && (
            <div className="mt-3 grid gap-2 sm:ml-auto sm:max-w-[504px] sm:grid-cols-3" aria-label="Worksheet navigation">
              {activeDeal && activeDeal.worksheetStep > 0 ? (
                <button type="button" onClick={() => setWorksheetStep(activeDeal.worksheetStep - 1)} className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-[#301D5D] hover:bg-[#F8F5FF]">
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Back
                </button>
              ) : (
                <button type="button" onClick={() => setWorkspacePage(1)} className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-[#301D5D] hover:bg-[#F8F5FF]">
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Back
                </button>
              )}
              <button type="button" onClick={saveProgress} disabled={!ready || syncState === 'saving'} className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-md border border-[#7059A8] bg-white px-4 text-sm font-bold text-[#301D5D] transition hover:bg-[#F8F5FF] disabled:opacity-50">
                <Save className="h-4 w-4" aria-hidden="true" /> {syncState === 'saving' ? 'Saving…' : 'Save for later'}
              </button>
              {activeDeal && activeDeal.worksheetStep < WORKSHEET_STEPS.length - 1 ? (
                <button type="button" onClick={() => setWorksheetStep(activeDeal.worksheetStep + 1)} className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-md bg-[#301D5D] px-4 text-sm font-bold text-white transition hover:bg-[#42277c]">
                  Next step <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : (
                <Link href="/agents" className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-md bg-[#301D5D] px-4 text-sm font-bold text-white transition hover:bg-[#42277c]">
                  Deal Desktop <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              )}
            </div>
          )}
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
                <div className={`flex h-9 w-9 items-center justify-center rounded-md ${tone as string}`}>
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
              <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-[#7059A8]" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Calendar</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-950">Take your deadlines with you</h3>
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
                <Download className="h-4 w-4" aria-hidden="true" />
                Export this deal
              </button>
              <button
                type="button"
                onClick={exportAllDealsCalendar}
                disabled={!deals.some((deal) => deal.status !== 'completed' && calendarEventsForDeal(deal).length)}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-md border border-[#7059A8] bg-white px-4 text-sm font-bold text-[#301D5D] transition hover:bg-[#F8F5FF] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                Export active deals
              </button>
            </div>
          </div>

          <div className="order-3 h-full border border-slate-200 bg-white p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <Bell className="mt-0.5 h-5 w-5 shrink-0 text-[#7059A8]" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Deadline alerts</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-950">Choose how you are notified</h3>
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
                <Mail className="h-4 w-4 text-[#7059A8]" aria-hidden="true" />
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
                  <Smartphone className="h-4 w-4 text-[#7059A8]" aria-hidden="true" />
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
              <Bell className="mt-0.5 h-5 w-5 shrink-0 text-[#7059A8]" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Date Radar</p>
                <h3 className="mt-2 text-xl font-semibold tracking-[-0.025em] text-slate-950">Next {radarWindowDays} days</h3>
              </div>
            </div>
            <div className="mt-5 space-y-2">
              {!radarItems.length ? (
                <div className="border border-dashed border-slate-300 bg-white p-5 text-sm leading-6 text-slate-600">
                  Add a transaction, effective date, and closing date to set this Date Radar window.
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
              </div>
              {deals.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <select
                    aria-label="Select transaction"
                    value={activeDealId ?? ''}
                    onChange={(event) => {
                      if (event.target.value === '__new__') {
                        createDeal();
                        return;
                      }
                      setActiveDealId(event.target.value);
                      setPendingRemoval(null);
                    }}
                    className="min-h-[42px] max-w-[210px] border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-[#301D5D]"
                  >
                    {deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.propertyAddress || deal.title}</option>)}
                    <option value="__new__">+ Start another transaction</option>
                  </select>
                  {activeDeal && (
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
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Remove
                      </button>
                    )
                  )}
                </div>
              )}
            </div>

            {!activeDeal ? (
              <div className="mt-7 flex min-h-[260px] flex-col items-center justify-center border border-dashed border-slate-300 bg-[#FCFBF9] px-6 text-center">
                <ClipboardCheck className="h-8 w-8 text-[#7059A8]" aria-hidden="true" />
                <h4 className="mt-4 text-lg font-semibold text-slate-950">Build your first Deal Desktop</h4>
                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">Create a private workspace to turn the contract terms in front of you into a workable list of actions.</p>
                <button type="button" onClick={createDeal} className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-md bg-[#301D5D] px-4 text-sm font-bold text-white">
                  Create transaction
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <>
                <section className="mt-7 border border-[#D9D0BF] bg-[#FFFDF8] p-4 sm:p-5" aria-label="Six-step deal worksheet">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7059A8]">Six-step worksheet</p><h4 className="mt-1 text-lg font-semibold text-slate-950">Step {activeDeal.worksheetStep + 1} of {WORKSHEET_STEPS.length}: {WORKSHEET_STEPS[activeDeal.worksheetStep].label}</h4></div><span className="text-xs font-semibold text-slate-500">Progress is saved in your private cloud workspace.</span></div>
                  <ol aria-label="Worksheet progress" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">{WORKSHEET_STEPS.map((step, index) => <li key={step.id} className={`min-h-[40px] border px-2 py-2 text-left text-xs font-bold ${activeDeal.worksheetStep === index ? 'border-[#301D5D] bg-[#301D5D] text-white' : index < activeDeal.worksheetStep ? 'border-violet-200 bg-violet-50 text-[#5B438C]' : 'border-slate-200 bg-white text-slate-500'}`}><span className="mr-1 opacity-70">{index + 1}.</span>{step.label}</li>)}</ol>
                </section>
                <div className="mt-5">
                  {extractionState === 'ready' && extractionDraft && (
                    <section role="status" className="mt-4 border border-emerald-200 bg-emerald-50 p-4">
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                        <div>
                          <p className="text-sm font-semibold text-emerald-950">Contract suggestions are ready to review</p>
                          <p className="mt-1 text-sm leading-6 text-emerald-800">
                            {Object.values(extractionDraft.worksheet).filter(Boolean).length} facts and {Object.values(extractionDraft.addenda).filter(Boolean).length} selected addenda were found. Review the preview before applying.
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button type="button" onClick={applyExtraction} className="inline-flex min-h-[40px] items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800">Apply to this deal</button>
                          <button type="button" onClick={() => { setExtractionDraft(null); setExtractionState('idle'); }} className="inline-flex min-h-[40px] items-center justify-center rounded-md border border-emerald-300 bg-white px-4 text-sm font-bold text-emerald-800 hover:bg-emerald-100">Discard</button>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {Object.entries(extractionDraft.worksheet).filter(([, value]) => Boolean(value)).slice(0, 12).map(([key, value]) => (
                          <div key={key} className="border border-emerald-100 bg-white px-3 py-2 text-xs">
                            <span className="font-semibold text-emerald-900">{key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())}:</span>{' '}
                            <span className="text-slate-700">{value}</span>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-xs leading-5 text-emerald-800">The source file was processed in memory and discarded. This review contains only proposed values, not a stored contract copy.</p>
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

                {activeDeal.worksheetStep === 0 && <div className="mt-7 grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-800">Deal name</span>
                    <input value={activeDeal.title} onChange={(event) => updateActiveDeal('title', event.target.value)} className="h-[46px] w-full border border-slate-300 px-3 text-sm outline-none focus:border-[#301D5D]" placeholder="Example: Bluebonnet Lane" />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-800">Transaction stage</span>
                    <select value={activeDeal.status} onChange={(event) => updateActiveDeal('status', event.target.value as AgentDealStatus)} className="h-[46px] w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#301D5D]">
                      {(Object.keys(STATUS_LABELS) as AgentDealStatus[]).map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-800">Coordinator / owner</span>
                    <input value={activeDeal.owner} onChange={(event) => updateActiveDeal('owner', event.target.value)} className="h-[46px] w-full border border-slate-300 px-3 text-sm outline-none focus:border-[#301D5D]" placeholder="Name or role responsible for next steps" />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-800">Detailed workflow stage</span>
                    <select value={activeDeal.workflowStatus} onChange={(event) => updateActiveDeal('workflowStatus', event.target.value as TrecDealWorkflowStatus)} className="h-[46px] w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#301D5D]">{Object.entries(TREC_DEAL_WORKFLOW_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                  </label>
                  <label className="block md:col-span-2">
                    <span className="mb-2 block text-sm font-semibold text-slate-800">Property address</span>
                    <input value={activeDeal.propertyAddress} onChange={(event) => updateActiveDeal('propertyAddress', event.target.value)} className="h-[46px] w-full border border-slate-300 px-3 text-sm outline-none focus:border-[#301D5D]" placeholder="Street address, city, state, ZIP" />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-800">Buyer name(s)</span>
                    <input value={activeDeal.buyerNames} onChange={(event) => updateActiveDeal('buyerNames', event.target.value)} className="h-[46px] w-full border border-slate-300 px-3 text-sm outline-none focus:border-[#301D5D]" />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-800">Seller name(s)</span>
                    <input value={activeDeal.sellerNames} onChange={(event) => updateActiveDeal('sellerNames', event.target.value)} className="h-[46px] w-full border border-slate-300 px-3 text-sm outline-none focus:border-[#301D5D]" />
                  </label>
                </div>}

                <div className="mt-7 border-t border-slate-200 pt-6">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-5 w-5 text-[#7059A8]" aria-hidden="true" />
                    <h4 className="text-lg font-semibold text-slate-950">Contract timing</h4>
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {TIMING_FIELDS.filter((field) => field.step === activeDeal.worksheetStep).map(({ key, label, type }) => (
                      <label key={key} className="block">
                        <span className="mb-2 block text-sm font-semibold text-slate-800">{key === 'effectiveDate' ? 'Contract effective date' : label}</span>
                        <input
                          type={type}
                          min={type === 'number' ? '1' : undefined}
                          inputMode={type === 'number' ? 'numeric' : undefined}
                          value={activeDeal[key as keyof AgentDeal] as string}
                          onChange={(event) => updateActiveDeal(key as keyof AgentDeal, event.target.value as never)}
                          className="h-[46px] w-full border border-slate-300 px-3 text-sm outline-none focus:border-[#301D5D]"
                        />
                        {key === 'effectiveDate' && (
                          <span className="mt-2 block text-xs leading-5 text-slate-500">
                            This is day zero. Day one begins the next calendar day.
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                  <p className="mt-4 text-xs leading-5 text-slate-500">Timing is calculated from the effective date. Contract-period entries are calendar-day estimates; verify signed terms, delivery requirements, and local legal holidays.</p>
                </div>

                <details className="mt-7 border border-slate-200 bg-[#FCFBF9]">
                  <summary className="cursor-pointer list-none px-5 py-4 text-sm font-bold text-slate-900 marker:hidden sm:px-6">
                    <span className="flex items-center justify-between gap-3">
                      <span>Contract details and addenda</span>
                      <span className="text-xs font-semibold text-[#7059A8]">View and edit all extracted terms</span>
                    </span>
                  </summary>
                  <div className="border-t border-slate-200 p-5 sm:p-6">
                    <p className="max-w-3xl text-sm leading-6 text-slate-600">
                      Keep the deal facts that matter to your transaction in one secure workspace. These are operational notes, not an official contract record or legal advice.
                    </p>
                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      {CONTRACT_DETAIL_FIELDS.filter(({ key }) => CONTRACT_FIELD_STEPS[key] === activeDeal.worksheetStep).map(({ key, label, multiline }) => (
                        <label key={key} className={`block ${multiline ? 'md:col-span-2' : ''}`}>
                          <span className="mb-2 block text-sm font-semibold text-slate-800">{label}</span>
                          {multiline ? (
                            <textarea
                              value={activeDeal.contractDetails[key]}
                              onChange={(event) => updateContractDetail(key, event.target.value)}
                              rows={3}
                              className="w-full border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#301D5D]"
                            />
                          ) : (
                            <input
                              value={activeDeal.contractDetails[key]}
                              onChange={(event) => updateContractDetail(key, event.target.value)}
                              className="h-[46px] w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#301D5D]"
                            />
                          )}
                        </label>
                      ))}
                    </div>
                    {activeDeal.worksheetStep === 4 && <div className="mt-6 border-t border-slate-200 pt-5">
                      <p className="text-sm font-semibold text-slate-900">Addenda to track</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {ADDENDA.map((addendum) => (
                          <label key={addendum} className="flex cursor-pointer items-center gap-3 border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-700">
                            <input type="checkbox" checked={activeDeal.addenda[addendum] === true} onChange={() => toggleAddendum(addendum)} className="h-4 w-4 accent-[#301D5D]" />
                            {addendum}
                          </label>
                        ))}
                      </div>
                    </div>}
                  </div>
                </details>

                {activeDeal.worksheetStep === 5 && activeDeadlines.length > 0 && (
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    {activeDeadlines.map((deadline) => {
                      const reminderAdded = activeDeal.reminders.some((reminder) => reminder.deadlineId === deadline.id && !reminder.complete);
                      return (
                        <div key={deadline.id} className={`border p-4 ${deadlineColor(deadline)}`}>
                          <p className="text-sm font-semibold text-slate-950">{deadline.label}</p>
                          <p className="mt-1 text-lg font-semibold tracking-[-0.02em] text-slate-900">{formatDate(deadline.date)}</p>
                          {deadline.timeLabel && <p className="mt-1 text-xs font-medium text-[#7059A8]">{deadline.timeLabel}</p>}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {TREC_REMINDER_PRESET_OFFSETS.map((preset) => <button type="button" key={preset.id} disabled={reminderAdded} onClick={() => addReminder(deadline, preset.id)} className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-[#7059A8] bg-white px-2.5 text-xs font-bold text-[#301D5D] disabled:cursor-default disabled:border-slate-200 disabled:text-slate-400"><Bell className="h-3.5 w-3.5" aria-hidden="true" />{reminderAdded ? 'On Radar' : preset.id}</button>)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {workspacePage === 2 && activeDeal && (
          <>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex items-center gap-2">
                <ListTodo className="h-5 w-5 text-[#7059A8]" aria-hidden="true" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Action list</p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-950">Tasks and reminders</h3>
                </div>
              </div>
              <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2">
                <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} className="min-h-[44px] min-w-0 w-full border border-slate-300 px-3 text-sm outline-none focus:border-[#301D5D]" placeholder="Add a transaction task" />
                <input type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} aria-label="Task due date" className="min-h-[44px] min-w-0 w-full border border-slate-300 px-3 text-sm outline-none focus:border-[#301D5D]" />
                <select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as TrecTaskPriority)} aria-label="Task priority" className="min-h-[44px] min-w-0 w-full border border-slate-300 bg-white px-2 text-sm outline-none focus:border-[#301D5D]">{TREC_TASK_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select>
                <button type="button" onClick={addTask} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-[#301D5D] px-4 text-sm font-bold text-white"><Plus className="h-4 w-4" aria-hidden="true" />Add</button>
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

            <div className="border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#7059A8]" aria-hidden="true" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Readiness check</p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-950">Document checklist</h3>
                </div>
              </div>
              <div className="mt-5 flex gap-2"><input value={documentName} onChange={(event) => setDocumentName(event.target.value)} className="min-h-[42px] min-w-0 flex-1 border border-slate-300 px-3 text-sm" placeholder="Custom document request" /><button type="button" onClick={addDocument} disabled={!documentName.trim()} className="inline-flex min-h-[42px] items-center rounded-md border border-[#7059A8] px-4 text-sm font-bold text-[#301D5D] disabled:opacity-40">Request</button></div>
              <div className="mt-4 space-y-2">
                {activeDeal.documents.map((document) => <div key={document.id} className="flex flex-wrap items-center gap-3 border border-slate-200 p-3"><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${document.complete ? 'border-[#301D5D] bg-[#301D5D] text-white' : 'border-slate-400 bg-white text-transparent'}`}><Check className="h-3.5 w-3.5" aria-hidden="true" /></span><span className={`min-w-0 flex-1 text-sm font-semibold ${document.complete ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{document.label}</span><select value={document.status} onChange={(event) => updateDocument(document.id, event.target.value as AgentDocument['status'])} aria-label={`Status for ${document.label}`} className="min-h-[34px] border border-slate-300 bg-white px-2 text-xs font-semibold"><option value="requested">Requested</option><option value="received">Received</option><option value="reviewed">Reviewed</option><option value="not_needed">Not needed</option></select></div>)}
              </div>
              <div className="mt-5 border-t border-slate-200 pt-5">
                <p className="text-sm font-semibold text-slate-800">Operational review alerts</p>
                {reviewAlerts.length ? (
                  <ul className="mt-3 space-y-2">
                    {reviewAlerts.slice(0, 4).map((alert) => <li key={alert} className="flex gap-2 text-sm leading-5 text-slate-600"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B6402C]" aria-hidden="true" />{alert}</li>)}
                  </ul>
                ) : (
                  <p className="mt-2 flex items-center gap-2 text-sm text-[#38643A]"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />No worksheet alerts for your active transactions.</p>
                )}
              </div>
            </div>
          </div>
          <section className="mt-6 border border-slate-200 bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><History className="h-5 w-5 text-[#7059A8]" aria-hidden="true" /><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Closeout and history</p><h3 className="mt-1 text-xl font-semibold text-slate-950">Outcome, record, and export</h3></div></div><button type="button" onClick={exportTextSummary} className="inline-flex min-h-[40px] items-center gap-2 rounded-md border border-[#7059A8] px-4 text-sm font-bold text-[#301D5D]"><Download className="h-4 w-4" aria-hidden="true" />Download summary</button></div>
            <div className="mt-5 grid gap-3 md:grid-cols-3"><select value={activeDeal.closeoutOutcome} onChange={(event) => updateActiveDeal('closeoutOutcome', event.target.value)} aria-label="Closeout outcome" className="min-h-[44px] border border-slate-300 bg-white px-3 text-sm"><option value="">Closeout outcome</option><option value="closed">Closed</option><option value="cancelled">Cancelled</option><option value="withdrawn">Withdrawn</option><option value="expired">Expired</option></select><input type="date" value={activeDeal.closeoutDate} onChange={(event) => updateActiveDeal('closeoutDate', event.target.value)} aria-label="Closeout date" className="min-h-[44px] border border-slate-300 px-3 text-sm" /><input value={activeDeal.closeoutNote} onChange={(event) => updateActiveDeal('closeoutNote', event.target.value)} aria-label="Closeout note" className="min-h-[44px] border border-slate-300 px-3 text-sm" placeholder="Closeout note" /></div>
            <ul className="mt-5 max-h-52 space-y-2 overflow-auto">{[...activeDeal.activity].reverse().map((item) => <li key={item.id} className="border-l-2 border-[#E7C769] bg-[#FCFBF9] px-3 py-2 text-sm text-slate-700"><span className="font-bold text-slate-900">{formatTimestamp(item.createdAt)}</span> · {item.message}</li>)}</ul>
          </section>
          </>
        )}
      </div>
    </main>
  );
}
