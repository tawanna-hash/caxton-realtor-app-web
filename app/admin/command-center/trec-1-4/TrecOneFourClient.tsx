'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  RotateCcw,
  Save,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { calculateTrecDeadlines, type TrecDeadline } from '@/lib/trec-deadlines';
import type { TrecDeadlineReminder, TrecDeal } from '@/lib/server/trec-deals';

type Worksheet = Record<string, string>;
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const INITIAL_WORKSHEET: Worksheet = {
  buyerNames: '',
  sellerNames: '',
  propertyAddress: '',
  county: '',
  legalDescription: '',
  improvementsAndAccessories: '',
  exclusions: '',
  cashPortion: '',
  loanAmount: '',
  salesPrice: '',
  financingType: '',
  financingNotes: '',
  earnestMoney: '',
  earnestMoneyDeliveredDate: '',
  titleCompany: '',
  optionFee: '',
  optionDays: '',
  optionFeeDeliveredDate: '',
  additionalEarnestMoney: '',
  additionalEarnestMoneyDays: '',
  financingDeadlineDays: '',
  appraisalDeadlineDays: '',
  titleCommitmentDays: '',
  surveyDays: '',
  titleObjectionDays: '',
  titlePolicyPayer: '',
  surveyPlan: '',
  titleAndSurveyNotes: '',
  conditionAndRepairNotes: '',
  closingDate: '',
  possessionPlan: '',
  specialProvisionsNotes: '',
  settlementNotes: '',
  notices: '',
  effectiveDate: '',
};

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
];

const STEPS = [
  { title: 'Parties & property', detail: 'Paragraphs 1–2' },
  { title: 'Price & financing', detail: 'Paragraphs 3–4' },
  { title: 'Deposits & option', detail: 'Paragraphs 5 & 23' },
  { title: 'Title, condition & closing', detail: 'Paragraphs 6–10' },
  { title: 'Terms, notices & addenda', detail: 'Paragraphs 11–22' },
  { title: 'Review', detail: 'Confirm your brief' },
];

function Field({
  id,
  label,
  value,
  onChange,
  hint,
  type = 'text',
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  type?: 'text' | 'date' | 'number';
  placeholder?: string;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="text-sm font-medium text-gray-900">{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1.5 block min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-950 shadow-sm outline-none placeholder:text-gray-400 focus:border-orange-600 focus:ring-2 focus:ring-orange-100"
      />
      {hint && <span className="mt-1 block text-xs leading-5 text-gray-500">{hint}</span>}
    </label>
  );
}

function Textarea({
  id,
  label,
  value,
  onChange,
  hint,
  placeholder,
}: Omit<Parameters<typeof Field>[0], 'type'>) {
  return (
    <label htmlFor={id} className="block">
      <span className="text-sm font-medium text-gray-900">{label}</span>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={4}
        className="mt-1.5 block w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-950 shadow-sm outline-none placeholder:text-gray-400 focus:border-orange-600 focus:ring-2 focus:ring-orange-100"
      />
      {hint && <span className="mt-1 block text-xs leading-5 text-gray-500">{hint}</span>}
    </label>
  );
}

function formatValue(value: string): string {
  if (!value) return 'Not entered';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }
  return value;
}

function isoToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function defaultReminderDate(deadlineDate: string): string {
  const tomorrow = addDays(isoToday(), 1);
  const dayBefore = addDays(deadlineDate, -1);
  return dayBefore >= tomorrow ? dayBefore : deadlineDate;
}

