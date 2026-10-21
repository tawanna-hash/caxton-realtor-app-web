'use client';

// Dashboard (Beta): Anchor's dashboard layout, fed by this app's own data.
// Sections: setup checklist, Invoices, Agreements, Payouts, Revenue, Sent agreements.

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { A } from '@/components/anchor/ui';
import { computeNextRun, type RecurringFrequency } from '@/lib/recurring-invoices';
import { money, useJson, day, type Sch } from '../agreements/clients/data';

type Inv = { id: string; status: string; total_cents: number; balance_cents?: number | null; amount_paid_cents?: number | null; paid_at: string | null; due_date?: string | null };
type Agr = { id: string; status: string; signed_at: string | null; created_at: string | null; start_date: string | null; end_date: string | null; total_monthly_rate_cents: number | null; ad_rate_cents: number | null };
type Board = { id: string; stage: 'draft' | 'sent' | 'opened' | 'signed'; rate_cents: number | null; last_activity_at: string | null; signed_at: string | null };
type Payout = { id: string; batch_date: string; amount_cents: number; status: string };
type Biz = { name: string; logo: string; address: string; city: string };

const noInv: Inv[] = []; const noAgr: Agr[] = []; const noBoard: Board[] = []; const noPay: Payout[] = []; const noSch: Sch[] = [];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DEAD = ['expired', 'cancelled', 'canceled', 'void', 'declined', 'draft', 'terminated'];
const usd0 = (c: number) => `$${Math.round(c / 100).toLocaleString('en-US')}`;

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-[10px] bg-white px-3 py-4 text-center">
      <div className={`text-sm ${tone ?? 'text-[color:var(--ds-ink)]'}`}>{label}</div>
      <div className="mt-1 text-xl font-semibold text-[color:var(--ds-ink)]">{value}</div>
      {sub && <div className="text-xs text-[color:var(--ds-body)]">{sub}</div>}
    </div>
  );
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3"><h2 className="text-lg font-medium text-[color:var(--ds-ink)]">{title}</h2>{children}</section>;
}
function Bars({ values, color = '#8C94F5', money: isMoney, legend }: { values: number[]; color?: string; money?: boolean; legend: string }) {
  const max = Math.max(1, ...values);
  const W = 520, H = 150, pad = 28, bw = (W - pad) / 12;
  return (
    <div className="rounded-[10px] bg-white p-4">
      <svg viewBox={`0 0 ${W} ${H + 24}`} role="img" aria-label={legend} className="w-full">
        {[0, 0.5, 1].map((t) => <g key={t}><line x1={pad} x2={W} y1={H - H * t} y2={H - H * t} stroke="#ECECF3" /><text x={pad - 4} y={H - H * t + 3} fontSize="9" textAnchor="end" fill="#6B6A7C">{isMoney ? usd0(max * t) : Math.round(max * t * 10) / 10}</text></g>)}
        {values.map((v, i) => <g key={i}><rect x={pad + i * bw + bw * 0.2} width={bw * 0.6} y={H - (v / max) * H} height={(v / max) * H} rx="3" fill={color} /><text x={pad + i * bw + bw / 2} y={H + 14} fontSize="9" textAnchor="middle" fill="#6B6A7C">{MONTHS[i]}</text></g>)}
      </svg>
      <div className="mt-1 flex items-center justify-center gap-2 border-t border-[color:var(--ds-line)] pt-2 text-xs text-[color:var(--ds-body)]"><span className="h-2 w-2 rounded-full" style={{ background: color }} />{legend}</div>
    </div>
  );
}

