'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import CollapseToggle, { useCollapsibles } from './CollapseToggle';

type Account = { id: string; appSlug: string; appName: string; healthy: boolean };
type Catalog = { slug: string; name: string; group: string; logo?: string };

const BLURBS: Record<string, string> = {
  'E-Signature': 'so signed documents can be tracked on your deals',
  'Calendar and Scheduling': 'so closing dates and meetings can be added to your calendar',
  Email: 'so follow-ups can go out from your own address',
  'Documents and Storage': 'so deal documents can be saved to your own account',
  'CRM and Leads': 'so your clients and leads stay in sync with your deals',
  'Messaging and Calls': 'so you and your team can be reached about deadlines',
  'Real Estate': 'so deals you already run elsewhere can be brought in',
  'Accounting and Payments': 'so commissions and expenses can be tracked',
  'Tasks and Projects': 'so deal tasks can be shared with your task tools',
  'Marketing and Social': 'so your marketing tools can work with your deals',
};

function Logo({ item, size }: { item: Catalog; size: number }) {
  const style = { width: size, height: size };
  if (item.logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.logo} alt="" width={size} height={size} style={style} className="shrink-0 rounded-md object-contain" />;
  }
  return <span style={style} className="flex shrink-0 items-center justify-center rounded-md bg-[#301D5D]/10 text-sm font-bold text-[#301D5D]" aria-hidden="true">{item.name.slice(0, 1)}</span>;
}

export default function IntegrationsPanel({ calendarTile }: { calendarTile?: ReactNode } = {}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [catalog, setCatalog] = useState<Catalog[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [connectedOnly, setConnectedOnly] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<Catalog | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/agent-integrations', { credentials: 'include', cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as { configured: boolean; accounts: Account[]; catalog?: Catalog[]; error?: string };
    setConfigured(data.configured);
    setAccounts(data.accounts);
    if (data.catalog?.length) setCatalog(data.catalog);
    setLoaded(true);
    if (data.error) setMessage(data.error);
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void refresh(), 0);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => { window.clearTimeout(first); window.removeEventListener('focus', onFocus); };
  }, [refresh]);

  const post = async (payload: Record<string, string>) => {
    const res = await fetch('/api/agent-integrations', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? 'Something went wrong.');
    return data as { url?: string };
  };

  const connect = async (item: Catalog) => {
    setBusy(item.slug); setMessage('');
    try {
      const { url } = await post({ action: 'connect', app: item.slug });
      if (url) window.open(url, '_blank', 'noopener');
      setMessage('Finish signing in in the new window, then come back here.');
      setSelected(null);
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Could not connect.'); }
    setBusy('');
  };

  const disconnect = async (account: Account) => {
    if (!window.confirm(`Disconnect ${account.appName || 'this app'}?`)) return;
    setBusy(account.id); setMessage('');
    try { await post({ action: 'disconnect', accountId: account.id }); await refresh(); setSelected(null); }
    catch (err) { setMessage(err instanceof Error ? err.message : 'Could not disconnect.'); }
    setBusy('');
  };

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: { group: string; items: Catalog[] }[] = [];
    for (const item of catalog) {
      if (connectedOnly && !accounts.some((a) => a.appSlug === item.slug)) continue;
      if (q && !`${item.name} ${item.group}`.toLowerCase().includes(q)) continue;
      let bucket = out.find((g) => g.group === item.group);
      if (!bucket) { bucket = { group: item.group, items: [] }; out.push(bucket); }
      bucket.items.push(item);
    }
    return out;
  }, [accounts, catalog, connectedOnly, query]);

  const { section: collapsible, toggleProps } = useCollapsibles();
  const selectedAccount = selected ? accounts.find((a) => a.appSlug === selected.slug) : undefined;

  return (
    <section aria-label="Integrations" {...collapsible('integrations', { mobileOpen: true })} data-section-key={undefined} className="ds-page">
      <div className="flex items-center gap-3">
        <div>
          <p className="ds-eyebrow">Tools</p>
          <h2 className="ds-title">Integrations</h2>
          <p className="ds-subtitle">Connect the tools you already use.</p>
        </div>
        <CollapseToggle {...toggleProps('integrations', 'integrations', { mobileOpen: true })} className="ml-auto" />
      </div>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">Each connection is yours alone. You sign in with the provider, and you can disconnect at any time.</p>

      {!configured && loaded && <p className="mt-4 border border-[#FAD800] bg-[#FEF8CC] p-3 text-sm text-[#645600]">Integrations are not turned on yet. They will be available here soon.</p>}
      {message && <p role="status" className="mt-4 text-sm font-semibold text-[#301D5D]">{message}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex min-h-[40px] min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm">
          <Search className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search integrations" aria-label="Search integrations" className="min-w-0 flex-1 bg-transparent outline-none" />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={connectedOnly} onChange={(e) => setConnectedOnly(e.target.checked)} /> Show Connected Only</label>
      </div>

      {loaded && groups.length === 0 && <p className="mt-4 text-sm text-slate-500">No integrations match.</p>}
      {groups.map((g) => (
        <div key={g.group} className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{g.group}</h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((item) => {
              const connected = accounts.some((a) => a.appSlug === item.slug);
              return (
                <li key={item.slug}>
                  <button type="button" onClick={() => setSelected(item)} className="flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 text-left hover:bg-[#F6F3FB]">
                    <Logo item={item} size={28} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-950">{item.name}</span>
                    {connected && <span className="shrink-0 rounded-full bg-[#E0FBE0] px-2 py-0.5 text-xs font-semibold text-[#005A00]">Connected</span>}
                  </button>
                </li>
              );
            })}
            {g.group === 'Calendar and Scheduling' ? calendarTile : null}
          </ul>
        </div>
      ))}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-label={selected.name} onClick={() => setSelected(null)}>
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3"><Logo item={selected} size={36} /><h3 className="truncate text-lg font-semibold text-gray-900">{selected.name}</h3></div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"><X className="h-5 w-5" aria-hidden="true" /></button>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-700">Connect your {selected.name} account {BLURBS[selected.group] ?? 'so it can work with your deals'}.</p>
            <p className="mt-3 rounded-md border border-slate-200 p-3 text-sm text-slate-600">{selectedAccount ? `Connected. You can disconnect ${selected.name} at any time.` : `Not connected yet. You will sign in with ${selected.name} in a new window.`}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setSelected(null)} className="min-h-[40px] rounded-md border border-slate-300 px-4 text-sm font-bold text-slate-700">Cancel</button>
              {selectedAccount ? (
                <button type="button" disabled={busy === selectedAccount.id} onClick={() => void disconnect(selectedAccount)} className="min-h-[40px] rounded-md border border-[#661102] px-4 text-sm font-bold text-[#661102] disabled:opacity-50">Disconnect</button>
              ) : (
                <button type="button" disabled={!configured || busy === selected.slug} onClick={() => void connect(selected)} className="min-h-[40px] rounded-md bg-[#301D5D] px-4 text-sm font-bold text-white hover:bg-[#42277C] disabled:opacity-45">{busy === selected.slug ? 'Opening…' : `Connect ${selected.name}`}</button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
