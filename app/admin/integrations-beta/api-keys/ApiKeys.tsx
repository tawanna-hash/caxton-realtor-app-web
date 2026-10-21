'use client';

import { useCallback, useEffect, useState } from 'react';
import { A } from '@/components/anchor/ui';
import SortTable from '@/components/anchor/SortTable';

type Key = { id: string; name: string; key_prefix: string; created_by: string | null; created_at: string; last_used_at: string | null };
const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never');

export default function ApiKeys() {
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/api-keys', { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    setKeys(r.ok ? j.keys : []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function create() {
    setErr('');
    const r = await fetch('/api/admin/api-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error || 'Could not generate key.'); return; }
    setNewKey(j.key); setName(''); void load();
  }
  async function revoke(k: Key) {
    if (!confirm(`Revoke "${k.name}"? Anything using it will stop working.`)) return;
    await fetch(`/api/admin/api-keys/${k.id}`, { method: 'DELETE' });
    void load();
  }
  const close = () => { setOpen(false); setNewKey(''); setErr(''); setCopied(false); };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div><h2 className="text-lg font-medium text-[color:var(--ds-ink)]">API keys</h2><p className={A.subtitle}>Generate and manage keys for accessing the API</p></div>
        {keys && keys.length > 0 && <button className={A.primary} onClick={() => setOpen(true)}>Generate API key</button>}
      </div>
      <p className={A.notice}>Keys can be created and revoked here. No public API endpoints accept them yet, so a key does not grant access to anything today.</p>

      {keys && keys.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-[10px] bg-white py-16 text-center">
          <p className="text-base font-medium text-[color:var(--ds-ink)]">Connect your tools using our open API</p>
          <p className="max-w-md text-sm text-[color:var(--ds-body)]">Generate a key to let another system call this app on your behalf.</p>
          <button className={A.primary} onClick={() => setOpen(true)}>Generate API key</button>
        </div>
      )}
      {keys && keys.length > 0 && (
        <SortTable rows={keys} cols={[{ label: 'Name', get: (r) => r.name }, { label: 'Key', get: (r) => r.key_prefix }, { label: 'Created', get: (r) => r.created_at }, { label: 'Created by', get: (r) => r.created_by }, { label: 'Last used', get: (r) => r.last_used_at }, { label: '' }]} className={A.table}>
{(rws) => (<>{rws.map((k) => (
            <tr key={k.id}><td className="font-medium">{k.name}</td><td className="font-mono text-xs">{k.key_prefix}…</td><td>{fmt(k.created_at)}</td><td>{k.created_by ?? ''}</td><td>{fmt(k.last_used_at)}</td><td className="text-right"><button className={A.small} onClick={() => revoke(k)}>Revoke</button></td></tr>
          ))}</>)}
</SortTable>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Generate API key">
          <div className="w-full max-w-md space-y-4 rounded-[14px] bg-white p-6">
            <h3 className="text-lg font-medium text-[color:var(--ds-ink)]">{newKey ? 'Copy your API key' : 'Generate API key'}</h3>
            {err && <p className={A.error}>{err}</p>}
            {newKey ? (
              <>
                <p className="text-sm text-[color:var(--ds-body)]">This is the only time the full key is shown. Store it somewhere safe.</p>
                <code className="block break-all rounded-[10px] bg-[color:var(--ds-page)] p-3 text-xs">{newKey}</code>
                <div className="flex justify-end gap-2">
                  <button className={A.outline} onClick={async () => { await navigator.clipboard.writeText(newKey); setCopied(true); }}>{copied ? 'Copied' : 'Copy'}</button>
                  <button className={A.primary} onClick={close}>Done</button>
                </div>
              </>
            ) : (
              <>
                <input className={A.input} placeholder="Key name, for example Zapier" aria-label="Key name" value={name} onChange={(e) => setName(e.target.value)} />
                <div className="flex justify-end gap-2"><button className={A.outline} onClick={close}>Cancel</button><button className={A.primary} disabled={!name.trim()} onClick={create}>Generate</button></div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
