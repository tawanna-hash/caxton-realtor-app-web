'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { A, RowMenu, SearchBox } from '@/components/anchor/ui';
import { GROUP_LABEL, GROUP_OPTIONS, mainName, mergeClients, useJson, type Adv, type Client, type Group } from './data';
import StatusSelect, { SortTh } from './StatusFilter';
import { othersOf } from './contacts/ContactsList';

const none: Adv[] = [];
type Key = 'name' | 'status' | 'contact';

export default function ClientsList() {
  const { data, loading, error } = useJson('/api/admin/advertisers', (j) => (j.advertisers ?? []) as Adv[], none);
  const [q, setQ] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [st, setSt] = useState<Group[]>(['active']);
  const [sort, setSort] = useState<{ key: Key; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });
  const person = (a: Adv) => mainName(a);
  const clients = useMemo(() => mergeClients(data), [data]);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    const l = clients.filter((a) => st.includes(a.group) && (!n || `${a.name} ${person(a)} ${a.contact_email ?? ''} ${a.billing_email ?? ''}`.toLowerCase().includes(n)));
    const val = (a: Client) => (sort.key === 'name' ? a.name ?? '' : sort.key === 'status' ? GROUP_LABEL[a.group] : person(a));
    return [...l].sort((a, b) => (sort.dir === 'desc' ? -1 : 1) * val(a).localeCompare(val(b)));
  }, [clients, q, st, sort]);
  const th = (key: Key, label: string) => <SortTh label={label} dir={sort.key === key ? sort.dir : undefined} onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))} />;
  return (
    <div className="space-y-5">
      <div>
        <h1 className={A.title}>Clients</h1>
        <p className="mt-1 hidden text-sm text-[color:var(--ds-body)] md:block">The main contact person for each client. Other people in the organization are under Contacts.</p>
      </div>
      {error && <div className={A.error}>{error}</div>}
      <div className="hidden flex-wrap items-center gap-3 md:flex"><SearchBox value={q} onChange={setQ} label="Search clients" /><StatusSelect title="Client status" value={st} onChange={setSt} /></div>
      <div className="md:hidden">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1"><SearchBox value={q} onChange={setQ} label="Search clients" /></div>
          <button type="button" onClick={() => setFilterOpen((o) => !o)} style={{ border: 0, background: 'transparent' }} className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-[color:var(--ds-primary)]">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 5h16M2 10h16M2 15h16" /><circle cx="7" cy="5" r="2" fill="#F3F4F7" /><circle cx="13" cy="10" r="2" fill="#F3F4F7" /><circle cx="6" cy="15" r="2" fill="#F3F4F7" /></svg>Filter ({st.length})
          </button>
        </div>
        {filterOpen && (
          <div className="mt-3 rounded-[10px] bg-white p-3">
            {GROUP_OPTIONS.map((o) => (
              <label key={o.value} className="flex items-center gap-3 py-2 text-sm text-[color:var(--ds-ink)]"><input type="checkbox" checked={st.includes(o.value)} onChange={() => setSt((cur) => (cur.includes(o.value) ? cur.filter((x) => x !== o.value) : [...cur, o.value]))} />{o.label}</label>
            ))}
          </div>
        )}
      </div>
      {loading ? <p className="text-sm text-[color:var(--ds-body)]">Loading…</p> : (
        <>
        <ul className="space-y-3 md:hidden">
          {rows.map((a) => {
            const more = othersOf(a).length;
            const who = person(a);
            return (
              <li key={a.id} className="rounded-[10px] border border-[color:var(--ds-line)] bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Link href={`/admin/agreements/clients/${a.id}`} className="text-[15px] font-semibold text-[color:var(--ds-ink)]">{a.name}</Link>
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${a.group === 'active' ? 'border-[#047857] text-[#047857]' : 'border-[color:var(--ds-line)] text-[color:var(--ds-body)]'}`}>{GROUP_LABEL[a.group]}</span>
                    {a.markets.map((m) => <span key={m} className="rounded-full border border-[color:var(--ds-line)] px-2 py-0.5 text-[11px] text-[color:var(--ds-body)]">{m}</span>)}
                  </div>
                  <div className="-mr-2 -mt-1 rotate-90 [&_button]:!min-h-8 [&_button]:!h-8 [&_button]:!w-8 [&_button]:!border-0 [&_button]:!bg-transparent [&_button]:!text-[color:var(--ds-body)]"><RowMenu items={[{ label: 'View client', href: `/admin/agreements/clients/${a.id}` }]} /></div>
                </div>
                <p className="mt-1 text-sm text-[color:var(--ds-body)]">{a.type === 'individual' ? 'Individual' : 'Business'}</p>
                <p className="mt-1 text-sm text-[color:var(--ds-body)]">{who ? `${who}${more > 0 ? `, +${more} more` : ''}` : '—'}</p>
                {a.contact_email && <p className="text-sm text-[color:var(--ds-body)]">{a.contact_email}</p>}
                {a.billing_email && <p className="text-sm text-[color:var(--ds-body)]">Billing: {a.billing_email}</p>}
              </li>
            );
          })}
          {rows.length === 0 && <li className="py-10 text-center text-sm text-[color:var(--ds-body)]">No clients match.</li>}
        </ul>
        <div className="hidden overflow-x-auto md:block">
          <table className={`${A.table} min-w-[640px]`}>
            <thead><tr>{th('name', 'Client name')}{th('status', 'Status')}{th('contact', 'Main contact')}<th className="!font-medium !text-[color:var(--ds-body)]">Contact details</th><th /></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td><div className="flex flex-wrap items-center gap-2"><Link href={`/admin/agreements/clients/${a.id}`} className="font-semibold text-[color:var(--ds-ink)] hover:underline">{a.name}</Link>{a.markets.map((m) => <span key={m} className="rounded-full border border-[color:var(--ds-line)] px-2 py-0.5 text-[11px] font-normal text-[color:var(--ds-body)]">{m}</span>)}</div></td>
                  <td className="font-semibold text-[color:var(--ds-ink)]">{GROUP_LABEL[a.group]}</td>
                  <td className="text-[color:var(--ds-ink)]">{person(a) || '—'}</td>
                  <td className="text-[color:var(--ds-ink)]">{a.contact_email ?? '—'}<div className="text-xs text-[color:var(--ds-body)]">{a.phone ?? ''}</div>{a.billing_email && <div className="text-xs text-[color:var(--ds-body)]">Billing: {a.billing_email}</div>}</td>
                  <td className="text-right"><RowMenu items={[{ label: 'View client', href: `/admin/agreements/clients/${a.id}` }]} /></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-[color:var(--ds-body)]">No clients match.</td></tr>}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
