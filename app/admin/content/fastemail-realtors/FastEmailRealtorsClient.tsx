'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PageTitle from '@/components/ui/PageTitle';

type Item = { id: string; received_at: string; agent_name: string | null; company: string | null; business_address: string | null; email: string | null; website: string | null; phone: string | null; status: 'pending' | 'realtyline' | 'san_antonio' | 'rejected' };
type Response = { rows: Item[]; counts: Record<string, number> };
type SortKey = 'received_at' | 'agent_name' | 'company' | 'website';
const labels: Record<string, string> = { pending: 'Pending', realtyline: 'RealtyLine', san_antonio: 'San Antonio', rejected: 'Rejected', all: 'All' };
const websiteHref = (website: string) => /^https?:\/\//i.test(website) ? website : `https://${website}`;

export default function FastEmailRealtorsClient() {
  const [data, setData] = useState<Response>({ rows: [], counts: {} });
  const [filter, setFilter] = useState('pending');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'received_at', direction: 'desc' });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/content/fastemail-realtors?status=${filter}`, { credentials: 'include' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Unable to load review queue.');
    setData(json); setSelected(new Set());
  }, [filter]);
  useEffect(() => { void load().catch((e) => setNotice(e.message)); }, [load]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const value = (row: Item, key: SortKey) => key === 'received_at' ? row.received_at : row[key] || '';
    return data.rows.filter((row) => !needle || [row.agent_name, row.company, row.email, row.website, row.phone, row.business_address].some((v) => v?.toLowerCase().includes(needle))).sort((a, b) => String(value(a, sort.key)).localeCompare(String(value(b, sort.key)), undefined, { numeric: true, sensitivity: 'base' }) * (sort.direction === 'asc' ? 1 : -1));
  }, [data.rows, query, sort]);
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const toggleSort = (key: SortKey) => setSort((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }));
  const header = (key: SortKey, label: string) => <button className="font-medium hover:text-gray-900" onClick={() => toggleSort(key)}>{label}{sort.key === key ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ''}</button>;
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const toggleAll = () => setSelected((current) => allSelected ? new Set([...current].filter((id) => !rows.some((row) => row.id === id))) : new Set([...current, ...rows.map((row) => row.id)]));

  async function scan() { setBusy('scan'); setNotice(null); try { const res = await fetch('/api/admin/content/fastemail-realtors', { method: 'POST', credentials: 'include' }); const json = await res.json(); if (!res.ok) throw new Error(json.error || 'Scan failed.'); setNotice(`Scan complete: ${json.queued} queued; ${json.repaired || 0} repaired; ${json.skipped} skipped.`); await load(); } catch (e) { setNotice(e instanceof Error ? e.message : 'Scan failed.'); } finally { setBusy(null); } }
  async function act(id: string, action: 'realtyline' | 'san_antonio' | 'reject') { setBusy(id); setNotice(null); try { const res = await fetch('/api/admin/content/fastemail-realtors', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) }); const json = await res.json(); if (!res.ok) throw new Error(json.error || 'Update failed.'); setNotice(json.duplicate ? 'The email already exists in that mailing list; review record was updated.' : action === 'reject' ? 'Record rejected.' : 'Contact added to the selected mailing list.'); await load(); } catch (e) { setNotice(e instanceof Error ? e.message : 'Update failed.'); } finally { setBusy(null); } }
  async function deleteSelected() { const ids = [...selected]; if (!ids.length || !window.confirm(`Delete ${ids.length} selected review record${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return; setBusy('delete'); setNotice(null); try { const res = await fetch('/api/admin/content/fastemail-realtors/delete', { method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }); const json = await res.json(); if (!res.ok) throw new Error(json.error || 'Delete failed.'); setNotice(`${json.deleted} review record${json.deleted === 1 ? '' : 's'} deleted.`); await load(); } catch (e) { setNotice(e instanceof Error ? e.message : 'Delete failed.'); } finally { setBusy(null); } }

  return <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
    <div className="flex items-start justify-between gap-4 flex-wrap"><div><p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium">Content</p><PageTitle size="md">FastEmail Realtor Review</PageTitle><p className="mt-2 text-sm text-gray-600 max-w-2xl">Review realtor contact signatures from Fast Email Flyers. Property addresses are excluded. Contacts are only added after you choose a mailing list.</p></div><button onClick={scan} disabled={busy !== null} className="px-4 py-2 rounded-md bg-brand-700 text-white text-sm font-medium disabled:opacity-50">{busy === 'scan' ? 'Scanning…' : 'Scan FastEmail Flyers'}</button></div>
    {notice && <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">{notice}</div>}
    <div className="flex gap-2 flex-wrap">{['pending', 'realtyline', 'san_antonio', 'rejected', 'all'].map((key) => <button key={key} onClick={() => setFilter(key)} className={`rounded-md px-3 py-1.5 text-xs font-medium ${filter === key ? 'bg-brand-700 text-white' : 'bg-gray-100 text-gray-700'}`}>{labels[key]} {key === 'all' ? Object.values(data.counts).reduce((a, b) => a + b, 0) : data.counts[key] || 0}</button>)}</div>
    <div className="flex items-center gap-3 flex-wrap"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, company, website…" className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm" />{selected.size > 0 && <button onClick={deleteSelected} disabled={busy !== null} className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50">Delete selected ({selected.size})</button>}</div>
    <div className="overflow-x-auto rounded-md border border-gray-200 bg-white"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-left text-xs uppercase text-gray-600"><tr><th className="px-3 py-3"><input type="checkbox" aria-label="Select all visible rows" checked={allSelected} onChange={toggleAll} /></th><th className="px-3 py-3">{header('agent_name', 'Realtor')}</th><th className="px-3 py-3">{header('company', 'Company')}</th><th className="px-3 py-3">Contact</th><th className="px-3 py-3">{header('website', 'Website')}</th><th className="px-3 py-3">Business address</th><th className="px-3 py-3">Review</th></tr></thead><tbody className="divide-y divide-gray-100">{rows.length === 0 ? <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-500">No matching contacts.</td></tr> : rows.map((row) => <tr key={row.id}><td className="px-3 py-3"><input type="checkbox" aria-label={`Select ${row.agent_name || row.email || 'contact'}`} checked={selected.has(row.id)} onChange={() => toggle(row.id)} /></td><td className="px-3 py-3 font-medium">{row.agent_name || '—'}<div className="text-xs font-normal text-gray-500">{new Date(row.received_at).toLocaleDateString()}</div></td><td className="px-3 py-3">{row.company || '—'}</td><td className="px-3 py-3">{row.email && <a className="block text-blue-700 hover:underline" href={`mailto:${row.email}`}>{row.email}</a>}{row.phone && <div>{row.phone}</div>}</td><td className="px-3 py-3">{row.website ? <a className="block max-w-48 truncate text-blue-700 hover:underline" href={websiteHref(row.website)} target="_blank" rel="noreferrer" title={row.website}>{row.website}</a> : '—'}</td><td className="px-3 py-3 whitespace-pre-line">{row.business_address || '—'}</td><td className="px-3 py-3">{row.status === 'pending' ? <div className="flex flex-wrap gap-2"><button disabled={busy !== null} onClick={() => act(row.id, 'realtyline')} className="rounded-md bg-brand-700 px-2.5 py-1 text-xs text-white disabled:opacity-50">Add to RealtyLine</button><button disabled={busy !== null} onClick={() => act(row.id, 'san_antonio')} className="rounded-md bg-orange-700 px-2.5 py-1 text-xs text-white disabled:opacity-50">Add to San Antonio</button><button disabled={busy !== null} onClick={() => act(row.id, 'reject')} className="rounded-md border border-red-300 px-2.5 py-1 text-xs text-red-700 disabled:opacity-50">Reject</button></div> : <span className="text-xs font-medium text-gray-600">{labels[row.status]}</span>}</td></tr>)}</tbody></table></div>
  </main>;
}
