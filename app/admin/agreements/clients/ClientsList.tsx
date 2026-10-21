'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { A, RowMenu, SearchBox } from '@/components/anchor/ui';
import { GROUP_LABEL, groupOf, useJson, type Adv, type StatusFilter as SF } from './data';
import StatusSelect from './StatusFilter';

const none: Adv[] = [];

export default function ClientsList() {
  const { data, loading, error } = useJson('/api/admin/advertisers', (j) => (j.advertisers ?? []) as Adv[], none);
  const [q, setQ] = useState('');
  const [desc, setDesc] = useState(false);
  const [st, setSt] = useState<SF>('active');
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    const l = data.filter((a) => (st === 'all' || groupOf(a.status) === st) && (!n || (a.name ?? '').toLowerCase().includes(n) || (a.contact_email ?? '').toLowerCase().includes(n)));
    return [...l].sort((a, b) => (desc ? -1 : 1) * (a.name ?? '').localeCompare(b.name ?? ''));
  }, [data, q, desc, st]);
  return (
    <div className="space-y-5">
      <div><h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-[color:var(--ds-ink)]">Clients</h1><p className="mt-1 text-sm text-[color:var(--ds-body)]">The main contact person for each client. Other people in the organization are under Contacts.</p></div>
      {error && <div className={A.error}>{error}</div>}
      <div className="flex flex-wrap items-center gap-3"><SearchBox value={q} onChange={setQ} label="Search clients" /><StatusSelect label="Client status" value={st} onChange={setSt} /></div>
      {loading ? <p className="text-sm text-[color:var(--ds-body)]">Loading…</p> : (
        <div className="overflow-x-auto">
          <table className={`${A.table} min-w-[560px]`}>
            <thead><tr>
              <th><button type="button" onClick={() => setDesc((d) => !d)} style={{ border: 0, background: 'transparent', padding: 0 }} className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--ds-body)]">Client Name<span aria-hidden="true">{desc ? '▾' : '▴'}</span></button></th>
              <th>Status</th><th>Main contact</th><th>Contact details</th><th />
            </tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td><Link href={`/admin/agreements/clients/${a.id}`} className="font-medium text-[color:var(--ds-primary)] hover:underline">{a.name}</Link></td>
                  <td><span className="rounded-full border border-[color:var(--ds-line)] px-2.5 py-0.5 text-xs">{GROUP_LABEL[groupOf(a.status)]}</span></td>
                  <td>{[a.first_name, a.last_name].filter(Boolean).join(' ') || '—'}</td>
                  <td>{a.contact_email ?? '—'}<div className="text-xs text-[color:var(--ds-body)]">{a.phone ?? ''}</div></td>
                  <td className="text-right"><RowMenu items={[{ label: 'View client', href: `/admin/agreements/clients/${a.id}` }]} /></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-[color:var(--ds-body)]">No clients match your search.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
