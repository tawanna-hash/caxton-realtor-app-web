'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  FileText,
  FileUp,
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
} from '@/lib/agent-command-center-workspace';
import { calculateTrecDeadlines, type TrecDeadline } from '@/lib/trec-deadlines';

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
    closingDate: '',
    status: 'prep',
    contractDetails: defaultAgentContractDetails(),
    addenda: {},
    reminders: [],
    tasks: [],
    documents: DOCUMENT_TEMPLATES.map(([id, label]) => ({ id, label, complete: false })),
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
}: {
  workspaceKey: string;
  realtorId: string;
  initialWorkspace: AgentCommandCenterWorkspace | null;
  initialWorkspaceVersion: number | null;
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
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const [extractionState, setExtractionState] = useState<ExtractionState>('idle');
  const [extractionDraft, setExtractionDraft] = useState<ExtractionDraft | null>(null);
  const [extractionWarnings, setExtractionWarnings] = useState<string[]>([]);
  const [extractionError, setExtractionError] = useState('');
  const [isContractDropActive, setIsContractDropActive] = useState(false);
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
  const activeDeadlines = useMemo(
    () => (activeDeal ? dealDeadlines(activeDeal) : []),
    [activeDeal],
  );
  const today = chicagoToday();
  const radarWindowDays = useMemo(() => {
    if (!activeDeal?.closingDate || activeDeal.closingDate < today) return 14;
    const start = new Date(`${today}T12:00:00Z`).getTime();
    const end = new Date(`${activeDeal.closingDate}T12:00:00Z`).getTime();
    return Math.max(1, Math.ceil((end - start) / 86_400_000));
  }, [activeDeal, today]);

  const radarItems = useMemo(() => {
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
  }, [activeDeal, deals, today]);

  const reviewAlerts = useMemo(() => deals.flatMap((deal) => {
    if (deal.status === 'completed') return [];
    const label = deal.propertyAddress || deal.title;
    const alerts: string[] = [];
    if (!deal.buyerNames) alerts.push(`${label}: add the buyer name for your worksheet.`);
    if (!deal.sellerNames) alerts.push(`${label}: add the seller name for your worksheet.`);
    if (!deal.propertyAddress) alerts.push(`${label}: add the property address for your worksheet.`);
    if (!deal.effectiveDate && deal.status !== 'prep') alerts.push(`${label}: add the effective date to calculate contract timing.`);
    if (deal.effectiveDate && deal.closingDate && deal.closingDate < deal.effectiveDate) {
      alerts.push(`${label}: closing date is earlier than the effective date.`);
    }
    return alerts;
  }), [deals]);

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
      closingDate: worksheet.closingDate ?? activeDeal.closingDate,
      contractDetails: nextDetails,
      addenda: { ...activeDeal.addenda, ...extractionDraft.addenda },
      updatedAt: new Date().toISOString(),
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

  const addReminder = (deadline: TrecDeadline) => {
    if (!activeDeal) return;
    if (activeDeal.reminders.some((reminder) => reminder.deadlineId === deadline.id && !reminder.complete)) return;
    const oneDayBefore = addDays(deadline.date, -1);
    const reminder: AgentReminder = {
      id: getId('reminder'),
      deadlineId: deadline.id,
      label: deadline.label,
      deadlineDate: deadline.date,
      reminderDate: oneDayBefore < today ? today : oneDayBefore,
      complete: false,
    };
    updateActiveDeal('reminders', [...activeDeal.reminders, reminder]);
    trackEvent('agent_deal_desk_reminder_added', { deadline: deadline.id });
  };

  const addTask = () => {
    if (!activeDeal || !taskTitle.trim()) return;
    const task: AgentTask = {
      id: getId('task'),
      title: taskTitle.trim(),
      dueDate: taskDueDate,
      complete: false,
    };
    updateActiveDeal('tasks', [...activeDeal.tasks, task]);
    setTaskTitle('');
    setTaskDueDate('');
    trackEvent('agent_deal_desk_task_added');
  };

  const removeDeal = (dealId: string) => {
    const nextDeals = deals.filter((deal) => deal.id !== dealId);
    persistDeals(nextDeals);
    setActiveDealId(nextDeals[0]?.id ?? null);
    setPendingRemoval(null);
    trackEvent('agent_deal_desk_transaction_removed');
  };

  const updateTask = (taskId: string, patch: Partial<AgentTask>) => {
    if (!activeDeal) return;
    updateActiveDeal('tasks', activeDeal.tasks.map((task) => task.id === taskId ? { ...task, ...patch } : task));
  };

  const removeTask = (taskId: string) => {
    if (!activeDeal) return;
    updateActiveDeal('tasks', activeDeal.tasks.filter((task) => task.id !== taskId));
  };

  const updateReminder = (reminderId: string, patch: Partial<AgentReminder>) => {
    if (!activeDeal) return;
    updateActiveDeal('reminders', activeDeal.reminders.map((reminder) => (
      reminder.id === reminderId ? { ...reminder, ...patch } : reminder
    )));
  };

  const toggleDocument = (documentId: string) => {
    if (!activeDeal) return;
    updateActiveDeal('documents', activeDeal.documents.map((document) => (
      document.id === documentId ? { ...document, complete: !document.complete } : document
    )));
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

  const saveProgress = () => {
    if (!ready) return;
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    void saveToCloud({ deals, notificationPreferences });
    trackEvent('agent_deal_desk_progress_saved');
  };

  return (
    <main id="agent-desk" className="min-h-screen bg-[#F7F5F1]">
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:py-16">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7059A8]">Private agent workspace</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-4xl">Your deal desk</h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
              Turn contract terms into a working desk with live timing, task and document checks, and an in-app Date Radar across your active transactions.
            </p>
          </div>
          <button
            type="button"
            onClick={createDeal}
            className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-full bg-[#301D5D] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#42277c]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New transaction
          </button>
        </div>

        <div className="mt-5 flex items-start gap-3 border border-[#D9D0BF] bg-[#FFFDF8] px-4 py-3 text-sm leading-6 text-slate-600">
          <Save className="mt-0.5 h-4 w-4 shrink-0 text-[#7059A8]" aria-hidden="true" />
          <p>
            <span className="font-semibold text-slate-900">{ready ? syncMessage : 'Loading your secure workspace.'}</span>{' '}
            Verify all dates against the signed contract and your broker&apos;s process.
          </p>
        </div>

        <nav aria-label="Deal desk pages" className="mt-5 flex flex-col gap-3 border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7059A8]">Page {workspacePage} of 2</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {workspacePage === 1 ? 'Overview, Date Radar, calendar and alerts' : 'Transaction details, upload, tasks and documents'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {workspacePage === 1 ? (
              <Link href="/agents" className="inline-flex min-h-[42px] items-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:border-[#301D5D]">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Agent Center
              </Link>
            ) : (
              <button type="button" onClick={() => setWorkspacePage(1)} className="inline-flex min-h-[42px] items-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:border-[#301D5D]">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Back
              </button>
            )}
            <button type="button" onClick={saveProgress} disabled={!ready || syncState === 'saving'} className="inline-flex min-h-[42px] items-center gap-2 rounded-full border border-[#7059A8] bg-white px-4 text-sm font-bold text-[#301D5D] disabled:opacity-50">
              <Save className="h-4 w-4" aria-hidden="true" /> {syncState === 'saving' ? 'Saving…' : 'Save progress'}
            </button>
            {workspacePage === 1 ? (
              <button type="button" onClick={() => setWorkspacePage(2)} className="inline-flex min-h-[42px] items-center gap-2 rounded-full bg-[#301D5D] px-4 text-sm font-bold text-white hover:bg-[#42277c]">
                Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : (
              <Link href="/agents" className="inline-flex min-h-[42px] items-center gap-2 rounded-full bg-[#301D5D] px-4 text-sm font-bold text-white hover:bg-[#42277c]">
                Done <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
          </div>
        </nav>

        {workspacePage === 1 && (
          <>
        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Active workspaces', activeDealCount, ClipboardCheck, 'bg-[#F8F5FF] text-[#301D5D]'],
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

        <div className="mt-6 grid gap-5 border border-[#D9D0BF] bg-[#FFFDF8] p-5 lg:grid-cols-[1.05fr_0.95fr] lg:p-6">
          <div>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-[#7059A8]" aria-hidden="true" />
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
                className="inline-flex min-h-[42px] items-center gap-2 rounded-full bg-[#301D5D] px-4 text-sm font-bold text-white transition hover:bg-[#42277c] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Export this deal
              </button>
              <button
                type="button"
                onClick={exportAllDealsCalendar}
                disabled={!deals.some((deal) => deal.status !== 'completed' && calendarEventsForDeal(deal).length)}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-full border border-[#7059A8] bg-white px-4 text-sm font-bold text-[#301D5D] transition hover:bg-[#F8F5FF] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                Export active deals
              </button>
            </div>
          </div>

          <div className="border border-slate-200 bg-white p-4 sm:p-5">
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
                  className="inline-flex min-h-[36px] items-center rounded-full border border-[#7059A8] bg-white px-3 text-xs font-bold text-[#301D5D] transition hover:bg-[#F8F5FF]"
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
        </div>

        <div className="mt-8">
          <div className="border border-slate-200 bg-[#F7F5F1] p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Date Radar</p>
                <h3 className="mt-2 text-xl font-semibold tracking-[-0.025em] text-slate-950">Next {radarWindowDays} days</h3>
              </div>
              <Bell className="h-5 w-5 text-[#7059A8]" aria-hidden="true" />
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
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.overdue ? 'bg-[#B6402C]' : item.kind === 'deadline' ? 'bg-[#7059A8]' : 'bg-[#C88A14]'}`} />
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
                      setActiveDealId(event.target.value);
                      setPendingRemoval(null);
                    }}
                    className="min-h-[42px] max-w-[210px] border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-[#301D5D]"
                  >
                    {deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.propertyAddress || deal.title}</option>)}
                  </select>
                  {activeDeal && (
                    pendingRemoval === activeDeal.id ? (
                      <button
                        type="button"
                        onClick={() => removeDeal(activeDeal.id)}
                        className="inline-flex min-h-[42px] items-center gap-2 rounded-full bg-[#9A3D2B] px-4 text-sm font-bold text-white"
                      >
                        Confirm remove
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPendingRemoval(activeDeal.id)}
                        className="inline-flex min-h-[42px] items-center gap-2 rounded-full border border-[#D8A79D] px-4 text-sm font-semibold text-[#9A3D2B] transition hover:bg-[#FFF0EC]"
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
                <h4 className="mt-4 text-lg font-semibold text-slate-950">Build your first deal desk</h4>
                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">Create a private workspace to turn the contract terms in front of you into a workable list of actions.</p>
                <button type="button" onClick={createDeal} className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#301D5D] px-4 text-sm font-bold text-white">
                  Create transaction
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <>
                <div className="mt-7 border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4 sm:p-5">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.72fr)] lg:items-center">
                    <div className="max-w-2xl">
                      <div className="flex items-center gap-2 text-sm font-semibold text-violet-950">
                        <FileUp className="h-4 w-4 text-violet-700" aria-hidden="true" />
                        Upload a signed TREC 1–4 contract to prefill this deal
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Drag in a PDF or clear contract image. The app reads visible contract facts, dates, and addenda, then lets you review the suggestions before they update this secure workspace.
                      </p>
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
                      className={`border-2 border-dashed p-3 transition sm:p-4 ${
                        isContractDropActive
                          ? 'border-violet-600 bg-violet-100'
                          : 'border-violet-200 bg-white/80 hover:border-violet-400 hover:bg-violet-50/70'
                      } ${extractionState === 'extracting' ? 'pointer-events-none opacity-70' : ''}`}
                    >
                      <label htmlFor="agentContractUpload" className="flex min-h-28 cursor-pointer flex-col items-center justify-center text-center">
                        {extractionState === 'extracting' ? (
                          <LoaderCircle className="h-6 w-6 animate-spin text-violet-700" aria-hidden="true" />
                        ) : (
                          <FileUp className="h-6 w-6 text-violet-700" aria-hidden="true" />
                        )}
                        <span className="mt-2 text-sm font-semibold text-violet-950">
                          {extractionState === 'extracting' ? 'Reading contract…' : isContractDropActive ? 'Drop contract to upload' : 'Drag and drop your contract'}
                        </span>
                        <span className="mt-1 text-xs text-slate-600">or <span className="font-semibold text-violet-800 underline underline-offset-2">browse files</span></span>
                        <span className="mt-2 text-xs text-slate-500">PDF, PNG, JPG, or WEBP · 15 MB maximum</span>
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
                    </div>
                  </div>
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
                          <button type="button" onClick={applyExtraction} className="inline-flex min-h-[40px] items-center justify-center rounded-full bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800">Apply to this deal</button>
                          <button type="button" onClick={() => { setExtractionDraft(null); setExtractionState('idle'); }} className="inline-flex min-h-[40px] items-center justify-center rounded-full border border-emerald-300 bg-white px-4 text-sm font-bold text-emerald-800 hover:bg-emerald-100">Discard</button>
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

                <div className="mt-7 grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-800">Deal name</span>
                    <input value={activeDeal.title} onChange={(event) => updateActiveDeal('title', event.target.value)} className="min-h-[46px] w-full border border-slate-300 px-3 text-sm outline-none focus:border-[#301D5D]" placeholder="Example: Bluebonnet Lane" />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-800">Status</span>
                    <select value={activeDeal.status} onChange={(event) => updateActiveDeal('status', event.target.value as AgentDealStatus)} className="min-h-[46px] w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#301D5D]">
                      {(Object.keys(STATUS_LABELS) as AgentDealStatus[]).map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
                    </select>
                  </label>
                  <label className="block md:col-span-2">
                    <span className="mb-2 block text-sm font-semibold text-slate-800">Property address</span>
                    <input value={activeDeal.propertyAddress} onChange={(event) => updateActiveDeal('propertyAddress', event.target.value)} className="min-h-[46px] w-full border border-slate-300 px-3 text-sm outline-none focus:border-[#301D5D]" placeholder="Street address, city, state, ZIP" />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-800">Buyer name(s)</span>
                    <input value={activeDeal.buyerNames} onChange={(event) => updateActiveDeal('buyerNames', event.target.value)} className="min-h-[46px] w-full border border-slate-300 px-3 text-sm outline-none focus:border-[#301D5D]" />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-800">Seller name(s)</span>
                    <input value={activeDeal.sellerNames} onChange={(event) => updateActiveDeal('sellerNames', event.target.value)} className="min-h-[46px] w-full border border-slate-300 px-3 text-sm outline-none focus:border-[#301D5D]" />
                  </label>
                </div>

                <div className="mt-7 border-t border-slate-200 pt-6">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-5 w-5 text-[#7059A8]" aria-hidden="true" />
                    <h4 className="text-lg font-semibold text-slate-950">Contract timing</h4>
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {[
                      ['effectiveDate', 'Effective date', 'date'],
                      ['optionPeriodDays', 'Option period days', 'number'],
                      ['additionalEarnestMoneyDays', 'Additional earnest days', 'number'],
                      ['financingDeadlineDays', 'Financing days', 'number'],
                      ['appraisalDeadlineDays', 'Appraisal days', 'number'],
                      ['titleCommitmentDays', 'Title commitment days', 'number'],
                      ['surveyDays', 'Survey days', 'number'],
                      ['closingDate', 'Closing date', 'date'],
                    ].map(([key, label, type]) => (
                      <label key={key} className="block">
                        <span className="mb-2 block text-sm font-semibold text-slate-800">{label}</span>
                        <input
                          type={type}
                          min={type === 'number' ? '1' : undefined}
                          inputMode={type === 'number' ? 'numeric' : undefined}
                          value={activeDeal[key as keyof AgentDeal] as string}
                          onChange={(event) => updateActiveDeal(key as keyof AgentDeal, event.target.value as never)}
                          className="min-h-[46px] w-full border border-slate-300 px-3 text-sm outline-none focus:border-[#301D5D]"
                        />
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
                      {CONTRACT_DETAIL_FIELDS.map(({ key, label, multiline }) => (
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
                              className="min-h-[44px] w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#301D5D]"
                            />
                          )}
                        </label>
                      ))}
                    </div>
                    <div className="mt-6 border-t border-slate-200 pt-5">
                      <p className="text-sm font-semibold text-slate-900">Addenda to track</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {ADDENDA.map((addendum) => (
                          <label key={addendum} className="flex cursor-pointer items-center gap-3 border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-700">
                            <input type="checkbox" checked={activeDeal.addenda[addendum] === true} onChange={() => toggleAddendum(addendum)} className="h-4 w-4 accent-[#301D5D]" />
                            {addendum}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </details>

                {activeDeadlines.length > 0 && (
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    {activeDeadlines.map((deadline) => {
                      const reminderAdded = activeDeal.reminders.some((reminder) => reminder.deadlineId === deadline.id && !reminder.complete);
                      return (
                        <div key={deadline.id} className={`border p-4 ${deadlineColor(deadline)}`}>
                          <p className="text-sm font-semibold text-slate-950">{deadline.label}</p>
                          <p className="mt-1 text-lg font-semibold tracking-[-0.02em] text-slate-900">{formatDate(deadline.date)}</p>
                          {deadline.timeLabel && <p className="mt-1 text-xs font-medium text-[#7059A8]">{deadline.timeLabel}</p>}
                          <button
                            type="button"
                            disabled={reminderAdded}
                            onClick={() => addReminder(deadline)}
                            className="mt-3 inline-flex min-h-[38px] items-center gap-2 rounded-full border border-[#7059A8] bg-white px-3 text-xs font-bold text-[#301D5D] transition hover:bg-[#F8F5FF] disabled:cursor-default disabled:border-slate-200 disabled:text-slate-400"
                          >
                            <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                            {reminderAdded ? 'On Date Radar' : 'Add reminder'}
                          </button>
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
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex items-center gap-2">
                <ListTodo className="h-5 w-5 text-[#7059A8]" aria-hidden="true" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Action list</p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-950">Tasks and reminders</h3>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_150px_auto]">
                <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} className="min-h-[44px] border border-slate-300 px-3 text-sm outline-none focus:border-[#301D5D]" placeholder="Add a transaction task" />
                <input type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} className="min-h-[44px] border border-slate-300 px-3 text-sm outline-none focus:border-[#301D5D]" />
                <button type="button" onClick={addTask} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[#301D5D] px-4 text-sm font-bold text-white">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add
                </button>
              </div>
              <div className="mt-5 space-y-2">
                {!activeDeal.tasks.length && !activeDeal.reminders.length ? (
                  <p className="border border-dashed border-slate-300 bg-[#FCFBF9] p-4 text-sm text-slate-600">Use the deadline cards or add a custom action to build the list.</p>
                ) : (
                  <>
                    {activeDeal.reminders.map((reminder) => (
                      <div key={reminder.id} className="flex items-center gap-3 border border-[#E7C769] bg-[#FFF9E7] p-3">
                        <button type="button" onClick={() => updateReminder(reminder.id, { complete: !reminder.complete })} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${reminder.complete ? 'border-[#301D5D] bg-[#301D5D] text-white' : 'border-[#A97A1A] bg-white text-transparent'}`} aria-label={`Mark ${reminder.label} reminder ${reminder.complete ? 'incomplete' : 'complete'}`}>
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <span className={`min-w-0 flex-1 text-sm font-semibold ${reminder.complete ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{reminder.label}</span>
                        <span className="text-xs font-bold text-[#855D10]">{formatDate(reminder.reminderDate)}</span>
                      </div>
                    ))}
                    {activeDeal.tasks.map((task) => (
                      <div key={task.id} className="flex items-center gap-3 border border-slate-200 p-3">
                        <button type="button" onClick={() => updateTask(task.id, { complete: !task.complete })} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${task.complete ? 'border-[#301D5D] bg-[#301D5D] text-white' : 'border-slate-400 bg-white text-transparent'}`} aria-label={`Mark ${task.title} ${task.complete ? 'incomplete' : 'complete'}`}>
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <span className={`min-w-0 flex-1 text-sm font-semibold ${task.complete ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{task.title}</span>
                        {task.dueDate && <span className={`text-xs font-bold ${task.dueDate < today && !task.complete ? 'text-[#B6402C]' : 'text-slate-500'}`}>{formatDate(task.dueDate)}</span>}
                        <button type="button" onClick={() => removeTask(task.id)} className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-slate-400 transition hover:text-[#9A3D2B]" aria-label={`Remove ${task.title}`}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </>
                )}
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
              <div className="mt-5 space-y-2">
                {activeDeal.documents.map((document) => (
                  <button key={document.id} type="button" onClick={() => toggleDocument(document.id)} className="flex w-full items-center gap-3 border border-slate-200 p-3 text-left transition hover:border-[#7059A8]">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${document.complete ? 'border-[#301D5D] bg-[#301D5D] text-white' : 'border-slate-400 bg-white text-transparent'}`}>
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <span className={`text-sm font-semibold ${document.complete ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{document.label}</span>
                  </button>
                ))}
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
        )}
      </div>
    </main>
  );
}
