'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { A, RowMenu } from '@/components/anchor/ui';
import { contactsOf } from '../contacts/ContactsList';
import { GROUP_LABEL, groupOf, day, money, useJson, type Adv, type Agr, type Inv, type Sch } from '../data';

const noAdv: Adv[] = [];
const noAgr: Agr[] = [];
const noInv: Inv[] = [];
const noSch: Sch[] = [];
const TABS = [['summary', 'Summary'], ['upcoming', 'Upcoming invoices'], ['issued', 'Issued invoices']] as const;
type Tab = (typeof TABS)[number][0];

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={`${A.card} p-4 sm:p-5`}>
      <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-base font-semibold text-[color:var(--ds-ink)]">{title}</h3>{action}</div>
      {children}
    </section>
  );
}
const link = 'text-sm font-medium text-[color:var(--ds-primary)] hover:underline';
const pill = 'rounded-full border border-[color:var(--ds-line)] px-2 py-0.5 text-xs text-[color:var(--ds-body)]';

function invStatus(i: Inv) {
  if (i.status === 'void') return 'Void';
  if (i.balance_cents <= 0 && i.total_cents > 0) return 'Paid';
  if (i.status === 'draft') return 'Draft';
  return 'Issued';
}

export default function ClientDetail({ id }: { id: number }) {
  const adv = useJson('/api/admin/advertisers', (j) => (j.advertisers ?? []) as Adv[], noAdv);
  const agr = useJson('/api/admin/agreements', (j) => (j.agreements ?? []) as Agr[], noAgr);
  const inv = useJson('/api/admin/invoices', (j) => (j.invoices ?? []) as Inv[], noInv);
  const sch = useJson('/api/admin/recurring-invoices', (j) => (j.schedules ?? []) as Sch[], noSch);
  const [tab, setTab] = useState<Tab>('summary');
  const [agrFilter, setAgrFilter] = useState('all');
  const [q, setQ] = useState('');

  const a = adv.data.find((x) => x.id === id);
  const myAgr = useMemo(() => agr.data.filter((x) => x.advertiser_id === id), [agr.data, id]);
  const myInv = useMemo(() => inv.data.filter((x) => x.advertiser_id === id).sort((p, q2) => (q2.issue_date ?? '').localeCompare(p.issue_date ?? '')), [inv.data, id]);
  const mySch = useMemo(() => sch.data.filter((x) => x.advertiser_id === id && x.status !== 'ended').sort((p, q2) => p.next_run_at.localeCompare(q2.next_run_at)), [sch.data, id]);
  const today = new Date().toISOString().slice(0, 10);
  const overdue = myInv.filter((i) => i.balance_cents > 0 && i.status !== 'void' && i.status !== 'draft' && i.due_date && i.due_date.slice(0, 10) < today);
  const issued = myInv.filter((i) => i.status !== 'draft');
  const latest = issued[0];
  const next = mySch[0];
  const nextLines = next ? mySch.filter((s) => s.next_run_at.slice(0, 10) === next.next_run_at.slice(0, 10)) : [];
  const nextTotal = nextLines.reduce((n, s) => n + s.amount_cents + (s.tax_cents ?? 0), 0);

  if (adv.loading) return <p className="text-sm text-[color:var(--ds-body)]">Loading…</p>;
  if (!a) return <div className={A.error}>That client was not found. <Link href="/admin/agreements/clients" className={link}>Back to clients</Link></div>;

  const payMissing = !a.card_last4 && a.payment_mode !== 'card';
  const info = (i: Inv) => (i.balance_cents <= 0 && i.total_cents > 0 ? 'Paid in full' : payMissing ? 'Missing payment method' : 'Awaiting payment');
  const schedulesShown = mySch.filter((s) => agrFilter === 'all' || s.agreement_id === agrFilter);
  const issuedShown = issued.filter((i) => !q.trim() || (i.number ?? '').toLowerCase().includes(q.trim().toLowerCase()));
  const agrIds = [...new Set(mySch.map((s) => s.agreement_id).filter(Boolean) as string[])];
  const address = [a.address, a.address_2, [a.city, a.state].filter(Boolean).join(', '), a.zip].filter(Boolean).join(' ');

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link href="/admin/agreements/clients" aria-label="Back to clients" className="mt-1 text-xl text-[color:var(--ds-ink)]">&lsaquo;</Link>
          <div>
            <h2 className="flex flex-wrap items-center gap-2 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-[color:var(--ds-ink)]">{a.name}<span className="rounded-full border border-[#047857] bg-[#E6F6EF] px-2.5 py-0.5 text-xs font-medium text-[#065F46]">{GROUP_LABEL[groupOf(a.status)]}</span></h2>
            <p className="text-xs text-[color:var(--ds-body)]">{a.type === 'individual' ? 'Individual' : 'Business'} · Created on {day(a.created_at)}</p>
          </div>
        </div>
        <RowMenu items={[{ label: 'Create proposal', href: '/admin/agreements/renewals-v2/new' }, { label: 'Open in Get Paid', href: '/admin/getpaid' }]} />
      </div>

      <div role="tablist" aria-label="Client" className="flex gap-2 overflow-x-auto border-b border-[color:var(--ds-line)]">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={{ border: 0, borderBottom: '2px solid', borderRadius: 0, boxShadow: 'none', background: 'transparent', color: tab === k ? 'var(--ds-ink)' : 'var(--ds-body)', borderColor: tab === k ? 'var(--ds-primary)' : 'transparent' }} className="-mb-px whitespace-nowrap px-3 pb-3 pt-2 text-[15px]">{label}</button>
        ))}
      </div>

      {tab === 'summary' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            <Card title="Billing overview" action={<span className="flex items-center gap-3"><button type="button" className={link} style={{ border: 0, background: 'transparent' }} onClick={() => setTab('upcoming')}>Manage billing</button><span className="h-4 w-px bg-[color:var(--ds-line)]" /><Link href="/admin/getpaid/invoices" className={link}>Bill client</Link></span>}>
              <p className="text-xs text-[color:var(--ds-body)]">Upcoming invoice</p>
              <div className="mt-1 rounded-[10px] border border-[color:var(--ds-line)] p-3">
                {next ? (<><div className="flex justify-between text-sm"><span>To be issued on {day(next.next_run_at)}</span><span className="font-semibold">{money(nextTotal)}</span></div><button type="button" className={link} style={{ border: 0, background: 'transparent', padding: 0 }} onClick={() => setTab('upcoming')}>View Details</button></>) : <p className="text-sm text-[color:var(--ds-body)]">No invoice is scheduled.</p>}
              </div>
              <p className="mt-4 text-xs text-[color:var(--ds-body)]">Latest invoice</p>
              <div className="mt-1 rounded-[10px] border border-[color:var(--ds-line)] p-3">
                {latest ? (<>
                  <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><span className="font-medium text-[color:var(--ds-primary)]">{latest.number ?? 'Invoice'}</span><span className={pill}>{invStatus(latest)}</span></span><RowMenu items={[{ label: 'Open in Get Paid', href: '/admin/getpaid/invoices' }]} /></div>
                  <p className="mt-1 text-xs text-[color:var(--ds-body)]">Issue date: {day(latest.issue_date)}</p>
                  <div className="mt-2 flex justify-between border-t border-[color:var(--ds-line)] pt-2 text-sm font-semibold"><span>Total</span><span>{money(latest.total_cents)}</span></div>
                </>) : <p className="text-sm text-[color:var(--ds-body)]">No invoices have been issued.</p>}
              </div>
              <p className="mt-4 text-xs text-[color:var(--ds-body)]">Overdue invoices</p>
              {overdue.length === 0 ? <p className="mt-1 text-sm text-[color:var(--ds-body)]">There are no overdue invoices to display.</p> : overdue.map((i) => <div key={i.id} className="mt-1 flex justify-between rounded-[10px] border border-[#C8102E] bg-[#FDECEF] p-3 text-sm text-[#9B0C23]"><span>{i.number} · due {day(i.due_date)}</span><span className="font-semibold">{money(i.balance_cents)}</span></div>)}
            </Card>
            <Card title="Recent agreements" action={<Link href="/admin/agreements/renewals-v2/new" className={link}>Create proposal</Link>}>
              {myAgr.length === 0 ? <p className="text-sm text-[color:var(--ds-body)]">No agreements yet.</p> : (
                <ul className="space-y-2">
                  {myAgr.slice(0, 5).map((g) => (
                    <li key={g.id} className="rounded-[10px] border border-[color:var(--ds-line)] p-3">
                      <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm"><span className="font-medium text-[color:var(--ds-primary)]">Agreement</span><span className={g.signed_at ? 'rounded-full border border-[#047857] px-2 py-0.5 text-xs text-[#065F46]' : pill}>{g.signed_at ? 'Active' : 'Awaiting approval'}</span></span><RowMenu items={[{ label: 'View agreements', href: '/admin/agreements/renewals-v2' }]} /></div>
                      <p className="mt-1 text-xs text-[color:var(--ds-body)]">Effective date · {day(g.start_date ?? g.signed_at ?? g.created_at)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
          <div className="space-y-5">
            <Card title="Client details" action={<Link href="/admin/crm" className={link}>Edit client</Link>}>
              <div className="space-y-1 text-sm text-[color:var(--ds-ink)]">
                {address ? <p>{address}</p> : <Link href="/admin/crm" className={`${link} inline-flex items-center gap-2`}><span aria-hidden="true" className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current leading-none">+</span>Add address</Link>}
              </div>
            </Card>
            <Card title="Contacts" action={<Link href="/admin/crm" className={link}>Add contact</Link>}>
              <ul className="space-y-2">
                {contactsOf(a).map((c, i) => (
                  <li key={i} className="rounded-[10px] border border-[color:var(--ds-line)] p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 font-medium text-[color:var(--ds-ink)]">{c.name}{i === 0 && !a.portal_activated_at && <span className={pill}>No portal access</span>}</div>
                      <RowMenu items={[{ label: 'Edit in Partners', href: '/admin/crm' }]} />
                    </div>
                    {c.email && <div className="mt-1 flex items-center gap-2 text-xs text-[color:var(--ds-body)]"><span aria-hidden="true">&#9993;</span>{c.email}</div>}
                    {c.phone && <div className="mt-1 flex items-center gap-2 text-xs text-[color:var(--ds-body)]"><span aria-hidden="true">&#9990;</span>{c.phone}</div>}
                  </li>
                ))}
                {contactsOf(a).length === 0 && <li className="text-sm text-[color:var(--ds-body)]">No contacts on file.</li>}
              </ul>
            </Card>
            <Card title="Payment methods" action={<Link href="/admin/crm" className={link}>Add a payment method</Link>}>
              {a.card_last4 ? <p className="text-sm">Card ending {a.card_last4}</p> : <p className="text-sm text-[color:var(--ds-body)]">There are no payment methods to display.</p>}
            </Card>
          </div>
        </div>
      )}

      {tab === 'upcoming' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="block w-full text-xs text-[color:var(--ds-body)] sm:w-72">Agreement to bill
              <select className={`${A.input} mt-1 appearance-none`} value={agrFilter} onChange={(e) => setAgrFilter(e.target.value)}>
                <option value="all">All agreements</option>
                {agrIds.map((g, i) => <option key={g} value={g}>Agreement {i + 1}</option>)}
              </select>
            </label>
            <Link href="/admin/agreements/renewals-v2" className={A.outline}>Billing Control</Link>
          </div>
          {schedulesShown.length === 0 ? (
            <p className="py-8 text-center text-sm text-[color:var(--ds-ink)]">There are no scheduled invoices to show.<br />Open Billing Control to review how this client is billed.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className={`${A.table} min-w-[560px]`}>
                <thead><tr><th>Service</th><th>Repeats</th><th>Next Issue Date</th><th>Status</th><th className="text-right">Total</th></tr></thead>
                <tbody>
                  {schedulesShown.map((s) => (
                    <tr key={s.id}>
                      <td className="font-medium text-[color:var(--ds-ink)]">{s.name}</td>
                      <td className="capitalize">{s.frequency}</td>
                      <td className="whitespace-nowrap">{day(s.next_run_at)}</td>
                      <td>{s.status === 'paused' ? 'Pending approval' : 'Scheduled'}</td>
                      <td className="text-right">{money(s.amount_cents + (s.tax_cents ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'issued' && (
        <div className="space-y-4">
          <input className={`${A.input} sm:w-72`} placeholder="Search…" aria-label="Search invoices" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="overflow-x-auto">
            <table className={`${A.table} min-w-[680px]`}>
              <thead><tr><th>Invoice ID</th><th>Invoice Status</th><th>Additional Information</th><th>Issue Date</th><th>Due Date</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {issuedShown.map((i) => (
                  <tr key={i.id}>
                    <td className="font-medium text-[color:var(--ds-ink)]">{i.number ?? '—'}</td>
                    <td><span className={pill}>{invStatus(i)}</span></td>
                    <td>{info(i)}</td>
                    <td className="whitespace-nowrap">{day(i.issue_date)}</td>
                    <td className="whitespace-nowrap">{day(i.due_date)}</td>
                    <td className="text-right">{money(i.total_cents)}</td>
                  </tr>
                ))}
                {issuedShown.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-[color:var(--ds-body)]">No invoices have been issued.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
