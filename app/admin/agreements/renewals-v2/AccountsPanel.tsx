'use client';

// Agreements (Beta): every partner account with its details, read-only.
// Reads the same advertiser records as the CRM and the same invoices as Get
// Paid, so nothing is duplicated. Tokens and Stripe ids are never shown.

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { A, EmptyState, SearchBox } from '@/components/anchor/ui';

type Adv = {
  id: number; name: string; publication: string | null; type: string | null; status: string | null;
  first_name: string | null; last_name: string | null; company: string | null; title: string | null; industry: string | null; license_number: string | null;
  contact_email: string | null; portal_email: string | null; phone: string | null; office_phone: string | null; website: string | null;
  address: string | null; address_2: string | null; city: string | null; state: string | null; zip: string | null;
  billing_contact_name: string | null; billing_contact_phone: string | null; billing_email: string | null;
  payment_mode: string | null; card_last4: string | null; portal_activated_at: string | null;
  current_ad_size: string | null; current_frequency: string | null; current_ad_rate_cents: number | null; current_amount_cents: number | null; current_exp_date: string | null;
  notes: string | null; tags: string[] | null; additional_contacts: Array<{ name?: string; email?: string; phone?: string; title?: string }> | null;
  last_contacted_at: string | null; outreach_count: number | null; created_at: string; updated_at: string | null;
  slug: string | null; email_status: string | null; email_verified_at: string | null; portal_onboarded_at: string | null;
  facebook_url: string | null; instagram_url: string | null; linkedin_url: string | null; twitter_url: string | null; youtube_url: string | null;
  tagline: string | null; bio: string | null; rep_address: string | null; rep_city: string | null; rep_state: string | null; rep_zip: string | null;
  last_opened_at: string | null; open_count: number | null; last_bounced_at: string | null; bounce_count: number | null; last_bounce_type: string | null;
  clicks_30d: number | null; hotspot_count: number | null; is_locked: boolean | null; current_agreement_id: string | null;
};
type Agr = { id: string; advertiser_id: number | null; status: string; type: string | null; ad_size: string | null; frequency: string | null; start_date: string | null; end_date: string | null; exp_date?: string | null; amount_cents: number | null; signed_at: string | null; is_renewal?: boolean | null; created_at: string; card_type?: string | null; card_number_last4?: string | null; card_expiration?: string | null; cardholder_name?: string | null };
type Inv = { id: string; number: string | null; advertiser_id?: number | null; agreement_id: string | null; status: string; total_cents: number; amount_paid_cents: number; balance_cents: number; issued_at: string | null; due_date: string | null; paid_at: string | null; is_overdue: boolean; created_at: string };

