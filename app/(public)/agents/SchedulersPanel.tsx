'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarCheck, Check, ChevronDown, ChevronRight, Copy, ExternalLink, Image as ImageIcon, Info, Link2, Pencil, Plus, Trash2, UserRound, Users, X } from 'lucide-react';
import type { AgentDeal } from '@/lib/agent-command-center-workspace';
import {
  BUFFERS, DAYS, GOOGLE_COLORS, INCREMENTS, NOTICES, TIMEZONES, WINDOWS, aliasify, defaultConfig, minutesLabel, timeLabel, tzLabel, windowLabel,
  type DayKey, type SchedulerConfig,
} from '@/lib/scheduler-shared';

type Sched = { id: string; alias: string; active: boolean; config: SchedulerConfig; hasBanner: boolean; hasAvatar: boolean; upcoming: number };
type Booking = { id: string; schedulerId: string; schedulerName: string; start: string; end: string; name: string; email: string; answers: { label: string; value: string }[]; status: string; meetingUrl: string; timezone: string; timeFormat: '12h' | '24h'; past: boolean };
type Combo = { id: string; alias: string; title: string; schedulerIds: string[] };
type Data = { slug: string; schedulers: Sched[]; combos: Combo[]; bookings: Booking[]; account: { provider: string; name: string } | null; calendars: { id: string; name: string; primary?: boolean }[]; accountEmail: string; agentName: string };

const card = 'rounded-2xl border border-[#E6E5EC] bg-white';
const field = 'w-full rounded-lg border border-[#E6E5EC] bg-white px-3 py-2 text-[14px] text-[#1B1726] focus:border-[#301D5D] focus:outline-none disabled:bg-[#F7F6FA] disabled:text-[#9A98A6]';
const label = 'block text-[14px] font-semibold text-[#1B1726]';
const hint = 'mt-0.5 text-[13px] text-[#7A7787]';
const pill = 'inline-flex items-center gap-1.5 rounded-full border border-[#E6E5EC] bg-white px-3.5 py-1.5 text-[13px] font-medium text-[#1B1726] transition hover:border-[#301D5D]';
const primary = 'inline-flex items-center gap-1.5 rounded-full bg-[#301D5D] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#42277C] disabled:opacity-45';
const STEPS = ['Select Calendars', 'Availability', 'Event Details', 'Appearance And Branding', 'Workflow'];
const OPTIONAL = new Set([4]);
const TIMES = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);
const qid = () => Math.random().toString(36).slice(2, 10);

