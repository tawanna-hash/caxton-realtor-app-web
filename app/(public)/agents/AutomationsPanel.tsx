'use client';

import { useCallback, useEffect, useState } from 'react';

type Key = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null };
type Hook = { id: string; url: string; events: string[]; active: boolean; lastDeliveryAt: string | null; lastStatus: string | null };

const BTN = 'inline-flex items-center gap-1.5 rounded-md border border-[#E6E5EC] bg-white px-3 py-1.5 text-[13px] font-medium text-[#301D5D] hover:!bg-[#EFEAF8] hover:!text-[#301D5D] disabled:opacity-50';
const INPUT = 'w-full rounded-md border border-[#E6E5EC] bg-white px-3 py-1.5 text-[14px] text-[#1B1726]';
const EVENT_LABEL: Record<string, string> = {
  'deal.created': 'Deal Created', 'deal.status_changed': 'Deal Status Changed',
  'deal.closing_date_changed': 'Closing Date Changed', 'deal.deleted': 'Deal Deleted',
};
const API = '/api/closing-time/automation';

export default function AutomationsPanel() {
  const [keys, setKeys] = useState<Key[]>([]);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [keyName, setKeyName] = useState('');
  const [hookUrl, setHookUrl] = useState('');
  const [hookEvents, setHookEvents] = useState<string[]>(['deal.created', 'deal.status_changed']);
  const [secret, setSecret] = useState<{ label: string; value: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(API, { credentials: 'same-origin' });
    if (!res.ok) return;
    const d = await res.json();
    setKeys(d.keys ?? []); setHooks(d.webhooks ?? []); setEvents(d.events ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function post(body: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(API, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? data?.error ?? 'Something went wrong');
      await load();
      return data;
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong' }); return null; }
    finally { setBusy(false); }
  }

  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  return (
    <div className="ds-page space-y-6">
      {secret && (
        <div role="alert" className="rounded-lg border border-[#E6E5EC] bg-[#F6F3FB] p-4 text-[14px] text-[#1B1726]">
          <p className="font-semibold">{secret.label}</p>
          <p className="mt-1 text-[#4A4757]">Copy it now. It is shown only once.</p>
          <code className="mt-2 block break-all rounded-md border border-[#E6E5EC] bg-white p-2 text-[13px]">{secret.value}</code>
          <button type="button" className={`${BTN} mt-2`} onClick={() => { void navigator.clipboard?.writeText(secret.value); }}>Copy</button>
          <button type="button" className={`${BTN} mt-2 ml-2`} onClick={() => setSecret(null)}>Done</button>
        </div>
      )}

      <section className="rounded-lg border border-[#E6E5EC] bg-white p-5">
        <h2 className="text-[14px] font-semibold text-[#1B1726]">API Keys</h2>
        <p className="mt-1 text-[14px] text-[#4A4757]">Read your deals from Zapier, Make, n8n or a spreadsheet. Send the key as a Bearer token to <code className="text-[13px]">{origin}/api/closing-time/v1/deals</code>. Add <code className="text-[13px]">?status=active</code> or <code className="text-[13px]">?updated_since=2026-10-01T00:00:00Z</code> to narrow the list.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input className={`${INPUT} max-w-xs`} placeholder="Key Name, For Example Zapier" value={keyName} onChange={(e) => setKeyName(e.target.value)} />
          <button type="button" className={BTN} disabled={busy || !keyName.trim()} onClick={async () => { const r = await post({ action: 'create-key', name: keyName.trim() }); if (r) { setSecret({ label: `API key for ${keyName.trim()}`, value: r.key }); setKeyName(''); } }}>Create Key</button>
        </div>
        <ul className="mt-3 divide-y divide-[#E6E5EC]">
          {keys.length === 0 && <li className="py-2 text-[14px] text-[#7A7787]">No keys yet.</li>}
          {keys.map((k) => (
            <li key={k.id} className="flex items-center justify-between gap-3 py-2 text-[14px] text-[#1B1726]">
              <span>{k.name} <span className="text-[#7A7787]">· {k.prefix}… · {k.lastUsedAt ? `Last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : 'Never used'}</span></span>
              <button type="button" className={BTN} disabled={busy} onClick={() => void post({ action: 'revoke-key', id: k.id })}>Revoke</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-[#E6E5EC] bg-white p-5">
        <h2 className="text-[14px] font-semibold text-[#1B1726]">Webhooks</h2>
        <p className="mt-1 text-[14px] text-[#4A4757]">Send a message to a web address when something changes. Every message is signed. The signature is an HMAC SHA-256 of the timestamp, a period, and the body, sent in the X-ClosingTime-Signature header. The address must start with https://.</p>
        <div className="mt-3 space-y-2">
          <input className={INPUT} placeholder="https://hooks.zapier.com/..." value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} />
          <div className="flex flex-wrap gap-3 text-[14px] text-[#1B1726]">
            {events.map((ev) => (
              <label key={ev} className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={hookEvents.includes(ev)} onChange={(e) => setHookEvents((cur) => e.target.checked ? [...cur, ev] : cur.filter((x) => x !== ev))} />
                {EVENT_LABEL[ev] ?? ev}
              </label>
            ))}
          </div>
          <button type="button" className={BTN} disabled={busy || !hookUrl.trim() || hookEvents.length === 0} onClick={async () => { const r = await post({ action: 'create-webhook', url: hookUrl.trim(), events: hookEvents }); if (r) { setSecret({ label: 'Signing secret for this webhook', value: r.secret }); setHookUrl(''); } }}>Add Webhook</button>
        </div>
        <ul className="mt-3 divide-y divide-[#E6E5EC]">
          {hooks.length === 0 && <li className="py-2 text-[14px] text-[#7A7787]">No webhooks yet.</li>}
          {hooks.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-3 py-2 text-[14px] text-[#1B1726]">
              <span className="min-w-0 break-all">{h.url}<span className="block text-[13px] text-[#7A7787]">{h.events.map((e) => EVENT_LABEL[e] ?? e).join(', ')} · {h.lastDeliveryAt ? `Last sent ${new Date(h.lastDeliveryAt).toLocaleString()} (${h.lastStatus})` : 'Not sent yet'}</span></span>
              <button type="button" className={BTN} disabled={busy} onClick={() => void post({ action: 'delete-webhook', id: h.id })}>Delete</button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[13px] text-[#7A7787]">Messages carry the deal address, names, dates, status and client contacts. Documents and private notes are never sent.</p>
        {msg && <p role="status" className={`mt-2 text-[14px] ${msg.ok ? 'text-[#005A00]' : 'text-[#661102]'}`}>{msg.text}</p>}
      </section>
    </div>
  );
}
