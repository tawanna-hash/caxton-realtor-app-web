'use client';

import { useMemo, useState } from 'react';
import { A, RowMenu, SearchBox } from '@/components/anchor/ui';
import { useJson, type Adv } from '../data';

const none: Adv[] = [];
type C = { key: string; client: string; clientId: number; status: string; name: string; email: string | null; phone: string | null };

export function contactsOf(a: Adv): Array<{ name: string; email: string | null; phone: string | null }> {
  const out: Array<{ name: string; email: string | null; phone: string | null }> = [];
  const main = [a.first_name, a.last_name].filter(Boolean).join(' ');
  if (main || a.contact_email) out.push({ name: main || a.contact_email || '—', email: a.contact_email, phone: a.phone });
  if (a.billing_contact_name && a.billing_contact_name !== main) out.push({ name: a.billing_contact_name, email: a.billing_email, phone: a.billing_contact_phone });
  for (const c of a.additional_contacts ?? []) if (c.name || c.email) out.push({ name: c.name || c.email || '—', email: c.email ?? null, phone: c.phone ?? null });
  return out;
}

export default function ContactsList() {
  const { data, loading, error } = useJson('/api/admin/advertisers', (j) => (j.advertisers ?? []) as Adv[], none);
  const [q, setQ] = useState('');
  const rows = useMemo<C[]>(() => {
    const all = data.flatMap((a) => contactsOf(a).map((c, i) => ({ key: `${a.id}-${i}`, client: a.name, clientId: a.id, status: a.status === 'inactive' ? 'Inactive' : 'Active', ...c })));
    const n = q.trim().toLowerCase();
    return all.filter((c) => !n || c.client.toLowerCase().includes(n) || c.name.toLowerCase().includes(n) || (c.email ?? '').toLowerCase().includes(n));
  }, [data, q]);
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold text-[color:var(--ds-ink)]">Contacts</h2>
      {error && <div className={A.error}>{error}</div>}
      <SearchBox value={q} onChange={setQ} label="Search contacts" />
      {loading ? <p className="text-sm text-[color:var(--ds-body)]">Loading…</p> : (
        <div className="overflow-x-auto">
          <table className={`${A.table} min-w-[640px]`}>
            <thead><tr><th>Client Name</th><th>Status</th><th>Contact Name</th><th>Contact Details</th><th /></tr></thead>
            <tbody>
              {rows.slice(0, 300).map((c) => (
                <tr key={c.key}>
                  <td className="font-medium text-[color:var(--ds-ink)]">{c.client}</td>
                  <td>{c.status}</td>
                  <td>{c.name}</td>
                  <td>{c.email ?? '—'}<div className="text-xs text-[color:var(--ds-body)]">{c.phone ?? ''}</div></td>
                  <td className="text-right"><RowMenu items={[{ label: 'View client', href: `/admin/agreements/clients/${c.clientId}` }]} /></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-[color:var(--ds-body)]">No contacts match your search.</td></tr>}
            </tbody>
          </table>
          {rows.length > 300 && <p className="mt-2 text-xs text-[color:var(--ds-body)]">Showing the first 300 of {rows.length}. Use search to narrow the list.</p>}
        </div>
      )}
    </div>
  );
}
