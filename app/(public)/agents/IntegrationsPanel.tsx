'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';

type Account = { id: string; appSlug: string; appName: string; healthy: boolean };
type Catalog = { slug: string; name: string; group: string; description: string };

const CATALOG: Catalog[] = [
  { slug: 'google_calendar', name: 'Google Calendar', group: 'Calendar', description: 'Put closing deadlines on your own calendar.' },
  { slug: 'gmail', name: 'Gmail', group: 'Email', description: 'Send deal follow-ups from your own address.' },
  { slug: 'outlook', name: 'Outlook', group: 'Calendar and Email', description: 'Put deadlines on your Outlook calendar and send follow-ups from your Outlook address.' },
  { slug: 'google_drive', name: 'Google Drive', group: 'Documents', description: 'Save contracts and uploads to your Drive.' },
  { slug: 'dropbox', name: 'Dropbox', group: 'Documents', description: 'File deal documents in your Dropbox.' },
  { slug: 'microsoft_onedrive', name: 'OneDrive', group: 'Documents', description: 'File deal documents in your OneDrive.' },
  { slug: 'slack', name: 'Slack', group: 'Team', description: 'Get deadline alerts in your team channel.' },
  { slug: 'dotloop', name: 'Dotloop', group: 'Transactions', description: 'Bring in transactions you already run elsewhere.' },
];

export default function IntegrationsPanel() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [connectedOnly, setConnectedOnly] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    const res = await fetch('/api/agent-integrations', { credentials: 'include', cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as { configured: boolean; accounts: Account[]; error?: string };
    setConfigured(data.configured);
    setAccounts(data.accounts);
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

  const connect = async (slug: string) => {
    setBusy(slug); setMessage('');
    try {
      const { url } = await post({ action: 'connect', app: slug });
      if (url) window.open(url, '_blank', 'noopener');
      setMessage('Finish signing in in the new window, then come back here.');
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Could not connect.'); }
    setBusy('');
  };

  const disconnect = async (account: Account) => {
    if (!window.confirm(`Disconnect ${account.appName || 'this app'}?`)) return;
    setBusy(account.id); setMessage('');
    try { await post({ action: 'disconnect', accountId: account.id }); await refresh(); }
    catch (err) { setMessage(err instanceof Error ? err.message : 'Could not disconnect.'); }
    setBusy('');
  };

  const rows = useMemo(() => CATALOG.filter((item) => {
    const connected = accounts.some((a) => a.appSlug === item.slug);
    if (connectedOnly && !connected) return false;
    const q = query.trim().toLowerCase();
    return !q || `${item.name} ${item.group} ${item.description}`.toLowerCase().includes(q);
  }), [accounts, connectedOnly, query]);

  return (
    <section aria-label="Integrations" className="border border-slate-200 bg-white p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Integrations</p>
      <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-slate-950">Connect The Tools You Already Use</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">Each connection is yours alone. You sign in with the provider, and you can disconnect at any time.</p>

      {!configured && loaded && <p className="mt-4 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Integrations are not turned on yet. They will be available here soon.</p>}
      {message && <p role="status" className="mt-4 text-sm font-semibold text-[#301D5D]">{message}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex min-h-[42px] min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm">
          <Search className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search integrations" aria-label="Search integrations" className="min-w-0 flex-1 bg-transparent outline-none" />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={connectedOnly} onChange={(e) => setConnectedOnly(e.target.checked)} /> Show connected only</label>
      </div>

      <ul className="mt-4 divide-y divide-slate-100 border border-slate-200">
        {rows.length === 0 && <li className="p-4 text-sm text-slate-500">No integrations match.</li>}
        {rows.map((item) => {
          const account = accounts.find((a) => a.appSlug === item.slug);
          return (
            <li key={item.slug} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-semibold text-slate-950">{item.name} <span className="ml-1 text-xs font-medium text-slate-500">{item.group}</span></p>
                <p className="text-sm text-slate-600">{item.description}{account && !account.healthy ? ' Needs to be reconnected.' : ''}</p>
              </div>
              {account ? (
                <button type="button" disabled={busy === account.id} onClick={() => void disconnect(account)} className="min-h-[40px] rounded-md border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:border-[#9A3D2B] hover:text-[#9A3D2B] disabled:opacity-50">Disconnect</button>
              ) : (
                <button type="button" disabled={!configured || busy === item.slug} onClick={() => void connect(item.slug)} className="min-h-[40px] rounded-md bg-[#301D5D] px-4 text-sm font-bold text-white hover:bg-[#42277c] disabled:opacity-45">{busy === item.slug ? 'Opening…' : 'Connect'}</button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