/** Booking schedulers for one deal, laid out like a scheduler dashboard: accounts, custom URL, schedulers and a 6-step builder. */
export default function SchedulersPanel({ deal, onOpenIntegrations }: { deal: AgentDeal; onOpenIntegrations?: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState<{ id: string | null; config: SchedulerConfig; hasBanner: boolean; hasAvatar: boolean } | null>(null);
  const [editSlug, setEditSlug] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [combo, setCombo] = useState<{ id?: string; title: string; alias: string; ids: string[] } | null>(null);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    let live = true;
    fetch(`/api/closing-time/schedulers?dealId=${encodeURIComponent(deal.id)}`, { cache: 'no-store' })
      .then(async (r) => { const b = await r.json(); if (!live) return; if (!r.ok) setError(b.error ?? 'Not available yet. Wait for the deal to finish saving.'); else { setData(b); setError(''); } })
      .catch(() => { if (live) setError('Could not load schedulers.'); });
    return () => { live = false; };
  }, [deal.id, tick]);

  const post = async (payload: Record<string, unknown>, ok?: string): Promise<Record<string, unknown> | null> => {
    setError(''); setMsg('');
    const r = await fetch('/api/closing-time/schedulers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
    const b = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) { setError((b as { error?: string }).error ?? 'Something went wrong.'); return null; }
    if (ok) setMsg(ok);
    setTick((t) => t + 1);
    return b as Record<string, unknown>;
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://realtynewsnow.app';
  const host = origin.replace(/^https?:\/\//, '');
  const slug = data?.slug ?? '';
  const urlOf = (alias: string) => `${origin}/book/${slug}${alias ? `/${alias}` : ''}`;
  const copy = (v: string) => { void navigator.clipboard.writeText(v); setCopied(v); setTimeout(() => setCopied(''), 1500); };
  const live = Boolean(data?.schedulers.some((s) => s.active));
  const startNew = () => {
    const c = defaultConfig(data?.agentName ?? '');
    c.bookingCalendar = data?.calendars.find((x) => x.primary)?.id ?? 'closing_time';
    c.bookingCalendarName = data?.calendars.find((x) => x.primary)?.name ?? 'Closing Time Calendar';
    if (data?.schedulers.length) c.alias = '';
    setEditing({ id: null, config: c, hasBanner: false, hasAvatar: false });
  };

  if (editing && data) {
    return <Builder key={editing.id ?? 'new'} data={data} dealId={deal.id} host={host} initial={editing} property={deal.propertyAddress ?? ''} parties={dealParties(deal)}
      onClose={(saved) => { setEditing(null); if (saved) { setMsg(saved); setTick((t) => t + 1); } }} />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[22px] font-semibold text-[#1B1726]">Schedulers</h2>
        <p className="mt-1 text-[14px] text-[#4A4757]">Booking pages for this deal. People pick an open time and it lands on your calendar.</p>
      </div>
      {msg && <p role="status" className="text-[13px] font-medium text-[#005A00]">{msg}</p>}
      {error && <p role="alert" className="text-[13px] font-medium text-[#661102]">{error}</p>}
      {!data && !error && <p className="text-[12px] font-medium text-[#7A7787]">Loading</p>}

      {data && (
        <>
          <section className={`${card} p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-semibold text-[#1B1726]">Connected Accounts</h3>
                <span className="rounded-md bg-[#EFEAF8] px-1.5 text-[12px] font-semibold text-[#301D5D]">{data.account ? 1 : 0}</span>
              </div>
              <div className="flex items-center gap-4 text-[13px] font-medium">
                <button type="button" className="inline-flex items-center gap-1 text-[#301D5D] hover:underline" onClick={onOpenIntegrations}><Plus className="h-3.5 w-3.5" aria-hidden="true" />Add account</button>
                <button type="button" className="inline-flex items-center gap-1 text-[#7A7787] hover:text-[#1B1726]" onClick={onOpenIntegrations}>Manage in Integrations <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {data.account && (
                <span className="inline-flex items-center gap-2 rounded-full border border-[#E6E5EC] px-3 py-1.5 text-[13px] font-medium text-[#1B1726]">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#F6F3FB] text-[11px] font-bold text-[#301D5D]" aria-hidden="true">{data.account.provider === 'outlook' ? 'O' : 'G'}</span>
                  {data.accountEmail} · {data.account.name}
                </span>
              )}
              <button type="button" onClick={onOpenIntegrations} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[#CFCDD8] px-3 py-1.5 text-[13px] font-medium text-[#4A4757] hover:border-[#301D5D]">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />{data.account ? 'Add another account' : 'Connect Google or Outlook Calendar'}
              </button>
            </div>
            {!data.account && <p className="mt-2 text-[12px] text-[#7A7787]">Without a connected calendar, bookings use your Closing Time calendar and arrive by email with a calendar file.</p>}
          </section>

          <section className={card}>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#F1F0F5] p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EFEAF8] text-[#301D5D]"><Link2 className="h-5 w-5" aria-hidden="true" /></span>
                <div>
                  <h3 className="text-[15px] font-semibold text-[#1B1726]">Your custom scheduler URL</h3>
                  <p className="text-[13px] text-[#7A7787]">All schedulers share this slug. New schedulers can use it directly or add an alias.</p>
                </div>
              </div>
              {editSlug === null && <button type="button" className={pill} onClick={() => setEditSlug(slug)}><Pencil className="h-3.5 w-3.5" aria-hidden="true" />Edit</button>}
            </div>
            <div className="space-y-3 p-5">
              {editSlug !== null ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] text-[#7A7787]">{host}/book/</span>
                  <input value={editSlug} onChange={(e) => setEditSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))} className={`${field} w-auto min-w-[220px] flex-1`} aria-label="Custom URL" />
                  <button type="button" className={primary} onClick={async () => { if (await post({ action: 'slug', dealId: deal.id, slug: editSlug }, 'URL saved.')) setEditSlug(null); }}>Save</button>
                  <button type="button" className={pill} onClick={() => setEditSlug(null)}>Cancel</button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-[#CFCDD8] bg-[#FBFAFD] px-4 py-3">
                  <span className="min-w-0 truncate text-[14px] text-[#4A4757]">{urlOf('')}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {live && <button type="button" aria-label="Copy URL" className="text-[#7A7787] hover:text-[#301D5D]" onClick={() => copy(urlOf(''))}>{copied === urlOf('') ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button>}
                    <span className={`rounded-md px-2 py-0.5 text-[12px] font-semibold ${live ? 'bg-[#E0FBE0] text-[#005A00]' : 'bg-[#FEF8CC] text-[#645600]'}`}>{live ? 'Live' : 'Not live'}</span>
                  </span>
                </div>
              )}
              {!live && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#F2E7A6] bg-[#FFFBEA] px-4 py-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#645600]" aria-hidden="true" />
                    <div>
                      <div className="text-[14px] font-semibold text-[#645600]">This link isn&apos;t live yet</div>
                      <p className="text-[13px] text-[#645600]">{data.schedulers.length ? 'All schedulers are turned off, so this URL does not lead to a booking page. Turn one on to start taking bookings.' : "You don't have any schedulers, so this URL doesn't lead to a booking page. Create one to start taking bookings."}</p>
                    </div>
                  </div>
                  {!data.schedulers.length && <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-[#D9C96B] bg-white px-3.5 py-1.5 text-[13px] font-medium text-[#645600] hover:bg-[#FEF8CC]" onClick={startNew}><Plus className="h-3.5 w-3.5" aria-hidden="true" />Create scheduler</button>}
                </div>
              )}
            </div>
          </section>

          <section className={card}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F1F0F5] px-5 py-4">
              <h3 className="text-[16px] font-semibold text-[#1B1726]">Schedulers</h3>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={pill} aria-expanded={help} onClick={() => setHelp((h) => !h)}>Help</button>
                <button type="button" className={pill} disabled={data.schedulers.length < 2} title={data.schedulers.length < 2 ? 'Create at least two schedulers first' : undefined} onClick={() => setCombo({ title: '', alias: '', ids: data.schedulers.map((s) => s.id) })}><Users className="h-3.5 w-3.5" aria-hidden="true" />Build a combined link</button>
                <button type="button" className={primary} onClick={startNew}><Plus className="h-3.5 w-3.5" aria-hidden="true" />New Scheduler</button>
              </div>
            </div>
            {help && (
              <div className="border-b border-[#F1F0F5] bg-[#FBFAFD] px-5 py-4 text-[13px] text-[#4A4757]">
                <p><strong className="text-[#1B1726]">Schedulers</strong> are booking pages. Set your hours and meeting lengths; people pick an open time and get a confirmation with a calendar file.</p>
                <p className="mt-1.5">Open times skip your other bookings and anything busy on the calendars you select. One scheduler can use the root URL; the rest get an alias such as <code>/book/{slug}/inspection</code>.</p>
                <p className="mt-1.5">A <strong className="text-[#1B1726]">combined link</strong> shows several schedulers on one page so people choose the meeting type first.</p>
              </div>
            )}
            {combo && (
              <div className="space-y-3 border-b border-[#F1F0F5] px-5 py-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block"><span className={label}>Page title</span><input className={`${field} mt-1`} value={combo.title} onChange={(e) => setCombo({ ...combo, title: e.target.value, alias: combo.id ? combo.alias : aliasify(e.target.value) })} placeholder="Book a time with me" /></label>
                  <label className="block"><span className={label}>Alias</span><div className="mt-1 flex items-center gap-1"><span className="text-[13px] text-[#7A7787]">/book/{slug}/</span><input className={field} value={combo.alias} onChange={(e) => setCombo({ ...combo, alias: aliasify(e.target.value) })} /></div></label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {data.schedulers.map((s) => (
                    <label key={s.id} className={`${pill} cursor-pointer ${combo.ids.includes(s.id) ? 'border-[#301D5D] bg-[#F6F3FB] text-[#301D5D]' : ''}`}>
                      <input type="checkbox" className="sr-only" checked={combo.ids.includes(s.id)} onChange={(e) => setCombo({ ...combo, ids: e.target.checked ? [...combo.ids, s.id] : combo.ids.filter((x) => x !== s.id) })} />
                      {combo.ids.includes(s.id) && <Check className="h-3.5 w-3.5" aria-hidden="true" />}{s.config.name}
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button type="button" className={primary} disabled={!combo.title.trim() || !combo.alias || combo.ids.length < 2} onClick={async () => { if (await post({ action: 'combo', dealId: deal.id, id: combo.id, title: combo.title, alias: combo.alias, schedulerIds: combo.ids }, 'Combined link saved.')) setCombo(null); }}>Save Combined Link</button>
                  <button type="button" className={pill} onClick={() => setCombo(null)}>Cancel</button>
                </div>
              </div>
            )}

            {data.schedulers.length === 0 ? (
              <div className="flex flex-col items-center px-5 py-12 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#E1D9F2] bg-[#F3EEFB] text-[#301D5D]"><CalendarCheck className="h-7 w-7" aria-hidden="true" /></span>
                <h4 className="mt-4 text-[22px] font-semibold text-[#1B1726]">No schedulers yet</h4>
                <p className="mt-2 max-w-[440px] text-[15px] text-[#7A7787]">Create a scheduler — set your availability, meeting length, and let people book time with you automatically.</p>
                <button type="button" className={`${primary} mt-5 px-6 py-2.5 text-[14px]`} onClick={startNew}><Plus className="h-4 w-4" aria-hidden="true" />Create your first scheduler</button>
              </div>
            ) : (
              <ul>
                {data.schedulers.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F1F0F5] px-5 py-4 last:border-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-semibold text-[#1B1726]">{s.config.name}</span>
                        <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${s.active ? 'bg-[#E0FBE0] text-[#005A00]' : 'bg-[#F1F0F5] text-[#7A7787]'}`}>{s.active ? 'On' : 'Off'}</span>
                      </div>
                      <div className="text-[13px] text-[#7A7787]">{s.config.lengths.map((l) => `${l} min`).join(' / ')} · {s.config.bookingCalendarName || 'Closing Time Calendar'} · {s.upcoming} upcoming</div>
                      <div className="mt-0.5 truncate text-[13px] text-[#4A4757]">{urlOf(s.alias)}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" className={pill} onClick={() => copy(urlOf(s.alias))}>{copied === urlOf(s.alias) ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied === urlOf(s.alias) ? 'Copied' : 'Copy Link'}</button>
                      <a className={pill} href={urlOf(s.alias)} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />Open</a>
                      <button type="button" className={pill} onClick={() => setEditing({ id: s.id, config: s.config, hasBanner: s.hasBanner, hasAvatar: s.hasAvatar })}><Pencil className="h-3.5 w-3.5" aria-hidden="true" />Edit</button>
                      <button type="button" role="switch" aria-checked={s.active} aria-label={`${s.config.name} on or off`} onClick={() => void post({ action: 'active', id: s.id, active: !s.active })}
                        className={`relative h-6 w-11 rounded-full transition ${s.active ? 'bg-[#301D5D]' : 'bg-[#D9D7E0]'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${s.active ? 'left-[22px]' : 'left-0.5'}`} /></button>
                      <button type="button" aria-label={`Delete ${s.config.name}`} className="p-1 text-[#7A7787] hover:text-[#661102]" onClick={() => { if (window.confirm(`Delete ${s.config.name}? Its booking page stops working and its bookings are removed.`)) void post({ action: 'delete', id: s.id }, 'Scheduler deleted.'); }}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {data.combos.length > 0 && (
              <div className="border-t border-[#E6E5EC] px-5 py-4">
                <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#7A7787]">Combined Links</div>
                <ul className="mt-2 space-y-2">
                  {data.combos.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0"><div className="text-[14px] font-medium text-[#1B1726]">{c.title}</div><div className="truncate text-[12px] text-[#7A7787]">{urlOf(c.alias)} · {c.schedulerIds.length} schedulers</div></div>
                      <div className="flex gap-2">
                        <button type="button" className={pill} onClick={() => copy(urlOf(c.alias))}>{copied === urlOf(c.alias) ? 'Copied' : 'Copy Link'}</button>
                        <button type="button" className={pill} onClick={() => setCombo({ id: c.id, title: c.title, alias: c.alias, ids: c.schedulerIds })}>Edit</button>
                        <button type="button" aria-label={`Delete ${c.title}`} className="p-1 text-[#7A7787] hover:text-[#661102]" onClick={() => { if (window.confirm(`Delete the ${c.title} combined link?`)) void post({ action: 'delete_combo', id: c.id }); }}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {data.bookings.length > 0 && (
            <section className={card}>
              <h3 className="border-b border-[#F1F0F5] px-5 py-4 text-[16px] font-semibold text-[#1B1726]">Bookings</h3>
              <ul>
                {data.bookings.map((b) => {
                  const past = b.past;
                  const when = new Date(b.start).toLocaleString('en-US', { timeZone: b.timezone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: b.timeFormat === '12h' });
                  return (
                    <li key={b.id} className={`flex flex-wrap items-start justify-between gap-3 border-b border-[#F1F0F5] px-5 py-3 last:border-0 ${b.status !== 'booked' || past ? 'opacity-60' : ''}`}>
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold text-[#1B1726]">{b.name} · {b.schedulerName}</div>
                        <div className="text-[13px] text-[#4A4757]">{when} ({b.timezone}){b.status !== 'booked' ? ' · Cancelled' : past ? ' · Done' : ''}</div>
                        <div className="text-[12px] text-[#7A7787]">{b.email}{b.meetingUrl ? ` · ${b.meetingUrl}` : ''}</div>
                        {b.answers.map((a) => <div key={a.label} className="text-[12px] text-[#4A4757]"><strong>{a.label}:</strong> {a.value}</div>)}
                      </div>
                      {b.status === 'booked' && !past && <button type="button" className={pill} onClick={() => { if (window.confirm(`Cancel ${b.name}'s booking? They will be emailed.`)) void post({ action: 'cancel_booking', id: b.id }, 'Booking cancelled.'); }}>Cancel</button>}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- 6-step builder with the live summary on the right ---------- */

type Party = { email: string; name: string; role: string };

/** Everyone on the deal with an email: clients/contacts first, then service providers. */
function dealParties(deal: AgentDeal): Party[] {
  const out: Party[] = []; const seen = new Set<string>();
  const add = (email: string | undefined, name: string, role: string) => {
    const e = (email ?? '').trim(); const k = e.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || seen.has(k)) return; seen.add(k); out.push({ email: e, name: name.trim() || e, role: role.trim() });
  };
  for (const c of deal.clientContacts ?? []) add(c.email, c.name, c.role ?? 'Client');
  for (const p of deal.serviceProviders ?? []) add(p.email, p.name, p.category);
  return out;
}

const splitEmails = (v: string) => v.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);

function Builder({ data, dealId, host, initial, property, parties, onClose }: {
  data: Data; dealId: string; host: string; property: string; parties: Party[];
  initial: { id: string | null; config: SchedulerConfig; hasBanner: boolean; hasAvatar: boolean };
  onClose: (savedMessage?: string) => void;
}) {
  const [c, setC] = useState<SchedulerConfig>(initial.config);
  const [step, setStep] = useState(0);
  const [customLen, setCustomLen] = useState('');
  const [calOpen, setCalOpen] = useState(false);
  const [banner, setBanner] = useState<File | null | undefined>(undefined);
  const [avatar, setAvatar] = useState<File | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof SchedulerConfig>(k: K, v: SchedulerConfig[K]) => setC((x) => ({ ...x, [k]: v }));
  const setDay = (d: DayKey, patch: Partial<SchedulerConfig['hours'][DayKey]>) => setC((x) => ({ ...x, hours: { ...x.hours, [d]: { ...x.hours[d], ...patch } } }));
  const google = data.account?.provider === 'google_calendar';
  const outlook = data.account?.provider === 'outlook';
  const rootTaken = data.schedulers.some((s) => s.alias === '' && s.id !== initial.id);
  const aliasPlaceholder = `/book/${data.slug}/`;
  const urlPreview = `${host}/book/${data.slug}${c.urlMode === 'alias' && c.alias ? `/${c.alias}` : c.urlMode === 'alias' ? '/…' : ''}`;

  const stepError = (i: number): string => {
    if (i === 0) {
      if (!c.bookingCalendar) return 'Select a booking calendar.';
      if (!c.name.trim()) return 'Name your scheduler.';
      if (c.urlMode === 'alias' && !c.alias) return 'Pick an alias for this scheduler.';
      if (c.urlMode === 'root' && rootTaken) return 'Another scheduler already uses the root URL.';
    }
    if (i === 1) {
      if (!c.lengths.length) return 'Add at least one meeting length.';
      if (!DAYS.some((d) => c.hours[d.key].on)) return 'Turn on at least one day.';
      const bad = DAYS.find((d) => c.hours[d.key].on && c.hours[d.key].start >= c.hours[d.key].end);
      if (bad) return `${bad.long}: end time must be after start time.`;
    }
    if (i === 2 && c.meeting === 'custom' && !/^https:\/\//.test(c.meetingLink)) return 'Add a meeting link that starts with https://';
    if (i === 3 && c.redirectUrl && !/^https:\/\//.test(c.redirectUrl)) return 'The redirect URL must start with https://';
    return '';
  };
  const next = () => { const e = stepError(step); setError(e); if (!e) setStep((s) => Math.min(5, s + 1)); };

  const save = async () => {
    for (let i = 0; i < 6; i += 1) { const e = stepError(i); if (e) { setError(e); setStep(i); return; } }
    setBusy(true); setError('');
    const payload = { ...c, hasBanner: banner === undefined ? initial.hasBanner : Boolean(banner), hasAvatar: avatar === undefined ? initial.hasAvatar : Boolean(avatar) };
    const r = await fetch('/api/closing-time/schedulers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'save', dealId, id: initial.id, config: payload }) }).catch(() => null);
    const b = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) { setError(b.error ?? 'Could not save the scheduler.'); setBusy(false); return; }
    for (const [kind, file] of [['banner', banner], ['avatar', avatar]] as const) {
      if (file === undefined) continue;
      const fd = new FormData(); fd.set('id', b.id); fd.set('kind', kind); if (file) fd.set('file', file);
      const up = await fetch('/api/closing-time/schedulers/image', { method: 'POST', body: fd }).catch(() => null);
      if (!up?.ok) { setError(`Saved, but the ${kind} image did not upload. ${(await up?.json().catch(() => ({})))?.error ?? ''}`); setBusy(false); return; }
    }
    setBusy(false);
    onClose(initial.id ? 'Scheduler saved.' : 'Scheduler created. Your booking link is live.');
  };

  const onDays = DAYS.filter((d) => c.hours[d.key].on);
  const calOptions = [{ id: 'closing_time', name: 'Closing Time Calendar (email + calendar file)' }, ...data.calendars];

  const body: ReactNode[] = [
    // 1. Select Calendars
    <div key="s1" className="space-y-5">
      <div>
        <span className={label}>Select Booking Calendar</span>
        <p className={hint}>Select the calendar you would like to use for scheduling.</p>
        <select className={`${field} mt-2`} value={c.bookingCalendar} onChange={(e) => { const o = calOptions.find((x) => x.id === e.target.value); setC((x) => ({ ...x, bookingCalendar: e.target.value, bookingCalendarName: o?.name.replace(' (email + calendar file)', '') ?? '', additionalCalendars: x.additionalCalendars.filter((a) => a.id !== e.target.value) })); }}>
          <option value="">Select a calendar</option>
          {calOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        {!data.account && <p className="mt-1.5 text-[12px] text-[#7A7787]">Connect Google Calendar or Outlook in Integrations to book straight onto your calendar and check it for busy times.</p>}
      </div>
      <div>
        <span className={label}>Additional Calendars</span>
        <p className={hint}>Check availability on up to 6 other calendars, optional.</p>
        <div className="relative mt-2">
          <button type="button" disabled={!data.calendars.length} onClick={() => setCalOpen((o) => !o)} className={`${field} flex items-center justify-between text-left`} aria-expanded={calOpen}>
            <span className={c.additionalCalendars.length ? 'text-[#1B1726]' : 'text-[#9A98A6]'}>{c.additionalCalendars.length ? c.additionalCalendars.map((a) => a.name).join(', ') : data.calendars.length ? 'Select Calendar' : 'No connected calendars'}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-[#7A7787]" aria-hidden="true" />
          </button>
          {calOpen && (
            <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-[#E6E5EC] bg-white py-1 shadow-lg">
              {data.calendars.filter((x) => x.id !== c.bookingCalendar).map((x) => {
                const on = c.additionalCalendars.some((a) => a.id === x.id);
                return (
                  <li key={x.id}><label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[14px] text-[#1B1726] hover:bg-[#F6F3FB]">
                    <input type="checkbox" checked={on} disabled={!on && c.additionalCalendars.length >= 6} onChange={(e) => set('additionalCalendars', e.target.checked ? [...c.additionalCalendars, { id: x.id, name: x.name }] : c.additionalCalendars.filter((a) => a.id !== x.id))} />{x.name}
                  </label></li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      <div>
        <span className={label}>Scheduler Name</span>
        <p className={hint}>How your scheduler appears in your list, and the title on the booking page.</p>
        <input className={`${field} mt-2`} value={c.name} maxLength={120} placeholder="My scheduler" onChange={(e) => setC((x) => ({ ...x, name: e.target.value, alias: initial.id || x.alias !== aliasify(x.name) ? x.alias : aliasify(e.target.value) }))} />
      </div>
      <div>
        <span className={label}>Your Name</span>
        <p className={hint}>The name shown to people on your booking page. Leave blank to not display a name.</p>
        <input className={`${field} mt-2`} value={c.yourName} maxLength={120} onChange={(e) => set('yourName', e.target.value)} />
      </div>
      <div>
        <span className={label}>Scheduler URL</span>
        <p className={hint}>Pick where this scheduler lives under your custom URL.</p>
        <div className="mt-2 space-y-2">
          <label className={`block cursor-pointer rounded-xl border p-4 ${c.urlMode === 'alias' ? 'border-[#301D5D] bg-[#F6F3FB]' : 'border-[#E6E5EC]'}`}>
            <span className="flex items-center gap-2.5"><input type="radio" name="urlmode" checked={c.urlMode === 'alias'} onChange={() => set('urlMode', 'alias')} className="accent-[#301D5D]" /><span className="text-[14px] font-semibold text-[#1B1726]">Custom alias</span></span>
            <span className="ml-6 block text-[13px] text-[#7A7787]">Choose a memorable name under your URL.</span>
            {c.urlMode === 'alias' && (
              <span className="ml-6 mt-2 block">
                <span className="flex items-center rounded-lg border border-[#E6E5EC] bg-white px-3 font-mono text-[13px]">
                  <span className="text-[#7A7787]">{aliasPlaceholder}</span>
                  <input className="min-w-0 flex-1 py-2 font-mono text-[13px] text-[#1B1726] focus:outline-none" value={c.alias} onChange={(e) => set('alias', aliasify(e.target.value))} aria-label="Alias" />
                </span>
                {!c.alias && <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[12px] text-[#7A7787]"><Info className="h-3.5 w-3.5" aria-hidden="true" />Pick an alias for this scheduler.</span>}
              </span>
            )}
          </label>
          <label className={`block rounded-xl border p-4 ${rootTaken ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${c.urlMode === 'root' ? 'border-[#301D5D] bg-[#F6F3FB]' : 'border-[#E6E5EC]'}`}>
            <span className="flex items-center gap-2.5"><input type="radio" name="urlmode" disabled={rootTaken} checked={c.urlMode === 'root'} onChange={() => set('urlMode', 'root')} className="accent-[#301D5D]" /><span className="text-[14px] font-semibold text-[#1B1726]">Use root URL</span></span>
            <span className="ml-6 block text-[13px] text-[#7A7787]">{rootTaken ? 'Another scheduler already uses the root URL.' : 'Use your custom URL with no alias. You can only use the root for one scheduler.'}</span>
          </label>
        </div>
      </div>
    </div>,

    // 2. Availability
    <div key="s2" className="space-y-5">
      <div>
        <span className={label}>Meeting Length</span>
        <p className={hint}>Select how long meetings should be for this scheduler.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {Array.from(new Set([60, 30, 15, ...c.lengths])).sort((a, b) => b - a).map((l) => {
            const on = c.lengths.includes(l);
            return <button key={l} type="button" aria-pressed={on} onClick={() => setC((x) => { const lengths = on ? x.lengths.filter((y) => y !== l) : [...x.lengths, l].sort((a, b) => b - a); return { ...x, lengths, defaultLength: lengths.includes(x.defaultLength) ? x.defaultLength : lengths[0] ?? 60 }; })}
              className={`rounded-full border px-3 py-1 text-[13px] font-medium ${on ? 'border-[#301D5D] bg-[#F6F3FB] text-[#301D5D]' : 'border-[#E6E5EC] text-[#1B1726] hover:border-[#301D5D]'}`}>{l} Min</button>;
          })}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input type="number" min={5} max={480} step={5} value={customLen} onChange={(e) => setCustomLen(e.target.value)} placeholder="Add Custom Time" className={`${field} w-[160px]`} aria-label="Custom minutes" />
          <button type="button" className={pill} disabled={!(Number(customLen) >= 5 && Number(customLen) <= 480)} onClick={() => { const n = Math.round(Number(customLen)); setC((x) => ({ ...x, lengths: Array.from(new Set([...x.lengths, n])).sort((a, b) => b - a) })); setCustomLen(''); }}><Plus className="h-3.5 w-3.5" aria-hidden="true" />Add</button>
        </div>
      </div>
      <div>
        <span className={label}>Default time when scheduler page is first loaded</span>
        <select className={`${field} mt-2`} value={c.defaultLength} onChange={(e) => set('defaultLength', Number(e.target.value))}>{c.lengths.map((l) => <option key={l} value={l}>{l} Min</option>)}</select>
      </div>
      <div>
        <span className={label}>Weekly availability</span>
        <p className={hint}>Select the range of days and times you would like available</p>
        <div className="mt-2 space-y-2 rounded-xl border border-[#E6E5EC] p-3">
          {DAYS.map((d) => {
            const h = c.hours[d.key];
            return (
              <div key={d.key} className="flex items-center gap-2">
                <button type="button" role="switch" aria-checked={h.on} aria-label={d.long} onClick={() => setDay(d.key, { on: !h.on })} className={`relative h-5 w-9 shrink-0 rounded-full transition ${h.on ? 'bg-[#301D5D]' : 'bg-[#D9D7E0]'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${h.on ? 'left-[18px]' : 'left-0.5'}`} /></button>
                <span className={`w-10 text-[14px] font-medium ${h.on ? 'text-[#1B1726]' : 'text-[#9A98A6]'}`}>{d.label}</span>
                <select disabled={!h.on} aria-label={`${d.long} start`} className={`${field} flex-1`} value={h.start} onChange={(e) => setDay(d.key, { start: e.target.value })}>{TIMES.map((t) => <option key={t} value={t}>{timeLabel(t, c.timeFormat)}</option>)}</select>
                <select disabled={!h.on} aria-label={`${d.long} end`} className={`${field} flex-1`} value={h.end} onChange={(e) => setDay(d.key, { end: e.target.value })}>{[...TIMES.slice(1), '23:59'].map((t) => <option key={t} value={t}>{timeLabel(t, c.timeFormat)}</option>)}</select>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <span className={label}>Timezone</span>
        <select className={`${field} mt-2`} value={c.timezone} onChange={(e) => set('timezone', e.target.value)}>{TIMEZONES.map((z) => <option key={z} value={z}>{tzLabel(z)}</option>)}</select>
      </div>
      <div>
        <span className={label}>How far in advance can someone book with you?</span>
        <select className={`${field} mt-2`} value={c.windowDays} onChange={(e) => set('windowDays', Number(e.target.value))}>{WINDOWS.map((w) => <option key={w.days} value={w.days}>{w.label}</option>)}</select>
      </div>
      <div>
        <span className={label}>How much notice do you need before a meeting starts?</span>
        <select className={`${field} mt-2`} value={c.noticeMin} onChange={(e) => set('noticeMin', Number(e.target.value))}>{NOTICES.map((n) => <option key={n} value={n}>{minutesLabel(n)}</option>)}</select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className={label}>Buffer Before Event:</span><select className={`${field} mt-2`} value={c.bufferBeforeMin} onChange={(e) => set('bufferBeforeMin', Number(e.target.value))}>{BUFFERS.map((n) => <option key={n} value={n}>{minutesLabel(n)}</option>)}</select></label>
        <label className="block"><span className={label}>Buffer After Event:</span><select className={`${field} mt-2`} value={c.bufferAfterMin} onChange={(e) => set('bufferAfterMin', Number(e.target.value))}>{BUFFERS.map((n) => <option key={n} value={n}>{minutesLabel(n)}</option>)}</select></label>
      </div>
      <div>
        <span className={label}>Start time increments:</span>
        <select className={`${field} mt-2`} value={c.incrementMin} onChange={(e) => set('incrementMin', Number(e.target.value))}>{INCREMENTS.map((n) => <option key={n} value={n}>{n === 0 ? 'Default' : `Every ${n} minutes`}</option>)}</select>
      </div>
    </div>,

    // 3. Event Details
    <div key="s3" className="space-y-5">
      <div>
        <span className={label}>Event Subject</span>
        <p className={hint}>Use template variables: {['{invitee_name}', '{invitee_email}', '{my_name}', '{subject}'].map((v, i) => <span key={v}><code className="rounded bg-[#F1F0F5] px-1 text-[12px] text-[#1B1726]">{v}</code>{i < 3 ? ', ' : '.'}</span>)}</p>
        <input className={`${field} mt-2`} value={c.subject} maxLength={300} onChange={(e) => set('subject', e.target.value)} />
      </div>
      <div>
        <span className={label}>Event Description</span>
        <p className={hint}>Add details that will be included in the body of the calendar event.</p>
        <textarea rows={3} className={`${field} mt-2`} value={c.description} maxLength={4000} placeholder="Agenda, meeting link, notes..." onChange={(e) => set('description', e.target.value)} />
      </div>
      <div>
        <span className={label}>Booked Event Color</span>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" aria-label="Calendar default color" aria-pressed={!c.color} onClick={() => set('color', '')} className={`flex h-6 w-6 items-center justify-center rounded-full border ${!c.color ? 'border-[#1B1726]' : 'border-[#CFCDD8]'}`}>{!c.color && <Check className="h-3.5 w-3.5" />}</button>
          {google && GOOGLE_COLORS.map((g) => <button key={g.id} type="button" title={g.name} aria-label={g.name} aria-pressed={c.color === g.id} onClick={() => set('color', g.id)} className="flex h-6 w-6 items-center justify-center rounded-full text-white" style={{ background: g.hex }}>{c.color === g.id && <Check className="h-3.5 w-3.5" />}</button>)}
          {!google && <span className="text-[12px] text-[#7A7787]">Event colors are available with Google Calendar.</span>}
        </div>
      </div>
      <div>
        <span className={label}>Create online meeting:</span>
        <select className={`${field} mt-2`} value={c.meeting} onChange={(e) => set('meeting', e.target.value as SchedulerConfig['meeting'])}>
          <option value="none">None</option>
          {google && <option value="google_meet">Google Meet</option>}
          {outlook && <option value="teams">Microsoft Teams</option>}
          <option value="custom">Meeting link (Zoom, Webex, phone bridge)</option>
        </select>
        {c.meeting === 'custom' && <input className={`${field} mt-2`} value={c.meetingLink} placeholder="https://zoom.us/j/..." onChange={(e) => set('meetingLink', e.target.value)} />}
      </div>
      <div>
        <span className={label}>Additional attendees</span>
        <p className={hint}>Invite parties on this deal. They get the calendar invite and a copy of the confirmation email.</p>
        {(() => {
          const list = splitEmails(c.attendees); const lower = new Set(list.map((x) => x.toLowerCase()));
          const partyKeys = new Set(parties.map((p) => p.email.toLowerCase()));
          const extra = list.filter((x) => !partyKeys.has(x.toLowerCase()));
          const write = (picked: string[], others: string[]) => set('attendees', [...picked, ...others].join(', '));
          const picked = parties.filter((p) => lower.has(p.email.toLowerCase())).map((p) => p.email);
          const all = parties.length > 0 && picked.length === parties.length;
          return (
            <>
              {parties.length > 0 ? (
                <div className="mt-2 rounded-xl border border-[#E6E5EC]">
                  <div className="flex items-center justify-between border-b border-[#E6E5EC] px-3 py-2">
                    <span className="text-[13px] text-[#4A4757]">{picked.length} of {parties.length} deal parties selected</span>
                    <div className="flex gap-1">
                      <button type="button" className="rounded-full px-3 py-1 text-[13px] font-semibold text-[#301D5D] hover:bg-[#F1ECFA] disabled:opacity-45" disabled={all} onClick={() => write(parties.map((p) => p.email), extra)}>Add All Parties</button>
                      {picked.length > 0 && <button type="button" className="rounded-full px-3 py-1 text-[13px] font-medium text-[#7A7787] hover:bg-[#F7F6FA]" onClick={() => write([], extra)}>Clear</button>}
                    </div>
                  </div>
                  <ul className="max-h-[240px] divide-y divide-[#F0EFF4] overflow-y-auto">
                    {parties.map((p) => {
                      const on = lower.has(p.email.toLowerCase());
                      return (
                        <li key={p.email}>
                          <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-[#FAF9FC]">
                            <input type="checkbox" className="h-4 w-4 accent-[#301D5D]" checked={on} onChange={() => write(on ? picked.filter((x) => x.toLowerCase() !== p.email.toLowerCase()) : [...picked, p.email], extra)} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[14px] font-medium text-[#1B1726]">{p.name}{p.role && <span className="ml-2 rounded-full bg-[#F1ECFA] px-2 py-0.5 text-[11px] font-semibold text-[#301D5D]">{p.role}</span>}</span>
                              <span className="block truncate text-[12px] text-[#7A7787]">{p.email}</span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <p className="mt-2 rounded-lg bg-[#F7F6FA] px-3 py-2 text-[13px] text-[#7A7787]">No deal parties with an email yet. Add emails to clients or service providers on this deal to pick them here.</p>
              )}
              <input key={picked.join(',')} className={`${field} mt-2`} defaultValue={extra.join(', ')} placeholder="Other email addresses, comma separated" onBlur={(e) => write(picked, splitEmails(e.target.value))} aria-label="Other attendee emails" />
            </>
          );
        })()}
      </div>
      <div>
        <span className={label}>Custom Questions</span>
        <p className={hint}>Appears in event details during booking.</p>
        <ul className="mt-2 space-y-2">
          {c.questions.map((q, i) => (
            <li key={q.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-[#E6E5EC] p-2">
              <input className={`${field} min-w-[180px] flex-1`} value={q.label} placeholder="Question" onChange={(e) => set('questions', c.questions.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <select className={`${field} w-auto`} value={q.type} onChange={(e) => set('questions', c.questions.map((x, j) => (j === i ? { ...x, type: e.target.value as typeof q.type } : x)))}><option value="text">Short answer</option><option value="textarea">Long answer</option><option value="phone">Phone</option></select>
              <label className="flex items-center gap-1.5 text-[13px] text-[#1B1726]"><input type="checkbox" checked={q.required} onChange={(e) => set('questions', c.questions.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))} />Required</label>
              <button type="button" aria-label="Remove question" className="p-1 text-[#7A7787] hover:text-[#661102]" onClick={() => set('questions', c.questions.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
        {c.questions.length < 10 && <button type="button" className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#F3EEFB] px-3 py-1 text-[13px] font-medium text-[#301D5D] hover:bg-[#EFEAF8]" onClick={() => set('questions', [...c.questions, { id: qid(), label: '', type: 'text', required: false }])}><Plus className="h-3.5 w-3.5" aria-hidden="true" />Add Question</button>}
      </div>
    </div>,

    // 4. Appearance And Branding
    <div key="s4" className="space-y-5">
      <div>
        <span className={label}>Welcome text</span>
        <p className={hint}>Customize the welcome text that appears booking page</p>
        <textarea rows={2} className={`${field} mt-2`} value={c.welcome} maxLength={1000} placeholder="Welcome! Please pick a time below." onChange={(e) => set('welcome', e.target.value)} />
      </div>
      <div>
        <span className={label}>Redirect URL (optional)</span>
        <p className={hint}>After a booking is completed, redirect the user to this URL instead of the default confirmation page.</p>
        <input className={`${field} mt-2`} value={c.redirectUrl} placeholder="https://example.com/thank-you" onChange={(e) => set('redirectUrl', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className={label}>Language</span><select className={`${field} mt-2`} value={c.language} onChange={(e) => set('language', e.target.value as 'en' | 'es')}><option value="en">English</option><option value="es">Spanish</option></select></label>
        <label className="block"><span className={label}>Booker&apos;s Locale</span><select className={`${field} mt-2`} value={c.bookerLocale} onChange={(e) => set('bookerLocale', e.target.value as SchedulerConfig['bookerLocale'])}><option value="auto">Auto</option><option value="en">English</option><option value="es">Spanish</option></select></label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><span className={label}>Time format:</span><div className="mt-2 flex gap-4 text-[14px] text-[#1B1726]">{(['12h', '24h'] as const).map((f) => <label key={f} className="flex items-center gap-1.5"><input type="radio" className="accent-[#301D5D]" checked={c.timeFormat === f} onChange={() => set('timeFormat', f)} />{f === '12h' ? '12h (am/pm)' : '24h'}</label>)}</div></div>
        <div><span className={label}>First Day Of Week</span><div className="mt-2 flex gap-4 text-[14px] text-[#1B1726]">{(['sunday', 'monday'] as const).map((f) => <label key={f} className="flex items-center gap-1.5"><input type="radio" className="accent-[#301D5D]" checked={c.weekStart === f} onChange={() => set('weekStart', f)} />{f === 'sunday' ? 'Sunday' : 'Monday'}</label>)}</div></div>
      </div>
      <ImagePick title="Upload A Banner Image (optional)" icon={<ImageIcon className="h-4 w-4" />} has={banner === undefined ? initial.hasBanner : Boolean(banner)} file={banner} onPick={setBanner} />
      <ImagePick title="Upload An Avatar Image (optional)" icon={<UserRound className="h-4 w-4" />} round has={avatar === undefined ? initial.hasAvatar : Boolean(avatar)} file={avatar} onPick={setAvatar} />
    </div>,

    // 5. Workflow
    <div key="s5" className="space-y-5">
      <p className="text-[14px] text-[#1B1726]">Automate what happens around a booked meeting: send reminder emails before it and a follow-up after it.</p>
      <div>
        <span className={label}>Reminder emails</span>
        <p className={hint}>Up to two reminders are sent before the meeting starts. Reminders that would fall in the past for a last-minute booking are skipped.</p>
        {c.reminders.map((r, i) => (
          <WorkflowRow key={i} value={r} when="before the meeting" onChange={(v) => set('reminders', c.reminders.map((x, j) => (j === i ? v : x)))} onRemove={() => set('reminders', c.reminders.filter((_, j) => j !== i))}
            subjectPlaceholder="Reminder: {subject} with {my_name}" messagePlaceholder="This is a reminder of your upcoming meeting." />
        ))}
        {c.reminders.length < 2 && <button type="button" className="mt-2 inline-flex items-center gap-1 px-2 py-1 text-[13px] font-medium text-[#1B1726] hover:text-[#301D5D]" onClick={() => set('reminders', [...c.reminders, { amount: c.reminders.length ? 1 : 24, unit: 'hours', subject: '', message: '' }])}><Plus className="h-3.5 w-3.5" aria-hidden="true" />Add a reminder</button>}
      </div>
      <div>
        <span className={label}>Follow-up email</span>
        <p className={hint}>One follow-up is sent after the meeting ends.</p>
        {c.followUp && <WorkflowRow value={c.followUp} when="after the meeting ends" onChange={(v) => set('followUp', v)} onRemove={() => set('followUp', null)} subjectPlaceholder="Thank you for meeting with {my_name}" messagePlaceholder="Thank you for your time. Reply to this email with any questions." />}
        {!c.followUp && <button type="button" className="mt-2 inline-flex items-center gap-1 px-2 py-1 text-[13px] font-medium text-[#1B1726] hover:text-[#301D5D]" onClick={() => set('followUp', { amount: 1, unit: 'hours', subject: '', message: '' })}><Plus className="h-3.5 w-3.5" aria-hidden="true" />Add a follow-up</button>}
      </div>
    </div>,
  ];

  const summaryRows: [string, string][] = [
    ['Meeting Length', c.lengths.map((l) => `${l} Min`).join(', ') || '-'],
    ['Default Time', `${c.defaultLength} Min`],
    ['Booking Window', windowLabel(c.windowDays)],
    ['Language', c.language === 'es' ? 'Spanish' : 'English'],
    ['Time Format', c.timeFormat === '12h' ? '12h (am/pm)' : '24h'],
    ['First Day Of Week', c.weekStart === 'sunday' ? 'Sunday' : 'Monday'],
    ['Lead time, before, after', `${minutesLabel(c.noticeMin)}, ${minutesLabel(c.bufferBeforeMin)}, ${minutesLabel(c.bufferAfterMin)}`],
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button type="button" className="inline-flex items-center gap-1 text-[13px] font-medium text-[#4A4757] hover:text-[#1B1726]" onClick={() => onClose()}><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />Back to Schedulers</button>
        <button type="button" className="rounded-full border border-[#F1C9C1] px-3 py-1 text-[13px] font-medium text-[#661102] hover:bg-[#FFEAE6]" onClick={() => { if (window.confirm(initial.id ? 'Discard your changes?' : 'Cancel this scheduler?')) onClose(); }}>Cancel scheduler</button>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-2.5">
          {STEPS.map((title, i) => {
            const open = i === step;
            return (
              <section key={title} className={card}>
                <button type="button" className={`flex w-full items-center gap-3 px-5 ${open ? 'border-b border-[#F1F0F5] py-4' : 'py-3'} text-left`} aria-expanded={open} onClick={() => { if (i < step || !stepError(step)) { setError(''); setStep(i); } else setError(stepError(step)); }}>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${open ? 'bg-[#301D5D] text-white' : 'bg-[#F1F0F5] text-[#4A4757]'}`}>{i + 1}</span>
                  <span className={`flex-1 ${open ? 'text-[16px] font-semibold' : 'text-[14px] font-semibold'} text-[#1B1726]`}>{title}{OPTIONAL.has(i) && <span className="ml-1 font-normal text-[#7A7787]"> (optional)</span>}</span>
                  {!open && <ChevronRight className="h-4 w-4 text-[#9A98A6]" aria-hidden="true" />}
                </button>
                {open && (
                  <div className="p-5">
                    {body[i]}
                    {error && <p role="alert" className="mt-4 text-[13px] font-medium text-[#661102]">{error}</p>}
                    <div className="mt-6 flex items-center justify-between">
                      {i > 0 ? <button type="button" className="inline-flex items-center gap-1 text-[13px] font-medium text-[#4A4757] hover:text-[#1B1726]" onClick={() => { setError(''); setStep(i - 1); }}><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />Previous Step</button> : <span />}
                      {i < STEPS.length - 1
                        ? <button type="button" className={primary} onClick={next}>Continue to {['Availability', 'Event Details', 'Appearance', 'workflow'][i]}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></button>
                        : <button type="button" className={primary} disabled={busy} onClick={() => void save()}>{busy ? 'Saving' : initial.id ? 'Save Scheduler' : 'Create Scheduler'}<Check className="h-3.5 w-3.5" aria-hidden="true" /></button>}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
          {step < STEPS.length - 1 && (
            <div className="flex justify-end pt-1">
              <button type="button" className={pill} disabled={busy} onClick={() => void save()}>{busy ? 'Saving' : initial.id ? 'Save Now' : 'Create Now'}</button>
            </div>
          )}
        </div>

        <aside className={`${card} p-5 lg:sticky lg:top-4`}>
          <h3 className="text-[15px] font-semibold text-[#1B1726]">{c.name.trim() || 'My scheduler'}</h3>
          <p className="mt-0.5 text-[13px] text-[#7A7787]">{c.bookingCalendar ? c.bookingCalendarName || 'Closing Time Calendar' : 'No calendar selected'}</p>
          <div className="mt-3 flex items-center gap-1.5 truncate rounded-lg bg-[#F7F6FA] px-3 py-2 text-[13px] text-[#1B1726]"><Link2 className="h-3.5 w-3.5 shrink-0 text-[#7A7787]" aria-hidden="true" /><span className="truncate">{urlPreview}</span></div>
          <dl className="mt-4 space-y-2.5 border-b border-[#F1F0F5] pb-4">
            {summaryRows.map(([k, v]) => <div key={k} className="flex justify-between gap-3 text-[13px]"><dt className="text-[#7A7787]">{k}</dt><dd className="text-right font-medium text-[#1B1726]">{v}</dd></div>)}
          </dl>
          <div className="pt-4">
            <div className="text-[14px] font-semibold text-[#1B1726]">Weekly hours</div>
            <dl className="mt-2.5 space-y-2.5">
              {onDays.map((d) => <div key={d.key} className="flex justify-between text-[13px]"><dt className="text-[#1B1726]">{d.label}</dt><dd className="text-[#4A4757]">{timeLabel(c.hours[d.key].start, c.timeFormat)} – {timeLabel(c.hours[d.key].end, c.timeFormat)}</dd></div>)}
              {!onDays.length && <p className="text-[13px] text-[#7A7787]">No days on</p>}
            </dl>
          </div>
          {property && <p className="mt-4 border-t border-[#F1F0F5] pt-3 text-[12px] text-[#7A7787]">Deal: {property}</p>}
        </aside>
      </div>
    </div>
  );
}

function WorkflowRow({ value, when, onChange, onRemove, subjectPlaceholder, messagePlaceholder }: {
  value: { amount: number; unit: 'minutes' | 'hours' | 'days'; subject: string; message: string }; when: string;
  onChange: (v: { amount: number; unit: 'minutes' | 'hours' | 'days'; subject: string; message: string }) => void; onRemove: () => void; subjectPlaceholder: string; messagePlaceholder: string;
}) {
  return (
    <div className="mt-2 space-y-2 rounded-xl border border-[#E6E5EC] p-3">
      <div className="flex flex-wrap items-center gap-2 text-[14px] text-[#1B1726]">
        <span>Send</span>
        <input type="number" min={0} max={1000} value={value.amount} onChange={(e) => onChange({ ...value, amount: Math.max(0, Math.round(Number(e.target.value) || 0)) })} className={`${field} w-[80px]!`} aria-label="Amount" />
        <select value={value.unit} onChange={(e) => onChange({ ...value, unit: e.target.value as typeof value.unit })} className={`${field} w-auto!`} aria-label="Unit"><option value="minutes">minutes</option><option value="hours">hours</option><option value="days">days</option></select>
        <span>{when}</span>
        <button type="button" aria-label="Remove" className="ml-auto p-1 text-[#7A7787] hover:text-[#661102]" onClick={onRemove}><X className="h-4 w-4" /></button>
      </div>
      <input className={field} value={value.subject} placeholder={subjectPlaceholder} onChange={(e) => onChange({ ...value, subject: e.target.value })} aria-label="Subject" />
      <textarea rows={2} className={field} value={value.message} placeholder={messagePlaceholder} onChange={(e) => onChange({ ...value, message: e.target.value })} aria-label="Message" />
    </div>
  );
}

function ImagePick({ title, icon, has, file, round, onPick }: { title: string; icon: ReactNode; has: boolean; file: File | null | undefined; round?: boolean; onPick: (f: File | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState('');
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  return (
    <div>
      <span className={label}>{title}</span>
      <div className="mt-2 flex items-center gap-3 rounded-lg border border-[#E6E5EC] px-3 py-2">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden bg-[#F1F0F5] text-[#7A7787] ${round ? 'rounded-full' : 'rounded-md'}`}>{preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : icon}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-[#7A7787]">{file ? file.name : has ? 'Image uploaded' : 'PNG or JPG, up to 4MB'}</span>
        {has && <button type="button" className="text-[13px] font-medium text-[#661102]" onClick={() => onPick(null)}>Remove</button>}
        <button type="button" className={pill} onClick={() => ref.current?.click()}>Upload</button>
        <input ref={ref} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (!f) return;
          if (!/^image\/(png|jpeg)$/.test(f.type)) { setErr('Use a PNG or JPG.'); return; }
          if (f.size > 4 * 1024 * 1024) { setErr('Images must be under 4 MB.'); return; }
          setErr(''); onPick(f);
        }} />
      </div>
      {err && <p className="mt-1 text-[12px] font-medium text-[#661102]">{err}</p>}
    </div>
  );
}

