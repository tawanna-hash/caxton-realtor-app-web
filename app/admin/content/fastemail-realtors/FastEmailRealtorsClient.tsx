'use client';

import { useCallback, useEffect, useState } from 'react';
import PageTitle from '@/components/ui/PageTitle';

type Item = { id: string; received_at: string; agent_name: string | null; company: string | null; business_address: string | null; email: string | null; website: string | null; phone: string | null; status: 'pending' | 'realtyline' | 'san_antonio' | 'rejected' };
type Response = { rows: Item[]; counts: Record<string, number> };

export default function FastEmailRealtorsClient() {
  const [data, setData] = useState<Response>({ rows: [], counts: {} });
  const [filter, setFilter] = useState('pending');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/content/fastemail-realtors?status=${filter}`, { credentials: 'include' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Unable to load review queue.');
    setData(json);
  }, [filter]);

  useEffect(() => { void load().catch((e) => setNotice(e.message)); }, [load]);

  async function scan() {
    setBusy('scan'); setNotice(null);
    try {
      const res = await fetch('/api/admin/content/fastemail-realtors', { method: 'POST', credentials: 'include' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Scan failed.');
      setNotice(`Scan complete: ${json.queued} contact${json.queued === 1 ? '' : 's'} queued; ${json.skipped} skipped.`);
      await load();
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Scan failed.'); }
    finally { setBusy(null); }
  }

  async function act(id: string, action: 'realtyline' | 'san_antonio' | 'reject') {
    setBusy(id); setNotice(null);
    try {
      const res = await fetch('/api/admin/content/fastemail-realtors', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Update failed.');
      setNotice(json.duplicate ? 'The email already exists in that mailing list; review record was updated.' : action === 'reject' ? 'Record rejected.' : 'Contact added to the selected mailing list.');
      await load();
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Update failed.'); }
    finally { setBusy(null); }
  }

  const labels: Record<string, string> = { pending: 'Pending', realtyline: 'RealtyLine', san_antonio: 'San Antonio', rejected: 'Rejected', all: 'All' };
  return <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
    <div className="flex items-start justify-between gap-4 flex-wrap"><div><p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium">Content</p><PageTitle size="md">FastEmail Realtor Review</PageTitle><p className="mt-2 text-sm text-gray-600 max-w-2xl">Review realtor contact signatures from Fast Email Flyers. Property addresses are excluded. Contacts are only added after you choose a mailing list.</p></div><button onClick={scan} disabled={busy !== null} className="px-4 py-2 rounded-md bg-brand-700 text-white text-sm font-medium disabled:opacity-50">{busy === 'scan' ? 'Scanning…' : 'Scan FastEmail Flyers'}</button></div>
    {notice && <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">{notice}</div>}
    <div className="flex gap-2 flex-wrap">{['pending', 'realtyline', 'san_antonio', 'rejected', 'all'].map((key) => <button key={key} onClick={() => setFilter(key)} className={`rounded-md px-3 py-1.5 text-xs font-medium ${filter === key ? 'bg-brand-700 text-white' : 'bg-gray-100 text-gray-700'}`}>{labels[key]} {key === 'all' ? Object.values(data.counts).reduce((a, b) => a + b, 0) : data.counts[key] || 0}</button>)}</div>
    <div className="overflow-x-auto rounded-md border border-gray-200 bg-white"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-left text-xs uppercase text-gray-600"><tr><th className="px-3 py-3">Realtor</th><th className="px-3 py-3">Company</th><th className="px-3 py-3">Contact</th><th className="px-3 py-3">Business address</th><th className="px-3 py-3">Review</th></tr></thead><tbody className="divide-y divide-gray-100">{data.rows.length === 0 ? <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-500">No {labels[filter]?.toLowerCase() || ''} contacts.</td></tr> : data.rows.map((row) => <tr key={row.id}><td className="px-3 py-3 font-medium">{row.agent_name || '—'}<div className="text-xs font-normal text-gray-500">{new Date(row.received_at).toLocaleDateString()}</div></td><td className="px-3 py-3">{row.company || '—'}</td><td className="px-3 py-3">{row.email && <a className="block text-blue-700 hover:underline" href={`mailto:${row.email}`}>{row.email}</a>}{row.phone && <div>{row.phone}</div>}{row.website && <a className="block text-xs text-blue-700 hover:underline" href={row.website.startsWith('http') ? row.website : `https://${row.website}`} target="_blank">{row.website}</a>}</td><td className="px-3 py-3 whitespace-pre-line">{row.business_address || '—'}</td><td className="px-3 py-3">{row.status === 'pending' ? <div className="flex flex-wrap gap-2"><button disabled={busy !== null} onClick={() => act(row.id, 'realtyline')} className="rounded bg-brand-700 px-2.5 py-1 text-xs text-white disabled:opacity-50">Add to RealtyLine</button><button disabled={busy !== null} onClick={() => act(row.id, 'san_antonio')} className="rounded bg-orange-700 px-2.5 py-1 text-xs text-white disabled:opacity-50">Add to San Antonio</button><button disabled={busy !== null} onClick={() => act(row.id, 'reject')} className="rounded border border-red-300 px-2.5 py-1 text-xs text-red-700 disabled:opacity-50">Reject</button></div> : <span className="text-xs font-medium text-gray-600">{labels[row.status]}</span>}</td></tr>)}</tbody></table></div>
  </main>;
}