export default function DashboardBeta() {
  const year = new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);
  const inv = useJson('/api/admin/invoices', (j) => (j.invoices ?? []) as Inv[], noInv);
  const agr = useJson('/api/admin/agreements', (j) => (j.agreements ?? []) as Agr[], noAgr);
  const board = useJson('/api/admin/agreements-v2/board', (j) => (j.items ?? []) as Board[], noBoard);
  const pay = useJson('/api/admin/agreements-v2/payouts?range=90-days', (j) => (j.payouts ?? []) as Payout[], noPay);
  const sch = useJson('/api/admin/recurring-invoices', (j) => (j.schedules ?? []) as Sch[], noSch);
  const biz = useJson('/api/admin/business-details', (j) => j.details as Biz, { name: '', logo: '', address: '', city: '' } as Biz);
  const stat = useJson('/api/admin/integrations-status', (j) => j as unknown as { stripe: boolean }, { stripe: false });
  const [open, setOpen] = useState<number | null>(null);

  const d = useMemo(() => {
    const live = inv.data.filter((i) => i.status !== 'void' && i.status !== 'draft');
    const unpaid = live.filter((i) => i.status !== 'paid' && (i.balance_cents ?? i.total_cents - (i.amount_paid_cents ?? 0)) > 0);
    const bal = (i: Inv) => i.balance_cents ?? i.total_cents - (i.amount_paid_cents ?? 0);
    const overdue = unpaid.filter((i) => i.due_date && i.due_date.slice(0, 10) < today);
    const current = unpaid.filter((i) => !overdue.includes(i));
    const age = (i: Inv) => Math.floor((Date.parse(today) - Date.parse(String(i.due_date).slice(0, 10))) / 86400000);
    const buckets = [['Overdue 1 to 30 days', (n: number) => n <= 30], ['Overdue 31 to 60 days', (n: number) => n > 30 && n <= 60], ['Overdue over 60 days', (n: number) => n > 60]] as const;

    const activeA = agr.data.filter((a) => a.signed_at && !DEAD.includes(a.status.toLowerCase()) && (!a.end_date || a.end_date.slice(0, 10) >= today));
    const mrr = (a: Agr) => a.total_monthly_rate_cents ?? a.ad_rate_cents ?? 0;
    const awaiting = board.data.filter((b) => b.stage === 'sent' || b.stage === 'opened');
    const activeByMonth = MONTHS.map((_, m) => { const end = new Date(year, m + 1, 0).toISOString().slice(0, 10); return agr.data.filter((a) => a.signed_at && a.signed_at.slice(0, 10) <= end && !DEAD.includes(a.status.toLowerCase()) && (!a.end_date || a.end_date.slice(0, 10) >= end)).length; });

    const monthKey = today.slice(0, 7);
    const paidOut = pay.data.filter((p) => p.status === 'paid' && p.batch_date.startsWith(monthKey)).reduce((n, p) => n + p.amount_cents, 0);
    const inTransit = pay.data.filter((p) => p.status !== 'paid' && p.status !== 'canceled' && p.status !== 'failed').reduce((n, p) => n + p.amount_cents, 0);

    const earnedBy = new Array(12).fill(0) as number[];
    for (const i of inv.data) if (i.status === 'paid' && i.paid_at && i.paid_at.startsWith(String(year))) earnedBy[Number(i.paid_at.slice(5, 7)) - 1] += i.amount_paid_cents ?? i.total_cents;
    const expectedBy = [...earnedBy];
    for (const i of current.concat(overdue)) { const dt = (i.due_date ?? today).slice(0, 10); const y = Number(dt.slice(0, 4)), m = Number(dt.slice(5, 7)) - 1; if (y === year) expectedBy[m] += bal(i); else if (y < year) expectedBy[Number(today.slice(5, 7)) - 1] += bal(i); }
    const yearEnd = new Date(year, 11, 31, 23, 59);
    for (const s of sch.data) {
      if (s.status === 'ended') continue;
      const total = s.max_occurrences ?? null; const done = s.occurrences_generated ?? 0; let when = new Date(s.next_run_at);
      for (let n = 0; n < 200 && (total == null || done + n < total); n++) {
        if (when > yearEnd || (s.end_date && when.toISOString().slice(0, 10) > String(s.end_date).slice(0, 10))) break;
        if (when.getFullYear() === year) expectedBy[when.getMonth()] += s.amount_cents + (s.tax_cents ?? 0);
        when = computeNextRun(when, s.frequency as RecurringFrequency, s.interval_count ?? 1);
      }
    }
    const sum = (a: number[]) => a.reduce((n, v) => n + v, 0);

    const sentThisYear = board.data.filter((b) => b.stage !== 'draft' && ((b.last_activity_at ?? b.signed_at ?? '').startsWith(String(year))));
    const signedBy = new Array(12).fill(0) as number[];
    for (const b of board.data) if (b.signed_at && b.signed_at.startsWith(String(year))) signedBy[Number(b.signed_at.slice(5, 7)) - 1] += 1;
    const days = agr.data.filter((a) => a.signed_at && a.created_at).map((a) => (Date.parse(a.signed_at!) - Date.parse(a.created_at!)) / 86400000).sort((x, y) => x - y);
    const median = days.length ? Math.max(0, Math.round(days.length % 2 ? days[(days.length - 1) / 2] : (days[days.length / 2 - 1] + days[days.length / 2]) / 2)) : 0;

    return { unpaid, current, overdue, bal, age, buckets, activeA, mrr, awaiting, activeByMonth, paidOut, inTransit, earned: sum(earnedBy), expected: sum(expectedBy), expectedBy, sentThisYear, signedBy, median };
  }, [inv.data, agr.data, board.data, pay.data, sch.data, today, year]);

  const steps: Array<{ title: string; done: boolean; body: string; href: string; cta: string }> = [
    { title: 'Create your account', done: true, body: 'You are signed in to the admin workspace.', href: '/admin', cta: '' },
    { title: 'Set up your brand', done: Boolean(biz.data.logo), body: 'Add your logo and brand colors so agreements and invoices look like yours.', href: '/admin/settings-beta/business-details', cta: 'Open Business details' },
    { title: 'Send an agreement', done: board.data.some((b) => b.stage !== 'draft'), body: 'Create an agreement from a template and send it for signature.', href: '/admin/agreements/renewals-v2/new', cta: 'Create agreement' },
    { title: 'Connect your bank account', done: stat.data.stripe, body: 'Payouts go to the bank account connected in Stripe.', href: '/admin/payouts-beta', cta: 'View payouts' },
    { title: 'Verify your business', done: Boolean(biz.data.address && biz.data.city), body: 'Complete the business address in Business details.', href: '/admin/settings-beta/business-details', cta: 'Open Business details' },
    { title: 'Activate your account', done: inv.data.some((i) => i.status === 'paid'), body: 'Your account is active once the first invoice is paid.', href: '/admin/billing-hub', cta: 'Open Billing Hub' },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className={A.title}>Welcome back</h1>
        <Link href="/admin/agreements/renewals-v2/new" className={A.primary}>Create agreement</Link>
      </div>

      {!allDone && (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <div className="space-y-3">
            <h2 className="text-lg font-medium text-[color:var(--ds-ink)]">Let&rsquo;s get you up and running</h2>
            <div className="h-2 rounded-full bg-[#DAD3F7]"><div className="h-2 rounded-full bg-[color:var(--ds-primary)]" style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
            {steps.map((s, i) => (
              <div key={s.title} className="rounded-[10px] bg-white">
                <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm text-[color:var(--ds-ink)]" style={{ border: 0, background: 'transparent' }}>
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 border-[color:var(--ds-primary)] text-[10px] ${s.done ? 'bg-[color:var(--ds-primary)] text-white' : ''}`}>{s.done ? '✓' : ''}</span>
                  <span className="flex-1">{s.title}</span>
                  <span aria-hidden="true" className={`text-[10px] leading-none ${open === i ? 'rotate-180' : ''}`}>&#9660;</span>
                </button>
                {open === i && <div className="space-y-3 px-12 pb-4 text-sm text-[color:var(--ds-body)]"><p>{s.body}</p>{s.cta && <Link href={s.href} className={A.small}>{s.cta}</Link>}</div>}
              </div>
            ))}
          </div>
          <div className="h-fit space-y-1 rounded-[10px] bg-white p-4 text-sm">
            <p className="mb-2 font-medium text-[color:var(--ds-ink)]">Shortcuts</p>
            {([['Clients (Beta)', '/admin/agreements/clients'], ['Billing Hub (Beta)', '/admin/billing-hub'], ['Services (Beta)', '/admin/services-beta'], ['Reports (Beta)', '/admin/reports-beta'], ['Integrations (Beta)', '/admin/integrations-beta']] as const).map(([l, h]) => <Link key={h} href={h} className="block rounded-full px-2 py-1.5 text-[color:var(--ds-primary)] hover:bg-[color:var(--ds-selected)]">{l}</Link>)}
          </div>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <Panel title="Invoices">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Awaiting payment" tone="text-teal-700" value={usd0(d.current.reduce((n, i) => n + d.bal(i), 0))} sub={`${d.current.length} invoice${d.current.length === 1 ? '' : 's'}`} />
            <Stat label="Require attention" value={usd0(d.overdue.reduce((n, i) => n + d.bal(i), 0))} sub={`${d.overdue.length} invoice${d.overdue.length === 1 ? '' : 's'}`} />
          </div>
          <div className="min-h-[200px] rounded-[10px] bg-white p-4">
            <div className="mb-3 h-3 rounded-full bg-[#BFE6F2]" />
            <table className="w-full text-sm"><thead><tr className="text-left text-xs text-[color:var(--ds-body)]"><th className="py-2 font-normal">Type</th><th className="py-2 text-right font-normal">Invoices</th><th className="py-2 text-right font-normal">Amount</th></tr></thead>
              <tbody>{d.buckets.map(([label, test]) => { const rows = d.overdue.filter((i) => test(d.age(i))); return <tr key={label} className="border-t border-[color:var(--ds-line)]"><td className="py-2.5">{label}</td><td className="py-2.5 text-right">{rows.length}</td><td className="py-2.5 text-right">{money(rows.reduce((n, i) => n + d.bal(i), 0))}</td></tr>; })}</tbody></table>
            <Link href="/admin/agreements/renewals-v2" className="mt-3 inline-block text-xs text-[color:var(--ds-primary)]">View invoices</Link>
          </div>
        </Panel>

        <Panel title="Agreements">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Active agreements" tone="text-teal-700" value={String(d.activeA.length)} sub={`${money(d.activeA.reduce((n, a) => n + d.mrr(a), 0))} monthly recurring`} />
            <Stat label="Awaiting approval" value={String(d.awaiting.length)} sub={`${money(d.awaiting.reduce((n, b) => n + (b.rate_cents ?? 0), 0))} monthly recurring`} />
          </div>
          <Bars values={d.activeByMonth} legend="Active agreements" />
        </Panel>

        <Panel title="Payouts">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Paid this month" value={usd0(d.paidOut)} />
            <Stat label="Processing" value={usd0(d.inTransit)} />
          </div>
          <div className="min-h-[200px] rounded-[10px] bg-white p-4">
            <table className="w-full text-sm"><thead><tr className="text-left text-xs text-[color:var(--ds-body)]"><th className="py-2 font-normal">Date</th><th className="py-2 text-right font-normal">Amount</th><th className="py-2 text-right font-normal">Status</th></tr></thead>
              <tbody>{pay.data.slice(0, 5).map((p) => <tr key={p.id} className="border-t border-[color:var(--ds-line)]"><td className="py-2.5">{day(p.batch_date)}</td><td className="py-2.5 text-right">{money(p.amount_cents)}</td><td className="py-2.5 text-right"><span className="rounded-full border border-[color:var(--ds-line)] px-2 py-0.5 text-xs capitalize">{p.status.replaceAll('_', ' ')}</span></td></tr>)}</tbody></table>
            {pay.data.length === 0 && <p className="py-6 text-center text-sm text-[color:var(--ds-body)]">{pay.loading ? 'Loading payouts…' : 'Here you will view your payouts'}</p>}
            <Link href="/admin/payouts-beta" className="mt-3 inline-block text-xs text-[color:var(--ds-primary)]">View more</Link>
            <p className="mt-1 text-[11px] text-[color:var(--ds-body)]">* Future payouts may vary in amount and date</p>
          </div>
        </Panel>

        <Panel title="Revenue">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Earned this year" tone="text-teal-700" value={usd0(d.earned)} />
            <Stat label="Expected this year" value={usd0(d.expected)} />
          </div>
          <Bars values={d.expectedBy} color="#D5D4E0" money legend="Expected" />
        </Panel>

        <Panel title="Sent agreements">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Agreements sent this year" value={String(d.sentThisYear.length)} />
            <Stat label="Median time to sign" value={`${d.median} Days`} />
          </div>
          <Bars values={d.signedBy} legend="Signed" />
        </Panel>
      </div>
      {(inv.error || agr.error) && <p className={A.error}>Some dashboard numbers could not load: {inv.error || agr.error}</p>}
    </div>
  );
}
