'use client';

// Agreements (Beta): Billing. Shows what will be invoiced next for one client
// and agreement, and which services bill automatically. Read-only: it reads
// the recurring invoice schedules from Get Paid, so nothing is duplicated.
// Desktop uses a table with a Billing Control column; phones use stacked cards.

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { A, EmptyState } from '@/components/anchor/ui';

type Line = { description: string; qty: number; unit_cents: number };
type Sch = {
  id: string; name: string; advertiser_id: number; advertiser_name: string | null; agreement_id: string | null; status: 'active' | 'paused' | 'ended';
  frequency: string; interval_count: number; amount_cents: number; tax_cents: number | null; line_items: Line[] | null;
  next_run_at: string; due_days: number | null; note_to_client: string | null; memo: string | null; max_occurrences: number | null; occurrences_generated: number | null;
};
type Agr = { id: string; advertiser_id: number | null; type: string | null; ad_size: string | null; frequency: string | null; start_date: string | null };

const money = (c: number) => `${c < 0 ? '-' : ''}$${(Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const iso = (v: string) => v.slice(0, 10);
const day = (v: string | Date) => new Date(typeof v === 'string' ? `${iso(v)}T12:00:00` : v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const addDays = (v: string, n: number) => { const d = new Date(`${iso(v)}T12:00:00`); d.setDate(d.getDate() + n); return d; };
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
function repeats(s: Sch) { const n = s.interval_count || 1; return n > 1 ? `Every ${n} ${s.frequency.replace(/ly$/, '').replace('dai', 'day')}s` : cap(s.frequency); }
function rows(s: Sch) {
  const items = (s.line_items ?? []).filter((l) => l.description);
  return items.length ? items.map((l) => ({ name: l.description, qty: l.qty, rate: l.unit_cents, total: Math.round(l.qty * l.unit_cents) })) : [{ name: s.name, qty: 1, rate: s.amount_cents, total: s.amount_cents }];
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' }) {
  return (
    <div className={`${A.card} p-4 text-center`}>
      <div className={`text-sm ${tone === 'good' ? 'text-green-700' : 'text-[color:var(--ds-ink)]'}`}>{label}</div>
      <div className="mt-1 text-xl font-semibold text-[color:var(--ds-ink)]">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-[color:var(--ds-body)]">{sub}</div>}
    </div>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span role="switch" aria-checked={on} aria-readonly="true" aria-label={on ? 'Bills automatically' : 'Waiting for approval'} className={`relative inline-block h-6 w-11 shrink-0 rounded-full ${on ? 'bg-[color:var(--ds-primary)]' : 'bg-[color:var(--ds-line)]'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </span>
  );
}

