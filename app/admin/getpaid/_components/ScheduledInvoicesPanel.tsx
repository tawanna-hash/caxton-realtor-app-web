'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { InvoiceWithAdvertiser } from '@/lib/invoices';
import { formatCents } from '@/lib/invoices';
import type { RecurringScheduleWithAdvertiser } from '@/lib/recurring-invoices';

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
      .filter((s) => !s.end_date || new Date(s.next_run_at) <= new Date(s.end_date))
      .sort((a, b) => new Date(a.next_run_at).getTime() - new Date(b.next_run_at).getTime());
  }, [schedules]);

  const sortedDrafts = useMemo(
    () => [...drafts].sort((a, b) => String(a.issued_at ?? a.created_at).localeCompare(String(b.issued_at ?? b.created_at))),
    [drafts],
  );

  const th = 'px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500';
  const td = 'px-4 py-3 text-sm text-gray-800';

  return (
    <div className="space-y-6">
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
                        <span className={`inline-flex rounded-full border px-3 py-0.5 text-xs font-medium ${s.auto_send ? 'border-[#FAD800]/40 bg-[#FEF8CC] text-[#645600]' : 'border-gray-300 bg-gray-100 text-gray-700'}`}>
                          {s.auto_send ? 'Emails automatically' : 'Held as draft'}
                        </span>
                      </td>
                      <td className={`${td} text-right`}>
                        <Link href="/admin/getpaid/reoccuringpayments" className="font-medium text-[#301D5D] hover:underline">Edit schedule</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
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
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
