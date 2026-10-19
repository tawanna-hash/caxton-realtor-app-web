'use client';

import { useCallback, useEffect, useState } from 'react';
import SidebarWindow from '../SidebarWindow';
import { BTN, BTN_PRIMARY } from '../ui';

type Account = { id: string; appSlug: string; appName: string; healthy: boolean };

const APPS = [
  {
    slug: 'gmail', name: 'Gmail', site: 'https://accounts.google.com/signup',
    required: 'Required to send email from Closing Time. Contract emails, booking confirmations and closing requests go out from your own Gmail, so Closing Time sends no client email for you. Gmail carries no added charge from Closing Time.',
  },
  {
    slug: 'outlook', name: 'Outlook', site: 'https://signup.live.com',
    required: 'Required to send email from Closing Time if you use Outlook. Contract emails, booking confirmations and closing requests go out from your own Outlook account. Outlook carries no added charge from Closing Time.',
  },
] as const;

export default function EmailClient() {
  const [selected, setSelected] = useState<string>('gmail');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/agent-integrations', { credentials: 'include', cache: 'no-store' });
    if (!res.ok) { setLoaded(true); return; }
    const data = (await res.json()) as { configured: boolean; accounts: Account[]; error?: string };
    setConfigured(data.configured);
    setAccounts(data.accounts);
    setLoaded(true);
    if (data.error) setMessage({ ok: false, text: data.error });
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void refresh(), 0);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => { window.clearTimeout(first); window.removeEventListener('focus', onFocus); };
  }, [refresh]);

  async function post(payload: Record<string, string>) {
    const res = await fetch('/api/agent-integrations', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok) throw new Error(data.error ?? 'Something went wrong.');
    return data;
  }

  async function connect(slug: string) {
    setBusy(slug); setMessage(null);
    try {
      const { url } = await post({ action: 'connect', app: slug });
      if (url) window.open(url, '_blank', 'noopener');
      setMessage({ ok: true, text: 'Finish signing in in the new window, then come back here.' });
    } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not connect.' }); }
    setBusy('');
  }

  async function disconnect(account: Account) {
    if (!window.confirm(`Disconnect ${account.appName || 'this account'}?`)) return;
    setBusy(account.id); setMessage(null);
    try { await post({ action: 'disconnect', accountId: account.id }); await refresh(); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not disconnect.' }); }
    setBusy('');
  }

  const app = APPS.find((a) => a.slug === selected) ?? APPS[0];
  const account = accounts.find((a) => a.appSlug === app.slug);

  return (
    <SidebarWindow
      label="Email accounts"
      items={APPS.map((a) => ({ id: a.slug, label: a.name }))}
      selected={selected}
      onSelect={(id) => { setSelected(id); setMessage(null); }}
    >
      <section className="rounded-lg border border-[#D9D2E9] bg-white p-5">
        <h2 className="text-lg font-semibold">{app.name}</h2>
        <p className="mt-1 text-sm">Connect your {app.name} account so follow-ups can go out from your own address.</p>
        <dl className="mt-4 divide-y divide-[#EEE9F6] text-sm">
          <div className="flex justify-between gap-3 py-2"><dt>Category</dt><dd className="font-medium">Email</dd></div>
          <div className="flex justify-between gap-3 py-2"><dt>Status</dt><dd className="font-medium">{!loaded ? 'Checking' : account ? 'Connected' : 'Not Connected'}</dd></div>
        </dl>
        {!account && (
          <div className="mt-4 space-y-3 rounded-lg border border-[#D9D2E9] bg-[#F6F3FB] p-4 text-sm" role="note">
            <p>You need your own {app.name} account to use this integration. Closing Time does not provide or manage it, and is not responsible for any charges from {app.name}. Do not have one yet? <a className="underline" href={app.site} target="_blank" rel="noopener noreferrer">Sign Up At {app.name}</a>.</p>
            <p>{app.required}</p>
          </div>
        )}
        <p className="mt-4 text-sm">{account ? `You can disconnect ${app.name} at any time.` : `You will sign in with ${app.name} in a new window. The connection is yours alone; nobody else in your brokerage can use it.`}</p>
        {!configured && loaded && <p className="mt-3 text-sm">Connecting accounts is not turned on yet.</p>}
        {message && <p role="status" className={`mt-3 text-sm ${message.ok ? '' : 'text-red-700'}`}>{message.text}</p>}
        <div className="mt-4">
          {account ? (
            <button type="button" className={`${BTN} !border-red-200 !text-red-700`} disabled={busy === account.id} onClick={() => void disconnect(account)}>Disconnect</button>
          ) : (
            <button type="button" className={BTN_PRIMARY} disabled={!configured || busy === app.slug} onClick={() => void connect(app.slug)}>{busy === app.slug ? 'Opening...' : `Connect ${app.name}`}</button>
          )}
        </div>
        <p className="mt-4 text-xs">Contract date alerts keep coming from Realty News Now by email and push. Your connected account is for sending from Closing Time.</p>
      </section>
    </SidebarWindow>
  );
}
