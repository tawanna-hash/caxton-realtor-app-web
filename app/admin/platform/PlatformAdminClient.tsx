'use client';

import { useCallback, useEffect, useState } from 'react';

type Setting = { key: string; value: unknown; description: string; updated_by: string | null; updated_at: string };
type Flag = { key: string; label: string; description: string; enabled: boolean; release_id: string | null };
type Release = { id: string; title: string; summary: string; flag_keys: string[]; notice_subject: string; notice_body: string; go_live_at: string | null; notice_sent_at: string | null; notice_result: Record<string, unknown> | null; status: string; published_at: string | null };
type Data = { settings: Setting[]; flags: Flag[]; releases: Release[]; log: { id: number; actor: string; action: string; detail: unknown; created_at: string }[]; history: { id: number; key: string; old_value: unknown; new_value: unknown; changed_by: string; changed_at: string }[]; noticeLeadDays: number; smsOn: boolean; audience: { total: number; withPhone: number } };

const TABS = ['Releases', 'Feature Switches', 'System Settings', 'Change Log'] as const;
const STATUS: Record<string, string> = { draft: 'Draft', notified: 'Notice Sent', live: 'Live', cancelled: 'Cancelled' };
const inp = 'w-full rounded-md border border-[#E6E5EC] bg-white px-3 py-2 text-sm text-[#1B1726]';
const btn = 'rounded-md border border-[#E6E5EC] bg-white px-3 py-1.5 text-[13px] font-medium text-[#1B1726] hover:bg-[#EFEAF8] hover:text-[#301D5D] disabled:opacity-50';
const fmt = (v: string | null) => (v ? new Date(v).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' }) : '—');

export default function PlatformAdminClient() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Releases');
  const [data, setData] = useState<Data | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const r = await fetch('/api/admin/platform', { cache: 'no-store' }); if (r.ok) setData(await r.json()); }, []);
  useEffect(() => { void load(); }, [load]);
  const act = async (payload: Record<string, unknown>, done?: string) => {
    setBusy(true); setMsg('');
    const r = await fetch('/api/admin/platform', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(j.error ?? 'That did not work.'); return false; }
    setMsg(done ?? 'Saved.'); await load(); return j;
  };

  // New release form
  const [rel, setRel] = useState({ title: '', summary: '', flagKeys: [] as string[], noticeSubject: '', noticeBody: '', goLiveAt: '' });
  // New switch / setting forms
  const [flag, setFlag] = useState({ key: '', label: '', description: '' });
  const [set, setSet] = useState({ key: '', valueJson: '', description: '' });
  const minGoLive = new Date(Date.now() + (data?.noticeLeadDays ?? 7) * 86400000).toISOString().slice(0, 16);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-[22px] font-semibold text-[#1B1726]">Closing Time Platform</h1>
      <p className="mt-1 text-sm text-[#4A4757]">System settings, feature switches and the release queue. New features stay switched off until a maintenance notice has been out for {data?.noticeLeadDays ?? 7} days.</p>
      <div className="mt-5 flex gap-6 border-b border-[#E6E5EC]" role="tablist">
        {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`-mb-px border-b-2 pb-2 text-sm font-medium ${tab === t ? 'border-[#301D5D] text-[#301D5D]' : 'border-transparent text-[#4A4757]'}`}>{t}</button>)}
      </div>
      {msg && <p className="mt-3 text-sm text-[#4A4757]" role="status">{msg}</p>}
      {!data ? <p className="mt-6 text-sm text-[#4A4757]">Loading…</p> : (
        <div className="mt-5 space-y-5">
          {tab === 'Releases' && (<>
            <div className="rounded border border-[#E6E5EC] bg-white p-4">
              <p className="text-[15px] font-semibold text-[#1B1726]">New Release</p>
              <p className="mt-1 text-sm text-[#4A4757]">Audience: {data.audience.total} active deal users ({data.audience.withPhone} with text alerts on). Emails go to all of them. Texts go only to people who agreed to texts{data.smsOn ? '.' : ', and text notices are currently switched off.'}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm">Title<input className={inp} value={rel.title} onChange={(e) => setRel({ ...rel, title: e.target.value })} /></label>
                <label className="text-sm">Go-Live (Central)<input type="datetime-local" min={minGoLive} className={inp} value={rel.goLiveAt} onChange={(e) => setRel({ ...rel, goLiveAt: e.target.value })} /></label>
                <label className="text-sm sm:col-span-2">Short Summary (used in the text)<input className={inp} value={rel.summary} onChange={(e) => setRel({ ...rel, summary: e.target.value })} /></label>
                <label className="text-sm sm:col-span-2">Notice Subject<input className={inp} value={rel.noticeSubject} onChange={(e) => setRel({ ...rel, noticeSubject: e.target.value })} /></label>
                <label className="text-sm sm:col-span-2">Notice Message<textarea rows={4} className={inp} value={rel.noticeBody} onChange={(e) => setRel({ ...rel, noticeBody: e.target.value })} /></label>
                <fieldset className="sm:col-span-2"><legend className="text-sm">Feature Switches In This Release</legend>
                  <div className="mt-1 flex flex-wrap gap-3">{data.flags.filter((f) => !f.enabled).map((f) => (
                    <label key={f.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rel.flagKeys.includes(f.key)} onChange={(e) => setRel({ ...rel, flagKeys: e.target.checked ? [...rel.flagKeys, f.key] : rel.flagKeys.filter((k) => k !== f.key) })} />{f.label}</label>))}
                    {data.flags.filter((f) => !f.enabled).length === 0 && <span className="text-sm text-[#4A4757]">Create a feature switch first.</span>}
                  </div></fieldset>
              </div>
              <button className={`${btn} mt-3`} disabled={busy || !rel.title} onClick={async () => { const j = await act({ action: 'saveRelease', ...rel, goLiveAt: rel.goLiveAt ? new Date(rel.goLiveAt).toISOString() : null }, 'Release saved as a draft.'); if (j) setRel({ title: '', summary: '', flagKeys: [], noticeSubject: '', noticeBody: '', goLiveAt: '' }); }}>Save Draft</button>
            </div>
            {data.releases.map((r) => (
              <div key={r.id} className="rounded border border-[#E6E5EC] bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[15px] font-semibold text-[#1B1726]">{r.title}</p>
                  <span className="text-sm font-medium text-[#301D5D]">{STATUS[r.status] ?? r.status}</span>
                </div>
                <p className="mt-1 text-sm text-[#4A4757]">Go-live {fmt(r.go_live_at)} · Notice sent {fmt(r.notice_sent_at)} · Switches: {r.flag_keys.join(', ') || 'none'}</p>
                {r.notice_result && <p className="mt-1 text-sm text-[#4A4757]">Sent to {String(r.notice_result.recipients)} users: {String(r.notice_result.emailed)} emailed, {String(r.notice_result.texted)} texted. {String(r.notice_result.textNote || '')}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.status === 'draft' && <button className={btn} disabled={busy} onClick={() => { if (window.confirm(`Send the maintenance notice for "${r.title}" now to ${data.audience.total} active deal users by email${data.smsOn ? ' and text' : ''}? This cannot be undone.`)) void act({ action: 'sendNotice', id: r.id, confirm: true }, 'Notice sent.'); }}>Send Notice</button>}
                  {r.status === 'notified' && <button className={btn} disabled={busy} onClick={() => act({ action: 'publish', id: r.id }, 'Release is live.')}>Go Live</button>}
                  {(r.status === 'draft' || r.status === 'notified') && <button className={btn} disabled={busy} onClick={() => act({ action: 'cancel', id: r.id }, 'Release cancelled.')}>Cancel Release</button>}
                </div>
              </div>))}
          </>)}
          {tab === 'Feature Switches' && (<>
            <div className="rounded border border-[#E6E5EC] bg-white p-4">
              <p className="text-[15px] font-semibold text-[#1B1726]">New Feature Switch</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="text-sm">Key (lowercase)<input className={inp} value={flag.key} onChange={(e) => setFlag({ ...flag, key: e.target.value })} placeholder="smart-automations-v2" /></label>
                <label className="text-sm">Label<input className={inp} value={flag.label} onChange={(e) => setFlag({ ...flag, label: e.target.value })} /></label>
                <label className="text-sm">Description<input className={inp} value={flag.description} onChange={(e) => setFlag({ ...flag, description: e.target.value })} /></label>
              </div>
              <button className={`${btn} mt-3`} disabled={busy || !flag.key || !flag.label} onClick={async () => { if (await act({ action: 'createFlag', ...flag }, 'Switch created (off).')) setFlag({ key: '', label: '', description: '' }); }}>Create Switch</button>
            </div>
            <div className="rounded border border-[#E6E5EC] bg-white">
              {data.flags.length === 0 ? <p className="p-4 text-sm text-[#4A4757]">No switches yet.</p> : data.flags.map((f) => (
                <div key={f.key} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E6E5EC] px-4 py-3 last:border-0">
                  <div><p className="text-sm font-medium text-[#1B1726]">{f.label} <span className="text-[#6B6878]">({f.key})</span></p><p className="text-sm text-[#4A4757]">{f.description}</p></div>
                  <div className="flex items-center gap-3"><span className="text-sm font-medium text-[#1B1726]">{f.enabled ? 'On' : 'Off'}</span>
                    {f.enabled && <button className={btn} disabled={busy} onClick={() => { if (window.confirm(`Switch off "${f.label}" for everyone now?`)) void act({ action: 'disableFlag', key: f.key }, 'Switched off.'); }}>Switch Off</button>}</div>
                </div>))}
            </div>
            <p className="text-sm text-[#4A4757]">A switch can only turn on through a release, after its notice has been out for {data.noticeLeadDays} days. Switching off is immediate.</p>
          </>)}
          {tab === 'System Settings' && (<>
            <div className="rounded border border-[#E6E5EC] bg-white p-4">
              <p className="text-[15px] font-semibold text-[#1B1726]">Add Or Change A Setting</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="text-sm">Key<input className={inp} value={set.key} onChange={(e) => setSet({ ...set, key: e.target.value })} placeholder="notice.sms_enabled" /></label>
                <label className="text-sm">Value (JSON)<input className={inp} value={set.valueJson} onChange={(e) => setSet({ ...set, valueJson: e.target.value })} placeholder="true" /></label>
                <label className="text-sm">Description<input className={inp} value={set.description} onChange={(e) => setSet({ ...set, description: e.target.value })} /></label>
              </div>
              <button className={`${btn} mt-3`} disabled={busy || !set.key || !set.valueJson} onClick={async () => { if (await act({ action: 'saveSetting', ...set }, 'Setting saved.')) setSet({ key: '', valueJson: '', description: '' }); }}>Save Setting</button>
              <p className="mt-2 text-sm text-[#4A4757]">Text notices stay off until you set notice.sms_enabled to true (after Telnyx carrier approval).</p>
            </div>
            <div className="rounded border border-[#E6E5EC] bg-white">
              {data.settings.length === 0 ? <p className="p-4 text-sm text-[#4A4757]">No settings saved yet. The app uses its built-in defaults until you add one.</p> : data.settings.map((s) => (
                <div key={s.key} className="border-b border-[#E6E5EC] px-4 py-3 last:border-0"><p className="text-sm font-medium text-[#1B1726]">{s.key}: <code>{JSON.stringify(s.value)}</code></p><p className="text-sm text-[#4A4757]">{s.description} · {s.updated_by ?? ''} · {fmt(s.updated_at)}</p></div>))}
            </div>
          </>)}
          {tab === 'Change Log' && (
            <div className="rounded border border-[#E6E5EC] bg-white">
              {[...data.log.map((l) => ({ id: `l${l.id}`, at: l.created_at, text: `${l.actor}: ${l.action} ${JSON.stringify(l.detail)}` })), ...data.history.map((h) => ({ id: `h${h.id}`, at: h.changed_at, text: `${h.changed_by}: setting ${h.key} ${JSON.stringify(h.old_value)} to ${JSON.stringify(h.new_value)}` }))].sort((a, b) => b.at.localeCompare(a.at)).map((e) => (
                <p key={e.id} className="border-b border-[#E6E5EC] px-4 py-2 text-sm text-[#1B1726] last:border-0"><span className="text-[#4A4757]">{fmt(e.at)}</span> · {e.text}</p>))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