function formatSavedAt(value?: string): string {
  if (!value) return '';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function DeadlineMath({
  deadlines,
  onAddReminder,
}: {
  deadlines: TrecDeadline[];
  onAddReminder?: (deadline: TrecDeadline) => void;
}) {
  if (deadlines.length === 0) {
    return (
      <div className="mt-5 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm leading-6 text-gray-600">
        Enter the contract&apos;s effective date to calculate the time-sensitive dates.
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-lg border border-orange-200 bg-orange-50/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-950">Deadline math</h3>
          <p className="mt-1 text-xs leading-5 text-gray-600">
            Calendar-day calculations from the effective date. Verify all results against the signed contract package.
          </p>
        </div>
        <span className="text-xs font-medium text-orange-800">TREC 20–19 timing</span>
      </div>
      <ul className="mt-3 divide-y divide-orange-100 rounded-md border border-orange-100 bg-white">
        {deadlines.map((deadline) => (
          <li key={deadline.id} className="px-3 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-sm font-semibold text-gray-900">{deadline.label}</span>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-orange-800">
                  {formatValue(deadline.date)}
                  {deadline.timeLabel ? ` · ${deadline.timeLabel}` : ''}
                </span>
                {onAddReminder && (
                  <button
                    type="button"
                    onClick={() => onAddReminder(deadline)}
                    className="inline-flex min-h-9 items-center gap-1 rounded-full border border-orange-200 bg-white px-3 text-xs font-semibold text-orange-800 hover:bg-orange-50"
                  >
                    <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                    Remind me
                  </button>
                )}
              </div>
            </div>
            <p className="mt-1 text-xs leading-5 text-gray-600">{deadline.rule}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DateRadar({
  deadlines,
  reminders,
  month,
  onMonthChange,
}: {
  deadlines: TrecDeadline[];
  reminders: TrecDeadlineReminder[];
  month: Date;
  onMonthChange: (direction: number) => void;
}) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const startWeekday = new Date(year, monthIndex, 1).getDay();
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const eventsByDate = deadlines.reduce<Record<string, TrecDeadline[]>>((accumulator, deadline) => {
    if (deadline.date.startsWith(monthPrefix)) {
      accumulator[deadline.date] = [...(accumulator[deadline.date] ?? []), deadline];
    }
    return accumulator;
  }, {});
  const remindersByDate = reminders
    .filter((reminder) => !reminder.isComplete && reminder.reminderDate.startsWith(monthPrefix))
    .reduce<Record<string, TrecDeadlineReminder[]>>((accumulator, reminder) => {
      accumulator[reminder.reminderDate] = [...(accumulator[reminder.reminderDate] ?? []), reminder];
      return accumulator;
    }, {});

  return (
    <section aria-label="Date Radar" className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-orange-700" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold text-gray-950">Date Radar</h2>
            <p className="text-xs text-gray-500">Calculated deadlines and your in-app reminders.</p>
          </div>
        </div>
        <div className="flex gap-1">
          <button type="button" onClick={() => onMonthChange(-1)} aria-label="Previous month" className="rounded-full p-2 text-gray-600 hover:bg-gray-100">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => onMonthChange(1)} aria-label="Next month" className="rounded-full p-2 text-gray-600 hover:bg-gray-100">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <p className="mt-4 text-sm font-semibold text-gray-900">
        {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
      </p>
      <div className="mt-3 grid grid-cols-7 border-l border-t border-gray-200">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} className="border-b border-r border-gray-200 bg-gray-50 px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500">{day}</div>
        ))}
        {Array.from({ length: startWeekday }).map((_, index) => <div key={`blank-${index}`} className="min-h-20 border-b border-r border-gray-200 bg-gray-50/40" />)}
        {Array.from({ length: days }, (_, index) => {
          const day = index + 1;
          const date = `${monthPrefix}-${String(day).padStart(2, '0')}`;
          const dateDeadlines = eventsByDate[date] ?? [];
          const dateReminders = remindersByDate[date] ?? [];
          return (
            <div key={date} className="min-h-20 border-b border-r border-gray-200 p-1.5">
              <span className={date === isoToday() ? 'inline-flex h-6 w-6 items-center justify-center rounded-full bg-orange-600 text-xs font-semibold text-white' : 'text-xs font-medium text-gray-700'}>{day}</span>
              <div className="mt-1 space-y-1">
                {dateDeadlines.slice(0, 2).map((deadline) => <p key={deadline.id} title={deadline.label} className="truncate rounded bg-orange-100 px-1 py-0.5 text-[10px] font-medium text-orange-900">{deadline.label}</p>)}
                {dateReminders.slice(0, 1).map((reminder) => <p key={reminder.id} title={reminder.note ?? 'Reminder'} className="truncate rounded bg-violet-100 px-1 py-0.5 text-[10px] font-medium text-violet-900">Reminder</p>)}
                {dateDeadlines.length + dateReminders.length > 3 && <p className="text-[10px] text-gray-500">+{dateDeadlines.length + dateReminders.length - 3} more</p>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-orange-400" />Calculated deadline</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-500" />In-app reminder</span>
      </div>
    </section>
  );
}

export default function TrecOneFourClient({ initialDeals }: { initialDeals: TrecDeal[] }) {
  const searchParams = useSearchParams();
  const linkedDeal = initialDeals.find((deal) => deal.id === searchParams.get('deal')) ?? null;
  const [activeStep, setActiveStep] = useState(0);
  const [worksheet, setWorksheet] = useState<Worksheet>(() => ({
    ...INITIAL_WORKSHEET,
    ...linkedDeal?.worksheet,
  }));
  const [addenda, setAddenda] = useState<Record<string, boolean>>(() => linkedDeal?.addenda ?? {});
  const [savedDeals, setSavedDeals] = useState<TrecDeal[]>(initialDeals);
  const [currentDealId, setCurrentDealId] = useState<string | null>(linkedDeal?.id ?? null);
  const [dealTitle, setDealTitle] = useState(linkedDeal?.title ?? '');
  const [reminders, setReminders] = useState<TrecDeadlineReminder[]>(linkedDeal?.reminders ?? []);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [selectedDeadlineId, setSelectedDeadlineId] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [reminderNote, setReminderNote] = useState('');
  const [reminderState, setReminderState] = useState<SaveState>('idle');
  const [radarMonth, setRadarMonth] = useState(() => {
    const initial = new Date(`${linkedDeal?.worksheet.effectiveDate || isoToday()}T12:00:00`);
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });

  const update = (key: string, value: string) => {
    setWorksheet((current) => ({ ...current, [key]: value }));
  };

  const completedSteps = useMemo(
    () => [
      Boolean(worksheet.buyerNames && worksheet.sellerNames && worksheet.propertyAddress),
      Boolean(worksheet.salesPrice && (worksheet.cashPortion || worksheet.loanAmount)),
      Boolean(worksheet.earnestMoney && worksheet.titleCompany && worksheet.optionDays),
      Boolean(worksheet.closingDate && worksheet.conditionAndRepairNotes),
      Boolean(worksheet.effectiveDate || Object.values(addenda).some(Boolean)),
    ],
    [addenda, worksheet],
  );

  const selectedAddenda = ADDENDA.filter((addendum) => addenda[addendum]);
  const deadlines = useMemo(
    () =>
      calculateTrecDeadlines({
        effectiveDate: worksheet.effectiveDate,
        optionPeriodDays: worksheet.optionDays,
        additionalEarnestMoneyDays: worksheet.additionalEarnestMoneyDays,
        financingDeadlineDays: worksheet.financingDeadlineDays,
        appraisalDeadlineDays: worksheet.appraisalDeadlineDays,
        titleCommitmentDays: worksheet.titleCommitmentDays,
        surveyDays: worksheet.surveyDays,
        titleObjectionDays: worksheet.titleObjectionDays,
      }),
    [worksheet],
  );

  const selectedDeadline = deadlines.find((deadline) => deadline.id === selectedDeadlineId);
  const currentDeal = savedDeals.find((deal) => deal.id === currentDealId) ?? null;

  const startNewDeal = () => {
    if (!window.confirm('Start a new deal-prep worksheet? Unsaved changes in this browser tab will be cleared.')) return;
    setWorksheet(INITIAL_WORKSHEET);
    setAddenda({});
    setCurrentDealId(null);
    setDealTitle('');
    setReminders([]);
    setSelectedDeadlineId('');
    setReminderDate('');
    setReminderNote('');
    setSaveState('idle');
    setActiveStep(0);
    setRadarMonth(new Date());
  };

  const selectDeal = (id: string) => {
    if (!id) {
      startNewDeal();
      return;
    }
    const selected = savedDeals.find((deal) => deal.id === id);
    if (!selected) return;
    setCurrentDealId(selected.id);
    setDealTitle(selected.title);
    setWorksheet({ ...INITIAL_WORKSHEET, ...selected.worksheet });
    setAddenda(selected.addenda);
    setReminders(selected.reminders);
    setSelectedDeadlineId('');
    setReminderDate('');
    setReminderNote('');
    setSaveState('idle');
    setActiveStep(0);
    const effectiveDate = selected.worksheet.effectiveDate || isoToday();
    const date = new Date(`${effectiveDate}T12:00:00`);
    setRadarMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  };

  const saveDeal = async () => {
    setSaveState('saving');
    const title = dealTitle.trim() || worksheet.propertyAddress || worksheet.buyerNames || 'Untitled TREC deal';
    try {
      const endpoint = currentDealId ? `/api/admin/trec-deals/${currentDealId}` : '/api/admin/trec-deals';
      const response = await fetch(endpoint, {
        method: currentDealId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, worksheet, addenda }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save this deal.');
      const deal = data.deal as TrecDeal;
      setCurrentDealId(deal.id);
      setDealTitle(deal.title);
      setReminders(deal.reminders);
      setSavedDeals((current) => {
        const otherDeals = current.filter((item) => item.id !== deal.id);
        return [deal, ...otherDeals];
      });
      setSaveState('saved');
      window.setTimeout(() => setSaveState('idle'), 3000);
    } catch {
      setSaveState('error');
    }
  };

  const deleteDeal = async () => {
    if (!currentDealId) return;
    const typed = window.prompt(`To permanently delete this saved deal, enter this ID exactly:\n${currentDealId}`);
    if (typed !== currentDealId) return;
    try {
      const response = await fetch(`/api/admin/trec-deals/${currentDealId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmationId: typed }),
      });
      if (!response.ok) throw new Error('Unable to delete deal');
      setSavedDeals((current) => current.filter((deal) => deal.id !== currentDealId));
      setWorksheet(INITIAL_WORKSHEET);
      setAddenda({});
      setCurrentDealId(null);
      setDealTitle('');
      setReminders([]);
      setSelectedDeadlineId('');
      setReminderDate('');
      setReminderNote('');
      setActiveStep(0);
    } catch {
      setSaveState('error');
    }
  };

  const openReminder = (deadline: TrecDeadline) => {
    if (!currentDealId) {
      setSaveState('error');
      return;
    }
    setSelectedDeadlineId(deadline.id);
    setReminderDate(defaultReminderDate(deadline.date));
    setReminderNote('');
    setReminderState('idle');
  };

  const createReminder = async () => {
    if (!currentDealId || !selectedDeadline || !reminderDate) return;
    setReminderState('saving');
    try {
      const response = await fetch(`/api/admin/trec-deals/${currentDealId}/reminders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deadlineKey: selectedDeadline.id,
          reminderDate,
          note: reminderNote.trim() || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not add reminder');
      setReminders((current) => [...current, data.reminder as TrecDeadlineReminder]);
      setSavedDeals((current) => current.map((deal) => (
        deal.id === currentDealId ? { ...deal, reminders: [...deal.reminders, data.reminder as TrecDeadlineReminder] } : deal
      )));
      setSelectedDeadlineId('');
      setReminderDate('');
      setReminderNote('');
      setReminderState('saved');
    } catch {
      setReminderState('error');
    }
  };

  const updateReminder = async (reminder: TrecDeadlineReminder, isComplete: boolean) => {
    if (!currentDealId) return;
    try {
      const response = await fetch(`/api/admin/trec-deals/${currentDealId}/reminders/${reminder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isComplete }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update reminder');
      const updated = data.reminder as TrecDeadlineReminder;
      setReminders((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSavedDeals((current) => current.map((deal) => (
        deal.id === currentDealId
          ? { ...deal, reminders: deal.reminders.map((item) => item.id === updated.id ? updated : item) }
          : deal
      )));
    } catch {
      setReminderState('error');
    }
  };

  const changeRadarMonth = (direction: number) => {
    setRadarMonth((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
  };

  const exportSummary = () => {
    const lines = [
      'TREC 1–4 RESIDENTIAL CONTRACT — DEAL-PREP SUMMARY',
      'For operational preparation and review only. This is not an official contract or legal advice.',
      '',
      'PARTIES & PROPERTY',
      `Buyer(s): ${worksheet.buyerNames || 'Not entered'}`,
      `Seller(s): ${worksheet.sellerNames || 'Not entered'}`,
      `Property: ${worksheet.propertyAddress || 'Not entered'}`,
      `County: ${worksheet.county || 'Not entered'}`,
      `Legal description: ${worksheet.legalDescription || 'Not entered'}`,
      `Improvements/accessories: ${worksheet.improvementsAndAccessories || 'Not entered'}`,
      `Exclusions: ${worksheet.exclusions || 'Not entered'}`,
      '',
      'PRICE & FINANCING',
      `Cash portion: ${worksheet.cashPortion || 'Not entered'}`,
      `Loan amount: ${worksheet.loanAmount || 'Not entered'}`,
      `Total sales price: ${worksheet.salesPrice || 'Not entered'}`,
      `Financing: ${worksheet.financingType || 'Not entered'}`,
      `Financing notes: ${worksheet.financingNotes || 'Not entered'}`,
      '',
      'DEPOSITS & OPTION',
      `Earnest money: ${worksheet.earnestMoney || 'Not entered'}`,
      `Earnest money delivered: ${formatValue(worksheet.earnestMoneyDeliveredDate)}`,
      `Title company: ${worksheet.titleCompany || 'Not entered'}`,
      `Option fee: ${worksheet.optionFee || 'Not entered'}`,
      `Option period: ${worksheet.optionDays || 'Not entered'} days`,
      `Option fee delivered: ${formatValue(worksheet.optionFeeDeliveredDate)}`,
      `Additional earnest money: ${worksheet.additionalEarnestMoney || 'Not entered'}`,
      `Additional earnest-money period: ${worksheet.additionalEarnestMoneyDays || 'Not entered'} days`,
      '',
      'TITLE, CONDITION & CLOSING',
      `Title policy payer: ${worksheet.titlePolicyPayer || 'Not entered'}`,
      `Survey plan: ${worksheet.surveyPlan || 'Not entered'}`,
      `Title/survey notes: ${worksheet.titleAndSurveyNotes || 'Not entered'}`,
      `Condition/repair notes: ${worksheet.conditionAndRepairNotes || 'Not entered'}`,
      `Closing date: ${formatValue(worksheet.closingDate)}`,
      `Possession plan: ${worksheet.possessionPlan || 'Not entered'}`,
      '',
      'TERMS, NOTICES & ADDENDA',
      `Clarification notes: ${worksheet.specialProvisionsNotes || 'Not entered'}`,
      `Settlement/other expense notes: ${worksheet.settlementNotes || 'Not entered'}`,
      `Notices: ${worksheet.notices || 'Not entered'}`,
      `Effective date: ${formatValue(worksheet.effectiveDate)}`,
      `Addenda: ${selectedAddenda.length ? selectedAddenda.join('; ') : 'None selected'}`,
      '',
      'CALCULATED DEADLINES',
      ...deadlines.map((deadline) => `${deadline.label}: ${formatValue(deadline.date)}${deadline.timeLabel ? ` (${deadline.timeLabel})` : ''}`),
      '',
      'Review the current official TREC form and all addenda with a licensed Texas real-estate professional or attorney before signature.',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'trec-1-4-deal-prep-summary.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="pb-10">
      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-gray-500">
        <Link href="/admin/dashboard" className="font-medium text-gray-600 hover:text-orange-700">
          Agent Command Center
        </Link>
        <span aria-hidden="true">/</span>
        <span>TREC 1–4 Deal Prep</span>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-orange-700">
              <FileText className="h-4 w-4" aria-hidden="true" />
              Guided deal preparation
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-gray-950 sm:text-3xl">
              TREC 1–4 Residential Contract
            </h1>
            <p className="mt-3 text-sm leading-6 text-gray-600 sm:text-base">
              Organize the facts, dates and addenda needed for a Texas residential resale
              transaction before completing or reviewing the official form.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveDeal}
              disabled={saveState === 'saving'}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-orange-600 px-4 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-wait disabled:opacity-70"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {saveState === 'saving' ? 'Saving…' : currentDealId ? 'Save changes' : 'Save deal prep'}
            </button>
            <button
              type="button"
              onClick={startNewDeal}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              New deal
            </button>
            {currentDealId && (
              <button
                type="button"
                onClick={deleteDeal}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
          <p>
            This workspace is for educational and operational preparation only. It does not
            create, amend or replace an official TREC form, and it is not legal advice. Confirm
            the current official form, deadlines and addenda with a licensed Texas real-estate
            professional or attorney before signature.
          </p>
        </div>

        <div className="mt-5 grid gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Field
            id="dealTitle"
            label="Deal name"
            value={dealTitle}
            onChange={setDealTitle}
            placeholder={worksheet.propertyAddress || 'For example: 123 Main Street resale'}
            hint="Saved as structured deal-prep details only. No contract file is uploaded or stored."
          />
          <label htmlFor="savedDeal" className="block">
            <span className="text-sm font-medium text-gray-900">Saved deals</span>
            <select
              id="savedDeal"
              value={currentDealId ?? ''}
              onChange={(event) => selectDeal(event.target.value)}
              className="mt-1.5 block min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-950 shadow-sm outline-none focus:border-orange-600 focus:ring-2 focus:ring-orange-100"
            >
              <option value="">New unsaved deal</option>
              {savedDeals.map((deal) => <option key={deal.id} value={deal.id}>{deal.title}</option>)}
            </select>
            <span className="mt-1 block text-xs leading-5 text-gray-500">
              {currentDeal ? `Last saved ${formatSavedAt(currentDeal.updatedAt)}.` : 'Save this worksheet to add durable in-app reminders.'}
            </span>
          </label>
        </div>
        {saveState === 'error' && (
          <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {currentDealId ? 'This deal could not be saved. Check the details and try again.' : 'Save the deal before adding reminders, then try again.'}
          </p>
        )}
        {saveState === 'saved' && (
          <p role="status" className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Deal prep saved. Your Date Radar and in-app reminders are now tied to this transaction.
          </p>
        )}

        <div className="mt-5 grid gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:grid-cols-[minmax(0,300px)_1fr] sm:items-end">
          <Field
            id="effectiveDate"
            label="Contract effective date"
            value={worksheet.effectiveDate}
            onChange={(value) => {
              update('effectiveDate', value);
              if (value) {
                const date = new Date(`${value}T12:00:00`);
                setRadarMonth(new Date(date.getFullYear(), date.getMonth(), 1));
              }
            }}
            type="date"
            hint="This is day zero. Day one begins the next calendar day."
          />
          <p className="text-sm leading-6 text-gray-600">
            This calculator uses the current <a href="https://www.trec.texas.gov/forms/one-four-family-residential-contract-resale" target="_blank" rel="noreferrer" className="font-medium text-orange-700 underline underline-offset-2 hover:text-orange-800">TREC 20–19 form</a> timing:
            money delivery is due within three calendar days and rolls only when the last day is a
            Saturday, Sunday, or defined Legal Holiday. Other calculated periods do not roll.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
        <nav aria-label="Deal prep steps" className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <ol className="space-y-1">
            {STEPS.map((step, index) => {
              const isActive = activeStep === index;
              const isComplete = index < STEPS.length - 1 && completedSteps[index];
              return (
                <li key={step.title}>
                  <button
                    type="button"
                    onClick={() => setActiveStep(index)}
                    className={
                      'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition ' +
                      (isActive
                        ? 'bg-orange-50 text-orange-950'
                        : 'text-gray-700 hover:bg-gray-50')
                    }
                  >
                    <span
                      className={
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ' +
                        (isComplete
                          ? 'bg-emerald-600 text-white'
                          : isActive
                            ? 'bg-orange-600 text-white'
                            : 'bg-gray-100 text-gray-600')
                      }
                    >
                      {isComplete ? <Check className="h-4 w-4" aria-label="Complete" /> : index + 1}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{step.title}</span>
                      <span className="block text-xs text-gray-500">{step.detail}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <main className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-7 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]">
            <DateRadar
              deadlines={deadlines}
              reminders={reminders}
              month={radarMonth}
              onMonthChange={changeRadarMonth}
            />
            <section aria-label="Deadline reminders" className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-violet-700" aria-hidden="true" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-950">Deadline reminders</h2>
                  <p className="text-xs text-gray-500">Durable in-app reminders for this saved deal.</p>
                </div>
              </div>
              {!currentDealId ? (
                <p className="mt-5 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm leading-6 text-gray-600">
                  Save this deal to create reminders. The reminder list will appear here whenever the transaction is reopened.
                </p>
              ) : (
                <>
                  {selectedDeadline && (
                    <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 p-3">
                      <p className="text-sm font-semibold text-violet-950">Reminder for {selectedDeadline.label}</p>
                      <div className="mt-3 grid gap-3">
                        <Field id="reminderDate" label="Remind me on" value={reminderDate} onChange={setReminderDate} type="date" />
                        <Textarea id="reminderNote" label="Optional note" value={reminderNote} onChange={setReminderNote} placeholder="What needs attention?" />
                        <div className="flex gap-2">
                          <button type="button" onClick={createReminder} disabled={reminderState === 'saving' || !reminderDate} className="inline-flex min-h-10 items-center justify-center rounded-full bg-violet-700 px-4 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60">
                            {reminderState === 'saving' ? 'Saving…' : 'Save reminder'}
                          </button>
                          <button type="button" onClick={() => setSelectedDeadlineId('')} className="inline-flex min-h-10 items-center justify-center rounded-full border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
                        </div>
                      </div>
                    </div>
                  )}
                  {reminderState === 'error' && <p role="alert" className="mt-3 text-sm text-red-700">This reminder could not be saved. Try again.</p>}
                  {reminders.length === 0 ? (
                    <p className="mt-5 text-sm leading-6 text-gray-600">Use “Remind me” beside any calculated deadline to add the first reminder.</p>
                  ) : (
                    <ul className="mt-4 space-y-2">
                      {reminders.map((reminder) => {
                        const deadline = deadlines.find((item) => item.id === reminder.deadlineKey);
                        const overdue = !reminder.isComplete && reminder.reminderDate < isoToday();
                        return (
                          <li key={reminder.id} className="flex items-start gap-3 rounded-lg border border-gray-200 p-3">
                            <input
                              aria-label={`Mark reminder for ${deadline?.label ?? 'deadline'} complete`}
                              type="checkbox"
                              checked={reminder.isComplete}
                              onChange={(event) => updateReminder(reminder, event.target.checked)}
                              className="mt-1 h-4 w-4 rounded border-gray-300 text-violet-700 focus:ring-violet-600"
                            />
                            <div className="min-w-0 flex-1">
                              <p className={reminder.isComplete ? 'text-sm font-medium text-gray-500 line-through' : 'text-sm font-semibold text-gray-900'}>
                                {deadline?.label ?? 'Contract deadline'}
                              </p>
                              <p className={overdue ? 'mt-0.5 text-xs font-semibold text-red-700' : 'mt-0.5 text-xs text-gray-600'}>
                                {overdue ? 'Overdue: ' : 'Reminder: '}{formatValue(reminder.reminderDate)}
                              </p>
                              {reminder.note && <p className="mt-1 text-xs leading-5 text-gray-600">{reminder.note}</p>}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}
            </section>
          </div>
          {activeStep === 0 && (
            <section aria-labelledby="parties-property-title">
              <h2 id="parties-property-title" className="text-xl font-semibold text-gray-950">
                Parties & property
              </h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Record names exactly as they should appear on legal identification, then gather
                the property facts and any included or excluded items.
              </p>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <Field id="buyerNames" label="Buyer name(s)" value={worksheet.buyerNames} onChange={(value) => update('buyerNames', value)} hint="Use legal names." />
                <Field id="sellerNames" label="Seller name(s)" value={worksheet.sellerNames} onChange={(value) => update('sellerNames', value)} hint="Use legal names." />
                <Field id="propertyAddress" label="Property address" value={worksheet.propertyAddress} onChange={(value) => update('propertyAddress', value)} placeholder="Street, city, state, ZIP" />
                <Field id="county" label="County" value={worksheet.county} onChange={(value) => update('county', value)} />
              </div>
              <div className="mt-5 grid gap-5">
                <Textarea id="legalDescription" label="Legal description" value={worksheet.legalDescription} onChange={(value) => update('legalDescription', value)} hint="Lot, block, subdivision and any needed legal-description detail." />
                <Textarea id="improvementsAndAccessories" label="Included improvements & accessories" value={worksheet.improvementsAndAccessories} onChange={(value) => update('improvementsAndAccessories', value)} hint="For example: fixtures, built-in appliances, landscaping, curtains or blinds." />
                <Textarea id="exclusions" label="Excluded items" value={worksheet.exclusions} onChange={(value) => update('exclusions', value)} hint="List items the parties intend not to convey." />
              </div>
            </section>
          )}

          {activeStep === 1 && (
            <section aria-labelledby="price-financing-title">
              <h2 id="price-financing-title" className="text-xl font-semibold text-gray-950">Price & financing</h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Gather the agreed price components and align financing details with the lender and
                any financing addendum before the official form is completed.
              </p>
              <div className="mt-6 grid gap-5 sm:grid-cols-3">
                <Field id="cashPortion" label="Cash portion" value={worksheet.cashPortion} onChange={(value) => update('cashPortion', value)} placeholder="$0.00" />
                <Field id="loanAmount" label="Loan amount" value={worksheet.loanAmount} onChange={(value) => update('loanAmount', value)} placeholder="$0.00" />
                <Field id="salesPrice" label="Total sales price" value={worksheet.salesPrice} onChange={(value) => update('salesPrice', value)} placeholder="$0.00" />
              </div>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <Field id="financingType" label="Financing type" value={worksheet.financingType} onChange={(value) => update('financingType', value)} placeholder="Conventional, VA, cash, etc." />
                <Field id="financingNotes" label="Financing addendum / lender notes" value={worksheet.financingNotes} onChange={(value) => update('financingNotes', value)} placeholder="Approval, appraisal or buyer obligations" />
              </div>
            </section>
          )}

          {activeStep === 2 && (
            <section aria-labelledby="deposits-option-title">
              <h2 id="deposits-option-title" className="text-xl font-semibold text-gray-950">Deposits & option period</h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Capture the amounts, holder and delivery dates. The effective date on the executed
                contract drives critical deadlines, so confirm every timing item against the current official form.
              </p>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <Field id="earnestMoney" label="Earnest money amount" value={worksheet.earnestMoney} onChange={(value) => update('earnestMoney', value)} placeholder="$0.00" />
                <Field id="titleCompany" label="Earnest money holder / title company" value={worksheet.titleCompany} onChange={(value) => update('titleCompany', value)} />
                <Field id="earnestMoneyDeliveredDate" label="Earnest money delivered date" value={worksheet.earnestMoneyDeliveredDate} onChange={(value) => update('earnestMoneyDeliveredDate', value)} type="date" hint="Optional: record the actual delivery separately from the calculated deadline." />
                <Field id="optionFee" label="Option fee" value={worksheet.optionFee} onChange={(value) => update('optionFee', value)} placeholder="$0.00" />
                <Field id="optionDays" label="Option period days" value={worksheet.optionDays} onChange={(value) => update('optionDays', value)} type="number" placeholder="0" />
                <Field id="optionFeeDeliveredDate" label="Option fee delivered date" value={worksheet.optionFeeDeliveredDate} onChange={(value) => update('optionFeeDeliveredDate', value)} type="date" hint="Optional: record the actual delivery separately from the calculated deadline." />
                <Field id="additionalEarnestMoney" label="Additional earnest money amount" value={worksheet.additionalEarnestMoney} onChange={(value) => update('additionalEarnestMoney', value)} placeholder="$0.00" />
                <Field id="additionalEarnestMoneyDays" label="Additional earnest money days after effective date" value={worksheet.additionalEarnestMoneyDays} onChange={(value) => update('additionalEarnestMoneyDays', value)} type="number" placeholder="0" />
              </div>
              <DeadlineMath deadlines={deadlines.filter((deadline) => deadline.category === 'money' || deadline.category === 'option')} onAddReminder={currentDealId ? openReminder : undefined} />
            </section>
          )}

          {activeStep === 3 && (
            <section aria-labelledby="title-closing-title">
              <h2 id="title-closing-title" className="text-xl font-semibold text-gray-950">Title, condition & closing</h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Consolidate the decisions and facts that shape due diligence, repair negotiation,
                the closing date and possession.
              </p>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <Field id="titlePolicyPayer" label="Title policy payer" value={worksheet.titlePolicyPayer} onChange={(value) => update('titlePolicyPayer', value)} placeholder="Buyer, seller or negotiated" />
                <Field id="surveyPlan" label="Survey plan" value={worksheet.surveyPlan} onChange={(value) => update('surveyPlan', value)} placeholder="Existing survey, new survey, etc." />
                <Field id="closingDate" label="Target closing date" value={worksheet.closingDate} onChange={(value) => update('closingDate', value)} type="date" />
                <Field id="possessionPlan" label="Possession plan" value={worksheet.possessionPlan} onChange={(value) => update('possessionPlan', value)} placeholder="Upon closing and funding, leaseback, etc." />
              </div>
              <div className="mt-5 grid gap-5">
                <Textarea id="titleAndSurveyNotes" label="Title, survey & objections notes" value={worksheet.titleAndSurveyNotes} onChange={(value) => update('titleAndSurveyNotes', value)} hint="Flag commitments, survey facts, potential objections, easements or restrictions for review." />
                <Textarea id="conditionAndRepairNotes" label="Property condition & repair notes" value={worksheet.conditionAndRepairNotes} onChange={(value) => update('conditionAndRepairNotes', value)} hint="Capture disclosure, inspection, utilities and lender-required repair items for negotiation and review." />
              </div>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <Field id="financingDeadlineDays" label="Financing addendum days after effective date" value={worksheet.financingDeadlineDays} onChange={(value) => update('financingDeadlineDays', value)} type="number" placeholder="Set from executed addendum" />
                <Field id="appraisalDeadlineDays" label="Appraisal deadline days after effective date" value={worksheet.appraisalDeadlineDays} onChange={(value) => update('appraisalDeadlineDays', value)} type="number" placeholder="Set from executed addendum" />
                <Field id="titleCommitmentDays" label="Title commitment days after effective date" value={worksheet.titleCommitmentDays} onChange={(value) => update('titleCommitmentDays', value)} type="number" placeholder="Set from executed contract" />
                <Field id="surveyDays" label="Survey days after effective date" value={worksheet.surveyDays} onChange={(value) => update('surveyDays', value)} type="number" placeholder="Set from executed contract" />
                <Field id="titleObjectionDays" label="Title objection days after effective date" value={worksheet.titleObjectionDays} onChange={(value) => update('titleObjectionDays', value)} type="number" placeholder="Set from executed contract" />
              </div>
              <DeadlineMath deadlines={deadlines.filter((deadline) => deadline.category === 'contract-period')} onAddReminder={currentDealId ? openReminder : undefined} />
            </section>
          )}

          {activeStep === 4 && (
            <section aria-labelledby="terms-addenda-title">
              <h2 id="terms-addenda-title" className="text-xl font-semibold text-gray-950">Terms, notices & addenda</h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Use this page to prepare discussion points and verify attachments. Do not draft legal
                language in special provisions; keep this workspace to factual notes for review.
              </p>
              <div className="mt-6 grid gap-5">
                <Textarea id="specialProvisionsNotes" label="Clarification notes for review" value={worksheet.specialProvisionsNotes} onChange={(value) => update('specialProvisionsNotes', value)} hint="Use factual, non-legal discussion notes only." />
                <Textarea id="settlementNotes" label="Settlement, expense, proration & other notes" value={worksheet.settlementNotes} onChange={(value) => update('settlementNotes', value)} hint="Consider expenses, warranties, HOA transfers, tax proration, casualty, escrow and FIRPTA questions." />
              </div>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <Field id="notices" label="Notices & contact details" value={worksheet.notices} onChange={(value) => update('notices', value)} hint="Confirm email, addresses and phone numbers." />
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-sm leading-6 text-gray-600">
                  <span className="font-medium text-gray-900">Effective date:</span>{' '}
                  {worksheet.effectiveDate ? formatValue(worksheet.effectiveDate) : 'Set above to activate deadline math.'}
                </div>
              </div>
              <fieldset className="mt-6">
                <legend className="text-sm font-medium text-gray-900">Expected addenda</legend>
                <p className="mt-1 text-xs leading-5 text-gray-500">
                  Select items to verify. This checklist does not determine which addenda are required.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {ADDENDA.map((addendum) => (
                    <label key={addendum} className="flex min-h-11 items-center gap-3 rounded-md border border-gray-200 px-3 text-sm text-gray-700 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={Boolean(addenda[addendum])}
                        onChange={(event) => setAddenda((current) => ({ ...current, [addendum]: event.target.checked }))}
                        className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-600"
                      />
                      {addendum}
                    </label>
                  ))}
                </div>
              </fieldset>
            </section>
          )}

          {activeStep === 5 && (
            <section aria-labelledby="review-title">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <h2 id="review-title" className="text-xl font-semibold text-gray-950">Review deal-prep brief</h2>
                  <p className="mt-2 text-sm leading-6 text-gray-600">
                    Review the information collected here with the official current form, all addenda
                    and the licensed professional or attorney handling the transaction.
                  </p>
                </div>
                <button type="button" onClick={exportSummary} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-orange-600 px-4 text-sm font-semibold text-white hover:bg-orange-700">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Export summary
                </button>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {[
                  ['Buyer(s)', worksheet.buyerNames], ['Seller(s)', worksheet.sellerNames],
                  ['Property', worksheet.propertyAddress], ['Total sales price', worksheet.salesPrice],
                  ['Earnest money', worksheet.earnestMoney], ['Option period', worksheet.optionDays ? `${worksheet.optionDays} days` : ''],
                  ['Title company', worksheet.titleCompany], ['Closing date', worksheet.closingDate],
                  ['Effective date', worksheet.effectiveDate], ['Addenda', selectedAddenda.join(', ')],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
                    <dd className="mt-1 text-sm font-medium text-gray-900">{formatValue(value)}</dd>
                  </div>
                ))}
              </div>
              <DeadlineMath deadlines={deadlines} onAddReminder={currentDealId ? openReminder : undefined} />
              <div className="mt-6 rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm leading-6 text-orange-950">
                Before signature, confirm that names, monetary amounts, delivery deadlines, notices,
                the effective date and every applicable addendum match the current official package.
              </div>
            </section>
          )}

          <div className="mt-8 flex items-center justify-between gap-3 border-t border-gray-100 pt-5">
            <button
              type="button"
              onClick={() => setActiveStep((step) => Math.max(step - 1, 0))}
              disabled={activeStep === 0}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 enabled:hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </button>
            {activeStep < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setActiveStep((step) => Math.min(step + 1, STEPS.length - 1))}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-orange-600 px-5 text-sm font-semibold text-white hover:bg-orange-700"
              >
                Continue
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : (
              <Link href="/admin/dashboard" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-orange-600 px-5 text-sm font-semibold text-white hover:bg-orange-700">
                Return to Command Center
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
