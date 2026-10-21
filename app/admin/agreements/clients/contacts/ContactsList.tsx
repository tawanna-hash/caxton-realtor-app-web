'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { A, RowMenu, SearchBox } from '@/components/anchor/ui';
import { GROUP_LABEL, mainName, mergeClients, useJson, type Adv, type Client, type Group } from '../data';
import StatusSelect, { SortTh } from '../StatusFilter';

const none: Adv[] = [];
type C = { key: string; client: string; clientId: number; status: string; group: Group; name: string; email: string | null; phone: string | null };

export function contactsOf(a: Adv): Array<{ name: string; email: string | null; phone: string | null }> {
  const out: Array<{ name: string; email: string | null; phone: string | null }> = [];
  const main = [a.first_name, a.last_name].filter(Boolean).join(' ');
  // The main contact person is the Client itself; Contacts are everyone else.
  if (a.billing_contact_name && a.billing_contact_name !== main) out.push({ name: a.billing_contact_name, email: a.billing_email, phone: a.billing_contact_phone });
  for (const c of a.additional_contacts ?? []) if (c.name || c.email) out.push({ name: c.name || c.email || '—', email: c.email ?? null, phone: c.phone ?? null });
  return out;
}

type Key = 'client' | 'status' | 'name';

type P = { name: string; email: string | null; phone: string | null };
export function mainOf(a: Adv): P | null {
  const n = mainName(a);
  return n || a.contact_email ? { name: n || a.contact_email || '—', email: a.contact_email, phone: a.phone } : null;
}
const sameP = (x: P, y: P) => (x.email && y.email ? x.email.toLowerCase() === y.email.toLowerCase() : x.name.toLowerCase() === y.name.toLowerCase());
// Everyone in the organization except the client's main contact person,
// across every market record for the company.
export function othersOf(c: Client): P[] {
  const main = mainOf(c);
  const out: P[] = [];
  for (const r of c.records) {
    const list = [...(r === c.records.find((x) => x.id === c.id) ? [] : [mainOf(r)].filter(Boolean) as P[]), ...contactsOf(r)];
    for (const p of list) if (!(main && sameP(p, main)) && !out.some((o) => sameP(o, p))) out.push(p);
  }
  return out;
}

export default function ContactsList() {
  const { data, loading, error } = useJson('/api/admin/advertisers', (j) => (j.advertisers ?? []) as Adv[], none);
  const [q, setQ] = useState('');
  const [st, setSt] = useState<Group[]>(['active']);
  const [sort, setSort] = useState<{ key: Key; dir: 'asc' | 'desc' }>({ key: 'client', dir: 'asc' });
  const rows = useMemo<C[]>(() => {
    const all = mergeClients(data).flatMap((a) => othersOf(a).map((c, i) => ({ key: `${a.id}-${i}`, client: a.name, clientId: a.id, status: GROUP_LABEL[a.group], group: a.group, ...c })));
    const n = q.trim().toLowerCase();
    const l = all.filter((c) => st.includes(c.group) && (!n || c.client.toLowerCase().includes(n) || c.name.toLowerCase().includes(n) || (c.email ?? '').toLowerCase().includes(n)));
    const val = (c: C) => (sort.key === 'client' ? c.client : sort.key === 'status' ? c.status : c.name);
    return l.sort((a, b) => (sort.dir === 'desc' ? -1 : 1) * val(a).localeCompare(val(b)));
  }, [data, q, st, sort]);
  const th = (key: Key, label: string) => <SortTh label={label} dir={sort.key === key ? sort.dir : undefined} onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))} />;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-[color:var(--ds-ink)]">Contacts</h1>
        <p className="mt-1 text-sm text-[color:var(--ds-body)]">Other people inside each client organization. The main contact is on the client.</p>
      </div>
      {error && <div className={A.error}>{error}</div>}
      <div className="flex flex-wrap items-center gap-3"><SearchBox value={q} onChange={setQ} label="Search contacts" /><StatusSelect title="Contact status" value={st} onChange={setSt} /></div>
      {loading ? <p className="text-sm text-[color:var(--ds-body)]">Loading…</p> : (
        <div className="overflow-x-auto">
          <table className={`${A.table} min-w-[640px]`}>
            <thead><tr>{th('client', 'Client name')}{th('status', 'Status')}{th('name', 'Contact name')}<th>Contact details</th><th /></tr></thead>
            <tbody>
              {rows.slice(0, 300).map((c) => (
                <tr key={c.key}>
                  <td><Link href={`/admin/agreements/clients/${c.clientId}`} className="font-semibold text-[color:var(--ds-ink)] hover:underline">{c.client}</Link></td>
                  <td className="font-semibold text-[color:var(--ds-ink)]">{c.status}</td>
                  <td className="text-[color:var(--ds-ink)]">{c.name}</td>
                  <td className="text-[color:var(--ds-ink)]">{c.email ?? '—'}<div className="text-xs text-[color:var(--ds-body)]">{c.phone ?? ''}</div></td>
                  <td className="text-right"><RowMenu items={[{ label: 'View client', href: `/admin/agreements/clients/${c.clientId}` }]} /></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-[color:var(--ds-body)]">No contacts match.</td></tr>}
            </tbody>
          </table>
          {rows.length > 300 && <p className="mt-2 text-xs text-[color:var(--ds-body)]">Showing the first 300 of {rows.length}. Use search to narrow the list.</p>}
        </div>
      )}
    </div>
  );
}
