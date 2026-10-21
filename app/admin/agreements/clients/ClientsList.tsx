'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { A, RowMenu, SearchBox } from '@/components/anchor/ui';
import { GROUP_LABEL, mainName, mergeClients, useJson, type Adv, type Client, type Group } from './data';
import StatusSelect, { SortTh } from './StatusFilter';

const none: Adv[] = [];
type Key = 'name' | 'status' | 'contact';

export default function ClientsList() {
  const { data, loading, error } = useJson('/api/admin/advertisers', (j) => (j.advertisers ?? []) as Adv[], none);
  const [q, setQ] = useState('');
  const [st, setSt] = useState<Group[]>(['active']);
  const [sort, setSort] = useState<{ key: Key; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });
  const person = (a: Adv) => mainName(a);
  const clients = useMemo(() => mergeClients(data), [data]);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    const l = clients.filter((a) => st.includes(a.group) && (!n || `${a.name} ${person(a)} ${a.contact_email ?? ''}`.toLowerCase().includes(n)));
    const val = (a: Client) => (sort.key === 'name' ? a.name ?? '' : sort.key === 'status' ? GROUP_LABEL[a.group] : person(a));
    return [...l].sort((a, b) => (sort.dir === 'desc' ? -1 : 1) * val(a).localeCompare(val(b)));
  }, [clients, q, st, sort]);
  const th = (key: Key, label: string) => <SortTh label={label} dir={sort.key === key ? sort.dir : undefined} onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))} />;
  return (
    <div className="space-y-5">
      <div>
        <h1 className={A.title}>Clients</h1>
        <p className="mt-1 text-sm text-[color:var(--ds-body)]">The main contact person for each client. Other people in the organization are under Contacts.</p>
      </div>
      {error && <div className={A.error}>{error}</div>}
      <div className="flex flex-wrap items-center gap-3"><SearchBox value={q} onChange={setQ} label="Search clients" /><StatusSelect title="Client status" value={st} onChange={setSt} /></div>
      {loading ? <p className="text-sm text-[color:var(--ds-body)]">Loading…</p> : (
        <div className="overflow-x-auto">
          <table className={`${A.table} min-w-[640px]`}>
            <thead><tr>{th('name', 'Client name')}{th('status', 'Status')}{th('contact', 'Main contact')}<th className="!font-medium !text-[color:var(--ds-body)]">Contact details</th><th /></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td><div className="flex flex-wrap items-center gap-2"><Link href={`/admin/agreements/clients/${a.id}`} className="font-semibold text-[color:var(--ds-ink)] hover:underline">{a.name}</Link>{a.markets.map((m) => <span key={m} className="rounded-full border border-[color:var(--ds-line)] px-2 py-0.5 text-[11px] font-normal text-[color:var(--ds-body)]">{m}</span>)}</div></td>
                  <td className="font-semibold text-[color:var(--ds-ink)]">{GROUP_LABEL[a.group]}</td>
                  <td className="text-[color:var(--ds-ink)]">{person(a) || '—'}</td>
                  <td className="text-[color:var(--ds-ink)]">{a.contact_email ?? '—'}<div className="text-xs text-[color:var(--ds-body)]">{a.phone ?? ''}</div></td>
                  <td className="text-right"><RowMenu items={[{ label: 'View client', href: `/admin/agreements/clients/${a.id}` }]} /></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-[color:var(--ds-body)]">No clients match.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