export default function BillingPanel() {
  const [sch, setSch] = useState<Sch[] | null>(null);
  const [agr, setAgr] = useState<Agr[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pickedClient, setClient] = useState<string>('');
  const [agreement, setAgreement] = useState<string>('all');
  const [controlOpen, setControlOpen] = useState(false);

  useEffect(() => {
    fetch('/api/admin/recurring-invoices', { credentials: 'include' })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'failed'); setSch((j.schedules as Sch[]).filter((s) => s.status !== 'ended')); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load billing.'));
    fetch('/api/admin/agreements', { credentials: 'include' }).then((r) => r.json()).then((j) => setAgr((j.agreements ?? []) as Agr[])).catch(() => setAgr([]));
  }, []);

  const clients = useMemo(() => {
    const m = new Map<number, { id: number; name: string; next: string }>();
    for (const s of sch ?? []) {
      const c = m.get(s.advertiser_id);
      if (!c) m.set(s.advertiser_id, { id: s.advertiser_id, name: s.advertiser_name ?? `Client ${s.advertiser_id}`, next: s.next_run_at });
      else if (s.next_run_at < c.next) c.next = s.next_run_at;
    }
    return [...m.values()].sort((a, b) => a.next.localeCompare(b.next));
  }, [sch]);

  const client = pickedClient || (clients.length ? String(clients[0].id) : '');

  const clientSch = useMemo(() => (sch ?? []).filter((s) => String(s.advertiser_id) === client), [sch, client]);
  const agreementOptions = useMemo(() => {
    const ids = [...new Set(clientSch.map((s) => s.agreement_id).filter(Boolean) as string[])];
    return ids.map((id, i) => {
      const a = agr.find((x) => x.id === id);
      return { id, label: a ? [cap(a.type ?? 'Agreement').replaceAll('_', ' '), a.ad_size, a.frequency].filter(Boolean).join(' · ') : `Agreement ${i + 1}` };
    });
  }, [clientSch, agr]);
  const scoped = useMemo(() => clientSch.filter((s) => agreement === 'all' || s.agreement_id === agreement || (agreement === 'none' && !s.agreement_id)), [clientSch, agreement]);

  const next = useMemo(() => {
    const live = scoped.filter((s) => s.status !== 'ended');
    if (!live.length) return null;
    const date = live.map((s) => iso(s.next_run_at)).sort()[0];
    const due = live.filter((s) => iso(s.next_run_at) === date);
    const lines = due.flatMap((s) => rows(s).map((r) => ({ ...r, status: s.status, source: s.id })));
    const sub = lines.reduce((n, l) => n + l.total, 0);
    const tax = due.reduce((n, s) => n + (s.tax_cents ?? 0), 0);
    const dueDays = Math.max(...due.map((s) => s.due_days ?? 20));
    const notes = [...new Set(due.map((s) => s.note_to_client || s.memo).filter(Boolean) as string[])];
    return { date, due: addDays(date, dueDays), lines, sub, tax, notes };
  }, [scoped]);

  const control = useMemo(() => {
    const auto = scoped.filter((s) => s.status === 'active');
    const waiting = scoped.filter((s) => s.status === 'paused');
    const group = (list: Sch[]) => [...new Set(list.map(repeats))].map((k) => ({ title: k, items: list.filter((s) => repeats(s) === k) }));
    return { auto: group(auto), waiting: group(waiting), autoMonthly: auto.filter((s) => s.frequency === 'monthly').reduce((n, s) => n + s.amount_cents + (s.tax_cents ?? 0), 0), autoCount: auto.length, waitingCount: waiting.length };
  }, [scoped]);

  if (error) return <div className={A.error}>{error}</div>;
  if (!sch) return <p className="text-sm text-[color:var(--ds-body)]">Loading billing…</p>;
  if (clients.length === 0) return <EmptyState title="Nothing is scheduled to bill" body="Recurring invoices appear here once an agreement is signed or a schedule is created in Get Paid." />;

  const ControlBody = (
    <div className="space-y-5">
      {([['Automatic services', control.auto, true], ['Waiting for approval', control.waiting, false]] as const).map(([title, groups, on]) => (
        <section key={title}>
          <h3 className="text-sm font-semibold text-[color:var(--ds-ink)]">{title}</h3>
          {groups.length === 0 ? <p className="mt-2 text-sm text-[color:var(--ds-body)]">None.</p> : groups.map((g) => (
            <div key={g.title} className="mt-2">
              <div className="rounded-[10px] bg-[color:var(--ds-page)] px-3 py-1.5 text-xs font-medium text-[color:var(--ds-body)]">{g.title}</div>
              <ul className="divide-y divide-[color:var(--ds-line)]">
                {g.items.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-[color:var(--ds-ink)]" title={s.name}>{s.name}</div>
                      <div className="text-xs text-[color:var(--ds-body)]">{money(s.amount_cents + (s.tax_cents ?? 0))}{s.max_occurrences ? ` · ${s.occurrences_generated ?? 0} of ${s.max_occurrences} sent` : ''}</div>
                    </div>
                    <Switch on={on} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
      <Link href="/admin/getpaid/reoccuringpayments" className={`${A.outline} w-full`}>Manage In Get Paid</Link>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:max-w-xl">
        <label className="block text-xs text-[color:var(--ds-body)]">Client
          <select className={`${A.input} mt-1 appearance-none`} value={client} onChange={(e) => { setClient(e.target.value); setAgreement('all'); }}>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="block text-xs text-[color:var(--ds-body)]">Agreement
          <select className={`${A.input} mt-1 appearance-none`} value={agreement} onChange={(e) => setAgreement(e.target.value)}>
            <option value="all">All services</option>
            {agreementOptions.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            {clientSch.some((s) => !s.agreement_id) && <option value="none">Standalone schedules</option>}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Next Invoice" value={next ? money(next.sub + next.tax) : '$0.00'} sub={next ? `Issues ${day(next.date)}` : 'Nothing scheduled'} />
        <Stat label="Automatic Services" tone="good" value={String(control.autoCount)} sub={`${money(control.autoMonthly)} monthly recurring`} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
        <section className={`${A.card} p-4 sm:p-5`} aria-label="Next scheduled invoice">
          <h2 className="text-lg font-semibold text-[color:var(--ds-ink)]">Next Scheduled Invoice</h2>
          {!next ? <p className="mt-3 text-sm text-[color:var(--ds-body)]">Nothing is scheduled for this selection.</p> : (
            <>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-[color:var(--ds-page)] px-3 py-2 text-sm">
                <span><span className="font-medium text-[color:var(--ds-ink)]">Issue Date</span> {day(next.date)}</span>
                <span><span className="font-medium text-[color:var(--ds-ink)]">Due On</span> {day(next.due)}</span>
              </div>

              {/* Desktop and tablet: table */}
              <div className="mt-3 hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead><tr className="text-xs text-[color:var(--ds-body)]"><th className="py-2 pr-3 font-medium">Service Name</th><th className="px-3 py-2 text-right font-medium">Quantity</th><th className="px-3 py-2 text-right font-medium">Rate</th><th className="px-3 py-2 text-right font-medium">Discount</th><th className="px-3 py-2 text-right font-medium">Total</th><th className="py-2 pl-3 font-medium">Status</th></tr></thead>
                  <tbody>
                    {next.lines.map((l, i) => (
                      <tr key={i} className="border-t border-[color:var(--ds-line)]">
                        <td className="max-w-[260px] truncate py-3 pr-3 text-[color:var(--ds-ink)]" title={l.name}>{l.name}</td>
                        <td className="px-3 py-3 text-right">{l.qty}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right">{money(l.rate)}</td>
                        <td className="px-3 py-3 text-right text-[color:var(--ds-body)]">—</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-medium text-[color:var(--ds-ink)]">{money(l.total)}</td>
                        <td className="whitespace-nowrap py-3 pl-3 text-[color:var(--ds-body)]">{l.status === 'paused' ? 'Pending approval' : 'Scheduled'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    {next.tax > 0 && <tr className="border-t border-[color:var(--ds-line)]"><td colSpan={4} className="py-2 pr-3 text-right text-[color:var(--ds-body)]">Tax</td><td className="px-3 py-2 text-right">{money(next.tax)}</td><td /></tr>}
                    <tr className="border-t border-[color:var(--ds-line)]"><td colSpan={4} className="py-3 pr-3 text-right text-[color:var(--ds-body)]">{next.tax > 0 ? 'Total' : 'Subtotal'}</td><td className="whitespace-nowrap px-3 py-3 text-right text-base font-semibold text-[color:var(--ds-ink)]">{money(next.sub + next.tax)}</td><td /></tr>
                  </tfoot>
                </table>
              </div>

              {/* Phones: one card per service */}
              <ul className="mt-3 space-y-2 md:hidden">
                {next.lines.map((l, i) => (
                  <li key={i} className="rounded-[10px] border border-[color:var(--ds-line)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 text-sm font-medium text-[color:var(--ds-ink)]">{l.name}</div>
                      <div className="shrink-0 text-sm font-semibold text-[color:var(--ds-ink)]">{money(l.total)}</div>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-[color:var(--ds-body)]">
                      <span>{l.qty} × {money(l.rate)}</span>
                      <span className="rounded-full border border-[color:var(--ds-line)] px-2 py-0.5">{l.status === 'paused' ? 'Pending approval' : 'Scheduled'}</span>
                    </div>
                  </li>
                ))}
                {next.tax > 0 && <li className="flex justify-between px-1 text-sm text-[color:var(--ds-body)]"><span>Tax</span><span>{money(next.tax)}</span></li>}
                <li className="flex justify-between rounded-[10px] bg-[color:var(--ds-page)] px-3 py-2.5 text-sm font-semibold text-[color:var(--ds-ink)]"><span>{next.tax > 0 ? 'Total' : 'Subtotal'}</span><span>{money(next.sub + next.tax)}</span></li>
              </ul>

              {next.notes.length > 0 && (
                <div className="mt-4 text-sm"><div className="font-medium text-[color:var(--ds-ink)]">Notes</div>{next.notes.map((n, i) => <p key={i} className="mt-1 whitespace-pre-line text-xs text-[color:var(--ds-body)]">{n}</p>)}</div>
              )}
            </>
          )}
        </section>

        {/* Billing Control: side column on desktop, collapsible card on phones */}
        <aside className={`${A.card} hidden p-5 lg:block`} aria-label="Billing control">
          <h2 className="mb-4 text-lg font-semibold text-[color:var(--ds-ink)]">Billing Control</h2>
          {ControlBody}
        </aside>
        <section className={`${A.card} p-4 lg:hidden`} aria-label="Billing control">
          <button type="button" className="flex w-full items-center justify-between text-left text-lg font-semibold text-[color:var(--ds-ink)]" style={{ border: 0, background: 'transparent' }} aria-expanded={controlOpen} onClick={() => setControlOpen((o) => !o)}>
            Billing Control<span className="text-sm font-normal text-[color:var(--ds-body)]">{control.autoCount} automatic{control.waitingCount ? `, ${control.waitingCount} waiting` : ''} {controlOpen ? '▴' : '▾'}</span>
          </button>
          {controlOpen && <div className="mt-4">{ControlBody}</div>}
        </section>
      </div>
    </div>
  );
}