const PUB: Record<string, string> = { austin: 'Austin', san_antonio: 'San Antonio', both: 'Both' };
const money = (c: number | null | undefined) => (c == null ? '—' : `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const day = (v: string | null) => (v ? new Date(v.length === 10 ? `${v}T00:00:00` : v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const cap = (s: string | null) => (s ? s[0].toUpperCase() + s.slice(1).replaceAll('_', ' ') : '—');
const addr = (a: Adv) => [a.address, a.address_2, [a.city, a.state].filter(Boolean).join(', '), a.zip].filter(Boolean).join(' ') || '—';
const contact = (a: Adv) => [a.first_name, a.last_name].filter(Boolean).join(' ') || '—';

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="grid grid-cols-[150px_1fr] gap-3 py-1.5 text-sm"><div className="text-[color:var(--ds-body)]">{k}</div><div className="break-words text-[color:var(--ds-ink)]">{v || '—'}</div></div>;
}

export default function AccountsPanel() {
  const [rows, setRows] = useState<Adv[] | null>(null);
  const [inv, setInv] = useState<Inv[]>([]);
  const [agr, setAgr] = useState<Agr[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [pub, setPub] = useState('all');
  const [open, setOpen] = useState<Adv | null>(null);

  useEffect(() => {
    fetch('/api/admin/advertisers', { credentials: 'include' })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'failed'); setRows(j.advertisers as Adv[]); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load accounts.'));
    fetch('/api/admin/agreements', { credentials: 'include' }).then((r) => r.json()).then((j) => setAgr((j.agreements ?? []) as Agr[])).catch(() => setAgr([]));
    fetch('/api/admin/invoices', { credentials: 'include' }).then((r) => r.json()).then((j) => setInv((j.invoices ?? []) as Inv[])).catch(() => setInv([]));
  }, []);

  const balances = useMemo(() => {
    const m = new Map<number, { billed: number; paid: number; balance: number }>();
    for (const i of inv) {
      if (!i.advertiser_id || i.status === 'void' || i.status === 'draft') continue;
      const b = m.get(i.advertiser_id) ?? { billed: 0, paid: 0, balance: 0 };
      b.billed += i.total_cents; b.paid += i.amount_paid_cents; b.balance += i.balance_cents;
      m.set(i.advertiser_id, b);
    }
    return m;
  }, [inv]);

  const statuses = useMemo(() => [...new Set((rows ?? []).map((r) => r.status).filter(Boolean) as string[])].sort(), [rows]);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => (status === 'all' || r.status === status) && (pub === 'all' || r.publication === pub)
      && (!term || `${r.name} ${contact(r)} ${r.contact_email ?? ''} ${r.billing_email ?? ''} ${r.phone ?? ''} ${r.city ?? ''}`.toLowerCase().includes(term)));
  }, [rows, q, status, pub]);

  if (error) return <div className={A.error}>{error}</div>;
  if (!rows) return <p className="text-sm text-[color:var(--ds-body)]">Loading accounts…</p>;
  const owing = [...balances.values()].reduce((n, b) => n + b.balance, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {([['Accounts', String(rows.length)], ['With a current agreement', String(rows.filter((r) => (r.current_ad_size || r.current_amount_cents)).length)], ['Total owed', money(owing)]] as const).map(([l, v]) => (
          <div key={l} className={`${A.card} p-4`}><div className="text-xs text-[color:var(--ds-body)]">{l}</div><div className="mt-1 text-xl font-semibold text-[color:var(--ds-ink)]">{v}</div></div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={setQ} />
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="anchor-input rounded-[10px] border border-[color:var(--ds-line)] bg-white px-4 py-2 text-sm text-[color:var(--ds-ink)]">
          <option value="all">All statuses</option>{statuses.map((s) => <option key={s} value={s}>{cap(s)}</option>)}
        </select>
        <select aria-label="Publication" value={pub} onChange={(e) => setPub(e.target.value)} className="anchor-input rounded-[10px] border border-[color:var(--ds-line)] bg-white px-4 py-2 text-sm text-[color:var(--ds-ink)]">
          <option value="all">All publications</option>{Object.entries(PUB).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="text-xs text-[color:var(--ds-body)]">{shown.length} of {rows.length} accounts</span>
        <Link href="/admin/crm" className={`${A.outline} ml-auto`}>Manage in Partners (CRM)</Link>
      </div>
      {shown.length === 0 ? <EmptyState title="No accounts found" body="Try a different search or filter." /> : (
        <div className="overflow-x-auto">
          <table className={A.table}>
            <thead><tr><th>Partner</th><th>Contact</th><th>Email</th><th>Phone</th><th>Publication</th><th>Status</th><th>Plan</th><th className="text-right">Balance</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="cursor-pointer" onClick={() => setOpen(r)}>
                  <td className="max-w-[240px] truncate font-medium" title={r.name}><button type="button" className="text-left text-[color:var(--ds-primary)]" style={{ border: 0, background: 'transparent', padding: 0 }} onClick={() => setOpen(r)}>{r.name}</button></td>
                  <td className="max-w-[160px] truncate">{contact(r)}</td>
                  <td className="max-w-[220px] truncate" title={r.contact_email ?? ''}>{r.contact_email ?? '—'}</td>
                  <td className="whitespace-nowrap">{r.phone ?? '—'}</td>
                  <td className="whitespace-nowrap">{PUB[r.publication ?? ''] ?? '—'}</td>
                  <td><span className="rounded-full border border-[color:var(--ds-line)] px-2.5 py-0.5 text-xs">{cap(r.status)}</span></td>
                  <td className="whitespace-nowrap">{[r.current_ad_size, r.current_frequency].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="whitespace-nowrap text-right">{money(balances.get(r.id)?.balance ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setOpen(null)}>
          <aside className="h-full w-full max-w-[520px] overflow-y-auto bg-white p-6 shadow-xl" role="dialog" aria-label={`${open.name} account`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="text-lg font-semibold text-[color:var(--ds-ink)]">{open.name}</h2><p className="text-xs text-[color:var(--ds-body)]">{cap(open.status)} · {PUB[open.publication ?? ''] ?? 'No publication'} · Added {day(open.created_at)}</p></div>
              <button type="button" aria-label="Close" className="text-2xl leading-none text-[color:var(--ds-ink)]" style={{ border: 0, background: 'transparent' }} onClick={() => setOpen(null)}>×</button>
            </div>
            <h3 className="mt-5 text-xs font-semibold text-[color:var(--ds-body)]">Contact</h3>
            <Row k="Name" v={contact(open)} /><Row k="Title" v={open.title} /><Row k="Company" v={open.company} /><Row k="Email" v={open.contact_email} />
            <Row k="Portal email" v={open.portal_email} /><Row k="Phone" v={open.phone} /><Row k="Office phone" v={open.office_phone} /><Row k="Website" v={open.website} />
            <Row k="Address" v={addr(open)} /><Row k="Industry" v={open.industry} /><Row k="License number" v={open.license_number} />
            {(open.additional_contacts ?? []).length > 0 && (<>
              <h3 className="mt-5 text-xs font-semibold text-[color:var(--ds-body)]">Other contacts</h3>
              {(open.additional_contacts ?? []).map((c, i) => <Row key={i} k={c.name || `Contact ${i + 1}`} v={[c.title, c.email, c.phone].filter(Boolean).join(' · ')} />)}
            </>)}
            <h3 className="mt-5 text-xs font-semibold text-[color:var(--ds-body)]">Billing</h3>
            <Row k="Billing contact" v={open.billing_contact_name} /><Row k="Billing email" v={open.billing_email} /><Row k="Billing phone" v={open.billing_contact_phone} />
            <Row k="Pays by" v={cap(open.payment_mode)} /><Row k="Card on file" v={(() => {
              const c = agr.filter((a) => a.advertiser_id === open.id && (a.card_type || a.card_expiration || a.card_number_last4)).sort((x, y) => (y.created_at ?? '').localeCompare(x.created_at ?? ''))[0];
              const last4 = c?.card_number_last4 || open.card_last4;
              if (!last4) return null;
              return `${c?.card_type || 'Card'} ending ${last4}${c?.card_expiration ? `, expires ${c.card_expiration}` : ', expiry not on file'}${c?.cardholder_name ? `, ${c.cardholder_name}` : ''}`;
            })()} />
            <Row k="Invoiced" v={money(balances.get(open.id)?.billed ?? 0)} /><Row k="Paid" v={money(balances.get(open.id)?.paid ?? 0)} /><Row k="Balance" v={money(balances.get(open.id)?.balance ?? 0)} />
            <h3 className="mt-5 text-xs font-semibold text-[color:var(--ds-body)]">Current agreement</h3>
            <Row k="Ad" v={[open.current_ad_size, open.current_frequency].filter(Boolean).join(' · ')} /><Row k="Rate" v={open.current_ad_rate_cents ? `${money(open.current_ad_rate_cents)} per issue` : null} />
            <Row k="Total" v={open.current_amount_cents ? money(open.current_amount_cents) : null} /><Row k="Expires" v={day(open.current_exp_date)} />
            <h3 className="mt-5 text-xs font-semibold text-[color:var(--ds-body)]">Profile</h3>
            <Row k="Tagline" v={open.tagline} /><Row k="Bio" v={open.bio} /><Row k="Page address" v={open.slug ? `/${open.slug}` : null} />
            <Row k="Facebook" v={open.facebook_url} /><Row k="Instagram" v={open.instagram_url} /><Row k="LinkedIn" v={open.linkedin_url} /><Row k="X / Twitter" v={open.twitter_url} /><Row k="YouTube" v={open.youtube_url} />
            <Row k="Rep address" v={[open.rep_address, [open.rep_city, open.rep_state].filter(Boolean).join(', '), open.rep_zip].filter(Boolean).join(' ')} />
            <h3 className="mt-5 text-xs font-semibold text-[color:var(--ds-body)]">Email and engagement</h3>
            <Row k="Email status" v={open.email_status ? `${cap(open.email_status)}${open.email_verified_at ? ` (verified ${day(open.email_verified_at)})` : ''}` : null} />
            <Row k="Opens" v={`${open.open_count ?? 0}${open.last_opened_at ? `, last ${day(open.last_opened_at)}` : ''}`} />
            <Row k="Bounces" v={`${open.bounce_count ?? 0}${open.last_bounced_at ? `, last ${day(open.last_bounced_at)} (${open.last_bounce_type ?? 'unknown'})` : ''}`} />
            <Row k="Clicks (30 days)" v={String(open.clicks_30d ?? 0)} /><Row k="Hotspots" v={String(open.hotspot_count ?? 0)} /><Row k="Record locked" v={open.is_locked ? 'Yes' : 'No'} />
            <Row k="Updated" v={day(open.updated_at)} />
            <h3 className="mt-5 text-xs font-semibold text-[color:var(--ds-body)]">Agreement history ({agr.filter((a) => a.advertiser_id === open.id).length})</h3>
            {agr.filter((a) => a.advertiser_id === open.id).length === 0 ? <p className="py-1.5 text-sm text-[color:var(--ds-body)]">No agreements yet.</p> : (
              <ul className="divide-y divide-[color:var(--ds-line)] text-sm">
                {agr.filter((a) => a.advertiser_id === open.id).sort((x, y) => (y.created_at ?? '').localeCompare(x.created_at ?? '')).map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 py-2">
                    <div>
                      <div className="text-[color:var(--ds-ink)]">{[cap(a.type), a.ad_size, a.frequency].filter(Boolean).join(' · ')}{a.is_renewal ? ' (renewal)' : ''}</div>
                      <div className="text-xs text-[color:var(--ds-body)]">{day(a.start_date)} to {day(a.end_date ?? a.exp_date ?? null)} · {a.signed_at ? `Signed ${day(a.signed_at)}` : 'Not signed'}</div>
                    </div>
                    <div className="text-right"><div className="whitespace-nowrap font-medium">{money(a.amount_cents)}</div><span className="rounded-full border border-[color:var(--ds-line)] px-2 py-0.5 text-[10px]">{cap(a.status)}</span></div>
                  </li>
                ))}
              </ul>
            )}
            <h3 className="mt-5 text-xs font-semibold text-[color:var(--ds-body)]">Invoice history ({inv.filter((i) => i.advertiser_id === open.id).length})</h3>
            {inv.filter((i) => i.advertiser_id === open.id).length === 0 ? <p className="py-1.5 text-sm text-[color:var(--ds-body)]">No invoices yet.</p> : (
              <ul className="divide-y divide-[color:var(--ds-line)] text-sm">
                {inv.filter((i) => i.advertiser_id === open.id).sort((x, y) => (y.created_at ?? '').localeCompare(x.created_at ?? '')).map((i) => (
                  <li key={i.id} className="flex items-start justify-between gap-3 py-2">
                    <div>
                      <div className="text-[color:var(--ds-ink)]">{i.number ?? 'Draft invoice'}</div>
                      <div className="text-xs text-[color:var(--ds-body)]">Issued {day(i.issued_at)} · Due {day(i.due_date)}{i.paid_at ? ` · Paid ${day(i.paid_at)}` : ''}</div>
                    </div>
                    <div className="text-right"><div className="whitespace-nowrap font-medium">{money(i.total_cents)}</div><span className={`rounded-full border px-2 py-0.5 text-[10px] ${i.is_overdue ? 'border-red-300 text-red-700' : 'border-[color:var(--ds-line)]'}`}>{i.is_overdue ? 'Overdue' : cap(i.status)}</span>{i.balance_cents > 0 && <div className="text-xs text-[color:var(--ds-body)]">Owes {money(i.balance_cents)}</div>}</div>
                  </li>
                ))}
              </ul>
            )}
            <h3 className="mt-5 text-xs font-semibold text-[color:var(--ds-body)]">Account</h3>
            <Row k="Portal" v={open.portal_activated_at ? `Active since ${day(open.portal_activated_at)}` : 'Not activated'} /><Row k="Last contacted" v={day(open.last_contacted_at)} /><Row k="Outreach sent" v={String(open.outreach_count ?? 0)} />
            <Row k="Tags" v={(open.tags ?? []).join(', ')} /><Row k="Notes" v={open.notes} />
          </aside>
        </div>
      )}
    </div>
  );
}
