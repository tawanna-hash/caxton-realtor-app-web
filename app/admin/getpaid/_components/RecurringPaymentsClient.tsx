'use client';

import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
  Search,
} from 'lucide-react';
import type {
  RecurringFrequency,
  RecurringScheduleStatus,
  RecurringScheduleWithAdvertiser,
} from '@/lib/recurring-invoices';
import { frequencyLabel } from '@/lib/recurring-invoices';
import type { AgreementWithAdvertiser } from '@/lib/agreements';
import type { AdvertiserOption } from '@/app/admin/billing/_components/types';
import { formatCents } from '@/lib/invoices';
import { RecurringScheduleDrawer } from '@/app/admin/ar/RecurringScheduleDrawer';
import PageTitle from '@/components/ui/PageTitle';

type StatusFilter = 'all' | RecurringScheduleStatus;
type FrequencyFilter = 'all' | RecurringFrequency;

const CONTROL =
  'h-9 rounded border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-sm outline-none transition focus:border-orange-500 focus:ring-1 focus:ring-orange-500';
const ORANGE_BUTTON =
  'inline-flex h-9 items-center justify-center gap-2 rounded bg-orange-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2';

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function scheduleAmount(schedule: RecurringScheduleWithAdvertiser) {
  return schedule.amount_cents + schedule.tax_cents;
}

function SummaryMetric({
  amount,
  count,
  label,
}: {
  amount: number;
  count: number;
  label: string;
}) {
  return (
    <div className="min-w-0 px-3 py-1 first:pl-0">
      <div className="text-lg font-semibold leading-tight text-gray-900">{formatCents(amount)}</div>
      <div className="mt-0.5 truncate text-xs text-gray-600">
        {count.toLocaleString()} {label}
      </div>
    </div>
  );
}

function StatusCell({ status }: { status: RecurringScheduleStatus }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-gray-700">
        <CheckCircle2 className="h-4 w-4 fill-emerald-600 text-white" aria-hidden="true" />
        Active
      </span>
    );
  }
  if (status === 'paused') {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-gray-700">
        <Clock3 className="h-4 w-4 text-orange-600" aria-hidden="true" />
        Paused
      </span>
    );
  }
  return <span className="whitespace-nowrap text-gray-500">Ended</span>;
}

