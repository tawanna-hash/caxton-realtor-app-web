'use client';

// Anchor-style Notification Settings: two underlined sub-tabs, a table of
// events with recipients and an on/off switch. Changes save as you toggle.

import { useEffect, useState } from 'react';
import { A, Toggle } from '@/components/anchor/ui';

type EventDef = { key: string; audience: 'client' | 'team'; label: string; recipients: string };

export default function NotificationsPanel() {
  const [events, setEvents] = useState<EventDef[]>([]);
  const [settings, setSettings] = useState<Record<string, boolean>>({});
  const [who, setWho] = useState<'team' | 'client'>('client');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/admin/agreements-v2/notifications', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { setEvents(j.events ?? []); setSettings(j.settings ?? {}); })
      .catch(() => setError('Could not load notification settings.'));
  }, []);

  async function change(key: string, on: boolean) {
    const before = settings;
    setSettings({ ...settings, [key]: on });
    setSaved(false);
    try {
      const r = await fetch('/api/admin/agreements-v2/notifications', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ [key]: on }) });
      if (!r.ok) throw new Error();
      setSaved(true);
    } catch {
      setSettings(before);
      setError('Could not save that change.');
    }
  }

  const rows = events.filter((e) => e.audience === who);

  return (
    <div className="space-y-4">
      <div className="flex gap-x-8 border-b border-[#D8D5E6]" role="tablist" aria-label="Notification audience">
        {([['team', 'Notifications sent to your team'], ['client', 'Notifications sent to your clients']] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={who === k} onClick={() => setWho(k)} className="anchor-tab -mb-px pb-3 text-[15px]">{label}</button>
        ))}
      </div>
      {error && <div className={A.error}>{error}</div>}
      {saved && <div className={A.notice}>Saved.</div>}
      <p className="text-sm text-[#6E6A8A]">{who === 'client' ? 'Emails the Agreements (Beta) flow sends to partners. Turning one off stops it from sending.' : 'Alerts your team receives.'}</p>
      <div className="overflow-x-auto">
        <table className={`${A.table} min-w-[640px]`}>
          <thead><tr><th>Event name</th><th>Recipients</th><th className="text-right">Status</th></tr></thead>
          <tbody>
            {who === 'team' && (
              <tr>
                <td className="font-semibold text-[#261E5A]">Agreement signed</td>
                <td className="text-[#261E5A]">Admin email</td>
                <td className="text-right"><div className="flex justify-end"><Toggle on label="Agreement signed" disabled onChange={() => undefined} /></div><div className="mt-1 text-xs text-[#6E6A8A]">Always on</div></td>
              </tr>
            )}
            {rows.map((e) => (
              <tr key={e.key}>
                <td className="font-semibold text-[#261E5A]">{e.label}</td>
                <td className="text-[#261E5A]">{e.recipients}</td>
                <td><div className="flex justify-end"><Toggle on={settings[e.key] !== false} label={e.label} onChange={(v) => change(e.key, v)} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
