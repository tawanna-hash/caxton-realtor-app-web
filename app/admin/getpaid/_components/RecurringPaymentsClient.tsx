'use client';

import { useState } from 'react';
import type { RecurringScheduleWithAdvertiser } from '@/lib/recurring-invoices';
import { frequencyLabel } from '@/lib/recurring-invoices';
import type { AgreementWithAdvertiser } from '@/lib/agreements';
import type { AdvertiserOption } from '@/app/admin/billing/_components/types';
import { formatCents } from '@/lib/invoices';
import { RecurringScheduleDrawer } from '@/app/admin/ar/RecurringScheduleDrawer';
import PageTitle from '@/components/ui/PageTitle';

export function RecurringPaymentsClient({ initialSchedules, advertisers, agreements }: { initialSchedules: RecurringScheduleWithAdvertiser[]; advertisers: AdvertiserOption[]; agreements: AgreementWithAdvertiser[] }) {
  const [schedules, setSchedules] = useState(initialSchedules);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RecurringScheduleWithAdvertiser | null>(null);
  const [error, setError] = useState('');
  const reload = async () => {
    const response = await fetch('/api/admin/recurring-invoices', { cache: 'no-store' });
    if (response.ok) setSchedules((await response.json()).schedules ?? []);
  };
  return (
    <div className="mx-auto max-w-7xl space-y-5 px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-gray-500">Admin · Get Paid</div><PageTitle size="md">Recurring payments</PageTitle><p className="mt-1 text-sm text-gray-600">Manage recurring invoice templates, billing intervals, and reminders.</p></div><button type="button" onClick={() => setCreating(true)} className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700">Create recurring payment</button></div>
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
        <table className="w-full text-left text-sm"><thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500"><tr><th className="px-4 py-3">Client</th><th className="px-4 py-3">Interval</th><th className="px-4 py-3">Next charge</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-gray-100">{schedules.map((schedule) => <tr key={schedule.id}><td className="px-4 py-3">{schedule.advertiser_name ?? `Partner ${schedule.advertiser_id}`}</td><td className="px-4 py-3">{frequencyLabel(schedule.frequency)}</td><td className="px-4 py-3">{schedule.next_run_at?.slice(0, 10) ?? '—'}</td><td className="px-4 py-3">{formatCents(schedule.amount_cents + schedule.tax_cents)}</td><td className="px-4 py-3 capitalize">{schedule.status}</td><td className="px-4 py-3 text-right"><button type="button" onClick={() => setEditing(schedule)} className="text-orange-700 hover:underline">Edit</button></td></tr>)}</tbody></table>
        {schedules.length === 0 && <div className="p-10 text-center text-sm text-gray-500">No recurring payments yet.</div>}
      </div>
      {creating && <RecurringScheduleDrawer advertisers={advertisers} agreements={agreements} onClose={() => setCreating(false)} onSaved={async () => { setCreating(false); await reload(); }} onError={setError} />}
      {editing && <RecurringScheduleDrawer existing={editing} advertisers={advertisers} agreements={agreements} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(); }} onError={setError} />}
    </div>
  );
}