export function RecurringPaymentsClient({
  initialSchedules,
  advertisers,
  agreements,
}: {
  initialSchedules: RecurringScheduleWithAdvertiser[];
  advertisers: AdvertiserOption[];
  agreements: AgreementWithAdvertiser[];
}) {
  const [schedules, setSchedules] = useState(initialSchedules);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RecurringScheduleWithAdvertiser | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [frequency, setFrequency] = useState<FrequencyFilter>('all');
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [summaryTimestamp] = useState(() => Date.now());

  const summary = useMemo(() => {
    const active = schedules.filter((schedule) => schedule.status === 'active');
    const paused = schedules.filter((schedule) => schedule.status === 'paused');
    const nextThirtyDays = active.filter((schedule) => {
      const nextRun = new Date(schedule.next_run_at).getTime();
      return (
        nextRun >= summaryTimestamp &&
        nextRun <= summaryTimestamp + 30 * 24 * 60 * 60 * 1000
      );
    });
    return {
      activeAmount: active.reduce((sum, schedule) => sum + scheduleAmount(schedule), 0),
      pausedAmount: paused.reduce((sum, schedule) => sum + scheduleAmount(schedule), 0),
      nextAmount: nextThirtyDays.reduce((sum, schedule) => sum + scheduleAmount(schedule), 0),
      autoSendAmount: active
        .filter((schedule) => schedule.auto_send)
        .reduce((sum, schedule) => sum + scheduleAmount(schedule), 0),
      activeCount: active.length,
      pausedCount: paused.length,
      nextCount: nextThirtyDays.length,
      autoSendCount: active.filter((schedule) => schedule.auto_send).length,
    };
  }, [schedules, summaryTimestamp]);

  const filteredSchedules = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return schedules.filter((schedule) => {
      if (status !== 'all' && schedule.status !== status) return false;
      if (frequency !== 'all' && schedule.frequency !== frequency) return false;
      if (!normalizedQuery) return true;
      return [
        schedule.name,
        schedule.advertiser_name,
        schedule.bill_to_name,
        schedule.bill_to_email,
        schedule.memo,
      ].some((value) => value?.toLowerCase().includes(normalizedQuery));
    });
  }, [frequency, query, schedules, status]);

  const totalPages = Math.max(1, Math.ceil(filteredSchedules.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredSchedules.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const filteredAmount = filteredSchedules.reduce((sum, schedule) => sum + scheduleAmount(schedule), 0);

  const updateFilters = (update: () => void) => {
    update();
    setPage(1);
  };

  const reload = async () => {
    const response = await fetch('/api/admin/recurring-invoices', { cache: 'no-store' });
    if (!response.ok) {
      setError('Could not refresh recurring payments.');
      return;
    }
    setSchedules((await response.json()).schedules ?? []);
    setError('');
  };

  const savedCreate = async () => {
    setCreating(false);
    await reload();
  };

  const savedEdit = async () => {
    setEditing(null);
    await reload();
  };

  const pauseSchedule = async (schedule: RecurringScheduleWithAdvertiser) => {
    try {
      const response = await fetch(`/api/admin/recurring-invoices/${schedule.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'paused' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'Could not pause schedule.');
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not pause schedule.'); }
  };

  const permanentlyDelete = async (schedule: RecurringScheduleWithAdvertiser) => {
    if (schedule.status === 'active') { setError('Pause the active schedule before permanent deletion.'); return; }
    const confirmation = window.prompt(`Permanent deletion cannot be undone. Type this schedule ID to delete it:\n${schedule.id}`);
    if (confirmation !== schedule.id) { setError('Schedule was not deleted: the typed ID did not match.'); return; }
    try {
      const response = await fetch(`/api/admin/recurring-invoices/${schedule.id}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permanent: true, confirmation_id: confirmation }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'Could not permanently delete schedule.');
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not permanently delete schedule.'); }
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 px-5 py-7 lg:px-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">
            Admin · Get Paid
          </div>
          <PageTitle size="md">Recurring payments</PageTitle>
        </div>
      </header>

      <section aria-label="Recurring payment summary" className="bg-white">
        <div className="grid grid-cols-2 gap-y-3 md:grid-cols-4">
          <SummaryMetric amount={summary.activeAmount} count={summary.activeCount} label="active schedules" />
          <SummaryMetric amount={summary.nextAmount} count={summary.nextCount} label="due in 30 days" />
          <SummaryMetric amount={summary.autoSendAmount} count={summary.autoSendCount} label="auto-send enabled" />
          <SummaryMetric amount={summary.pausedAmount} count={summary.pausedCount} label="paused schedules" />
        </div>
        <div className="mt-2 flex h-4 overflow-hidden rounded-sm bg-gray-200" aria-hidden="true">
          <div
            className="bg-emerald-600"
            style={{
              width: `${schedules.length ? (summary.activeCount / schedules.length) * 100 : 0}%`,
            }}
          />
          <div
            className="bg-orange-400"
            style={{
              width: `${schedules.length ? (summary.pausedCount / schedules.length) * 100 : 0}%`,
            }}
          />
          <div className="flex-1 bg-gray-300" />
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <section aria-label="Recurring payment filters" className="flex flex-wrap items-end gap-2">
        <label className="space-y-1">
          <span className="block text-xs text-gray-500">Status</span>
          <select
            className={`${CONTROL} min-w-36`}
            value={status}
            onChange={(event) => updateFilters(() => setStatus(event.target.value as StatusFilter))}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="ended">Ended</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-gray-500">Interval</span>
          <select
            className={`${CONTROL} min-w-40`}
            value={frequency}
            onChange={(event) =>
              updateFilters(() => setFrequency(event.target.value as FrequencyFilter))
            }
          >
            <option value="all">All intervals</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every 2 weeks</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annually">Annually</option>
          </select>
        </label>
        <label className="min-w-64 flex-1 space-y-1">
          <span className="block text-xs text-gray-500">Search</span>
          <span className="relative block">
            <Search
              className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400"
              aria-hidden="true"
            />
            <input
              type="search"
              className={`${CONTROL} w-full pl-9`}
              placeholder="Schedule, client, or email"
              value={query}
              onChange={(event) => updateFilters(() => setQuery(event.target.value))}
            />
          </span>
        </label>
        <button type="button" className={`${ORANGE_BUTTON} ml-auto`} onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Create recurring payment
        </button>
      </section>

      <section className="rounded border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] table-fixed text-left text-xs">
            <thead className="border-b border-gray-300 bg-white text-gray-700">
              <tr>
                <th className="w-56 px-3 py-3 font-semibold">Schedule</th>
                <th className="w-56 px-2 py-3 font-semibold">Client</th>
                <th className="w-36 px-2 py-3 font-semibold">Interval</th>
                <th className="w-36 px-2 py-3 font-semibold">Next charge</th>
                <th className="w-28 px-2 py-3 text-right font-semibold">Amount</th>
                <th className="w-28 px-2 py-3 font-semibold">Delivery</th>
                <th className="w-28 px-2 py-3 font-semibold">Status</th>
                <th className="w-28 px-3 py-3 text-right font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {pageRows.map((schedule) => (
                <tr key={schedule.id} className="hover:bg-orange-50/40">
                  <td className="truncate px-3 py-2.5 font-medium text-gray-900" title={schedule.name}>
                    {schedule.name}
                  </td>
                  <td
                    className="truncate px-2 py-2.5 text-gray-800"
                    title={schedule.advertiser_name ?? schedule.bill_to_name ?? ''}
                  >
                    {schedule.advertiser_name ?? schedule.bill_to_name ?? `Partner ${schedule.advertiser_id}`}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-gray-700">
                    {schedule.interval_count > 1
                      ? `Every ${schedule.interval_count} ${frequencyLabel(schedule.frequency).toLowerCase()}`
                      : frequencyLabel(schedule.frequency)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-gray-700">
                    {formatDate(schedule.next_run_at)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-right font-medium text-gray-900">
                    {formatCents(scheduleAmount(schedule))}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-gray-700">
                    {schedule.auto_send ? 'Auto-send' : 'Manual'}
                  </td>
                  <td className="px-2 py-2.5">
                    <StatusCell status={schedule.status} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    <button
                      type="button"
                      className="font-medium text-orange-700 hover:underline"
                      onClick={() => setEditing(schedule)}
                    >
                      View/Edit
                    </button>
                    {schedule.status === 'active' ? (
                      <button type="button" className="font-medium text-orange-700 hover:underline" onClick={() => void pauseSchedule(schedule)}>Pause</button>
                    ) : (
                      <button type="button" className="font-medium text-rose-700 hover:underline" onClick={() => void permanentlyDelete(schedule)}>Permanent delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pageRows.length === 0 && (
          <div className="p-12 text-center">
            <Clock3 className="mx-auto h-8 w-8 text-gray-300" aria-hidden="true" />
            <div className="mt-3 text-sm font-medium text-gray-800">No recurring payments found</div>
            <p className="mt-1 text-sm text-gray-500">
              {schedules.length
                ? 'Adjust your filters to see more results.'
                : 'Create a schedule to automate repeat billing.'}
            </p>
            {!schedules.length && (
              <button
                type="button"
                className="mt-4 text-sm font-medium text-orange-700 hover:underline"
                onClick={() => setCreating(true)}
              >
                Create recurring payment
              </button>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-300 bg-gray-50 px-4 py-3 text-xs text-gray-700">
          <div className="font-semibold">
            Total <span className="ml-8">{formatCents(filteredAmount)}</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1">
              Rows
              <select
                className="rounded border border-gray-300 bg-white px-1 py-1"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
            <span>
              {filteredSchedules.length
                ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filteredSchedules.length)} of ${filteredSchedules.length}`
                : '0 results'}
            </span>
            <button
              type="button"
              className="rounded p-1 hover:bg-gray-200 disabled:opacity-40"
              disabled={currentPage === 1}
              onClick={() => setPage(1)}
            >
              First
            </button>
            <button
              type="button"
              aria-label="Previous page"
              className="rounded p-1 hover:bg-gray-200 disabled:opacity-40"
              disabled={currentPage === 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Next page"
              className="rounded p-1 hover:bg-gray-200 disabled:opacity-40"
              disabled={currentPage === totalPages}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="rounded p-1 hover:bg-gray-200 disabled:opacity-40"
              disabled={currentPage === totalPages}
              onClick={() => setPage(totalPages)}
            >
              Last
            </button>
          </div>
        </div>
      </section>

      {creating && (
        <RecurringScheduleDrawer
          advertisers={advertisers}
          agreements={agreements}
          onClose={() => setCreating(false)}
          onSaved={savedCreate}
          onError={setError}
        />
      )}
      {editing && (
        <RecurringScheduleDrawer
          existing={editing}
          advertisers={advertisers}
          agreements={agreements}
          onClose={() => setEditing(null)}
          onSaved={savedEdit}
          onError={setError}
        />
      )}
    </div>
  );
}
