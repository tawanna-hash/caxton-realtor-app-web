'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { InvoiceWithAdvertiser } from '@/lib/invoices';
import { formatCents } from '@/lib/invoices';
import { computeNextRun, isScheduleExhausted, type RecurringScheduleWithAdvertiser } from '@/lib/recurring-invoices';

function fmtDay(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' });
}

function everyLabel(freq: string, n: number): string {
  const unit = freq.replace(/ly$/, '').replace('annual', 'year').replace('bi-week', 'two weeks');
  return n > 1 ? `Every ${n} ${unit}s` : freq.charAt(0).toUpperCase() + freq.slice(1);
}

export function ScheduledInvoicesPanel({ drafts, onEditDraft, onSendDraft }: {
  drafts: InvoiceWithAdvertiser[];
  onEditDraft: (invoice: InvoiceWithAdvertiser) => void;
  onSendDraft: (invoice: InvoiceWithAdvertiser) => void;
}) {
  const [schedules, setSchedules] = useState<RecurringScheduleWithAdvertiser[] | null>(null);
  const [error, setError] = useState('');
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let live = true;
    fetch('/api/admin/recurring-invoices?status=active', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? 'Could not load scheduled invoices.');
        if (live) setSchedules(data.schedules ?? []);
      })
      .catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : 'Could not load scheduled invoices.'); });
    return () => { live = false; };
  }, []);

  const upcoming = useMemo(() => {
    return (schedules ?? [])
      .filter((s) => s.status === 'active' && (!s.max_occurrences || s.occurrences_generated < s.max_occurrences))
      .filter((s) => !s.end_date || new Date(s.next_run_at) <= new Date(`${String(s.end_date).slice(0, 10)}T23:59:59Z`))
      .sort((a, b) => new Date(a.next_run_at).getTime() - new Date(b.next_run_at).getTime());
  }, [schedules]);

  const sortedDrafts = useMemo(
    () => [...drafts].sort((a, b) => String(a.issued_at ?? a.created_at).localeCompare(String(b.issued_at ?? b.created_at))),
    [drafts],
  );

  // Active schedules that stop on their own (end date or invoice limit), with
  // the remaining invoices projected forward from the next run.
  const ending = useMemo(() => {
    const rows = [];
    for (const s of schedules ?? []) {
      if (s.status !== 'active' || (!s.end_date && s.max_occurrences == null)) continue;
      let occ = s.occurrences_generated;
      let next = new Date(s.next_run_at);
      let remaining = 0;
      let last: Date | null = null;
      while (remaining < 600 && !isScheduleExhausted({ end_date: s.end_date, max_occurrences: s.max_occurrences, occurrences_generated: occ, next_run_at: next.toISOString() })) {
        remaining += 1;
        last = next;
        occ += 1;
        next = computeNextRun(next, s.frequency, s.interval_count);
      }
      rows.push({ s, remaining, last, amount: remaining * ((s.amount_cents ?? 0) + (s.tax_cents ?? 0)) });
    }
    return rows.sort((a, b) => (a.last?.getTime() ?? 0) - (b.last?.getTime() ?? 0));
  }, [schedules]);
  const endingTotal = ending.reduce((n, r) => n + r.amount, 0);
  const soon = now + 60 * 86_400_000;

  const upcomingTotal = upcoming.reduce((n, s) => n + (s.amount_cents ?? 0) + (s.tax_cents ?? 0), 0);
  const draftTotal = sortedDrafts.reduce((n, inv) => n + inv.total_cents, 0);

  const th = 'px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500';
  const td = 'px-4 py-3 text-sm text-gray-800';

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4 rounded border border-gray-200 bg-white px-4 py-4 shadow-sm">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Scheduled total</div>
          <div className="text-3xl font-semibold text-gray-900">{formatCents(upcomingTotal + draftTotal)}</div>
          <div className="text-xs text-gray-500">{upcoming.length + sortedDrafts.length} invoice{upcoming.length + sortedDrafts.length === 1 ? '' : 's'} not yet sent</div>
        </div>
        <div className="flex gap-8 text-sm">
          <div>
            <div className="text-xs text-gray-500">To be created</div>
            <div className="font-semibold text-gray-900">{formatCents(upcomingTotal)}</div>
            <div className="text-xs text-gray-500">{upcoming.length} schedule{upcoming.length === 1 ? '' : 's'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Drafts</div>
            <div className="font-semibold text-gray-900">{formatCents(draftTotal)}</div>
            <div className="text-xs text-gray-500">{sortedDrafts.length} draft{sortedDrafts.length === 1 ? '' : 's'}</div>
          </div>
        </div>
      </section>

      <section className="rounded border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-base font-semibold text-gray-900">Scheduled to be created</h2>
          <p className="text-xs text-gray-500">Next invoice from each active recurring schedule. Edit or pause a schedule before it runs.</p>
        </div>
        {error && <div className="px-4 py-3 text-sm text-red-700">{error}</div>}
        {schedules === null && !error && <div className="p-8 text-center text-sm text-gray-500">Loading scheduled invoices...</div>}
        {schedules !== null && upcoming.length === 0 && <div className="p-8 text-center text-sm text-gray-500">No upcoming scheduled invoices.</div>}
        {upcoming.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className={th}>Created on</th>
                  <th className={th}>Invoice date</th>
                  <th className={th}>Client</th>
                  <th className={th}>Schedule</th>
                  <th className={`${th} text-right`}>Amount</th>
                  <th className={th}>When created</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {upcoming.map((s) => {
                  const runAt = new Date(s.next_run_at);
                  const createOn = new Date(runAt.getTime() - (s.create_days_in_advance ?? 0) * 86_400_000);
                  return (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className={td}>{fmtDay(createOn)}</td>
                      <td className={td}>{fmtDay(runAt)}</td>
                      <td className={td}>
                        <div className="font-medium">{s.advertiser_name ?? 'Unknown client'}</div>
                        {s.bill_to_email && <div className="text-xs text-gray-500">{s.bill_to_email}</div>}
                      </td>
                      <td className={td}>
                        <div>{s.name}</div>
                        <div className="text-xs text-gray-500">{everyLabel(s.frequency, s.interval_count)}</div>
                      </td>
                      <td className={`${td} text-right font-medium`}>{formatCents((s.amount_cents ?? 0) + (s.tax_cents ?? 0))}</td>
                      <td className={td}>
                        <span className={`inline-flex rounded-md border px-3 py-0.5 text-xs font-medium ${s.auto_send ? 'border-[#FAD800]/40 bg-[#FEF8CC] text-[#645600]' : 'border-gray-300 bg-gray-100 text-gray-700'}`}>
                          {s.auto_send ? 'Emails automatically' : 'Held as draft'}
                        </span>
                      </td>
                      <td className={`${td} text-right`}>
                        <Link href="/admin/billing-hub?tab=recurring" className="font-medium text-[#301D5D] hover:underline">Edit schedule</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-300 bg-gray-50">
                  <td className={`${td} font-semibold`} colSpan={4}>Subtotal</td>
                  <td className={`${td} text-right font-semibold`}>{formatCents(upcomingTotal)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="rounded border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-base font-semibold text-gray-900">Drafts, created but not sent</h2>
          <p className="text-xs text-gray-500">Review each invoice, then send it when ready.</p>
        </div>
        {sortedDrafts.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">No drafts waiting to be sent.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className={th}>Date</th>
                  <th className={th}>No.</th>
                  <th className={th}>Client</th>
                  <th className={`${th} text-right`}>Amount</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedDrafts.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className={td}>{fmtDay(inv.issued_at ?? inv.created_at)}</td>
                    <td className={td}>{inv.number}</td>
                    <td className={td}>
                      <div className="font-medium">{inv.advertiser_name ?? inv.bill_to_name ?? 'Client'}</div>
                      {inv.bill_to_email ? <div className="text-xs text-gray-500">{inv.bill_to_email}</div> : <div className="text-xs text-red-700">Missing email</div>}
                    </td>
                    <td className={`${td} text-right font-medium`}>{formatCents(inv.total_cents)}</td>
                    <td className={`${td} text-right whitespace-nowrap`}>
                      <button type="button" onClick={() => onEditDraft(inv)} className="mr-2 rounded border border-gray-300 px-3 py-1 text-xs font-medium hover:bg-gray-50">Edit</button>
                      <button type="button" onClick={() => onSendDraft(inv)} className="rounded bg-[#301D5D] px-3 py-1 text-xs font-medium text-white">Review and send</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-300 bg-gray-50">
                  <td className={`${td} font-semibold`} colSpan={3}>Subtotal</td>
                  <td className={`${td} text-right font-semibold`}>{formatCents(draftTotal)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="rounded border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-base font-semibold text-gray-900">Recurring invoices that end</h2>
          <p className="text-xs text-gray-500">Active schedules with an end date or invoice limit, soonest ending first. Edit a schedule to extend or renew it.</p>
        </div>
        {schedules === null && !error ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading...</div>
        ) : ending.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">No recurring schedules have an end set.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className={th}>Final invoice</th>
                  <th className={th}>Client</th>
                  <th className={th}>Schedule</th>
                  <th className={th}>Ends because</th>
                  <th className={`${th} text-right`}>Invoices left</th>
                  <th className={`${th} text-right`}>Left to bill</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ending.map(({ s, remaining, last, amount }) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className={td}>
                      <div>{last ? fmtDay(last) : '-'}</div>
                      {last && last.getTime() <= soon && (
                        <span className="mt-1 inline-flex rounded-md border border-[#FF2A04]/30 bg-[#FFEAE6] px-2 py-0.5 text-[11px] font-medium text-[#661102]">Ending soon</span>
                      )}
                    </td>
                    <td className={td}><div className="font-medium">{s.advertiser_name ?? 'Unknown client'}</div></td>
                    <td className={td}>
                      <div>{s.name}</div>
                      <div className="text-xs text-gray-500">{everyLabel(s.frequency, s.interval_count)}</div>
                    </td>
                    <td className={td}>
                      {s.end_date ? `End date ${fmtDay(`${String(s.end_date).slice(0, 10)}T12:00:00Z`)}` : `After ${s.max_occurrences} invoices (${s.occurrences_generated} sent)`}
                    </td>
                    <td className={`${td} text-right`}>{remaining}</td>
                    <td className={`${td} text-right font-medium`}>{formatCents(amount)}</td>
                    <td className={`${td} text-right`}>
                      <Link href="/admin/billing-hub?tab=recurring" className="font-medium text-[#301D5D] hover:underline">Edit schedule</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-300 bg-gray-50">
                  <td className={`${td} font-semibold`} colSpan={5}>Subtotal</td>
                  <td className={`${td} text-right font-semibold`}>{formatCents(endingTotal)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
