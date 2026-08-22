'use client';

// app/admin/billing/_components/RenewalsPanel.tsx
//
// Three-tab panel inside the Renewals workspace: Expiring Soon,
// All Renewals, and Renewal Reminders.

import { useState } from 'react';
import type { AgreementWithAdvertiser } from '@/lib/agreements';
import type { RenewalReminder } from '@/lib/types/renewal-reminder';
import { StatusPill, DaysBadge, ReminderStatusBadge } from './Badges';
import { AG_STATUS } from './constants';
import { getDaysUntil, humanDate } from './helpers';

export function RenewalsPanel({
  expiringSoon, allRenewals, reminders, activeTab, onTabChange, onOpen, onRenew, onReminderAction,
  onSendRenewal, onSendReminder,
}: {
  expiringSoon: AgreementWithAdvertiser[];
  allRenewals: AgreementWithAdvertiser[];
  reminders: RenewalReminder[];
  activeTab: 'expiring' | 'all_renewals' | 'reminders';
  onTabChange: (t: 'expiring' | 'all_renewals' | 'reminders') => void;
  onOpen: (r: AgreementWithAdvertiser) => void;
  onRenew: (r: AgreementWithAdvertiser) => void;
  onReminderAction: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onSendRenewal?: (r: AgreementWithAdvertiser) => Promise<void>;
  onSendReminder?: (r: RenewalReminder) => Promise<void>;
}) {
  const [noteId, setNoteId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  const subTabs: { key: 'expiring' | 'all_renewals' | 'reminders'; label: string; count: number }[] = [
    { key: 'expiring',      label: 'Expiring Soon',    count: expiringSoon.length },
    { key: 'all_renewals',  label: 'All Renewals',     count: allRenewals.length },
    { key: 'reminders',     label: 'Renewal Reminders',count: reminders.length },
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-1 border-b border-gray-200">
        {subTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => onTabChange(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label} <span className="ml-1 text-xs text-gray-400">({t.count})</span>
          </button>
        ))}
      </div>

      {activeTab === 'expiring' && (
        <div className="rounded-md border border-gray-200 bg-white overflow-hidden">
          <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200 bg-gray-50">
            <div className="col-span-2">Client</div>
            <div className="col-span-2">Email</div>
            <div className="col-span-2">Company</div>
            <div className="col-span-1">Size</div>
            <div className="col-span-1">Rate</div>
            <div className="col-span-1">Exp Date</div>
            <div className="col-span-1">Days</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-1 text-right">Actions</div>
          </div>
          {expiringSoon.length === 0
            ? <div className="p-8 text-center text-sm text-gray-500">No agreements expiring soon.</div>
            : <div className="divide-y divide-gray-100">
              {expiringSoon.map((r) => {
                const days = getDaysUntil(r.exp_date ?? r.end_date);
                return (
                  <div key={r.id} className="hover:bg-blue-50/30">
                    {/* Desktop */}
                    <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-3 items-center">
                      <button onClick={() => onOpen(r)} className="col-span-2 text-left text-sm font-medium text-gray-900 truncate">{r.rep_name ?? '—'}</button>
                      <div className="col-span-2 text-xs text-gray-600 truncate">{r.advertiser_email ?? '—'}</div>
                      <div className="col-span-2 text-xs text-gray-600 truncate">{r.company_name ?? '—'}</div>
                      <div className="col-span-1 text-xs text-gray-600">{r.ad_size ?? '—'}</div>
                      <div className="col-span-1 text-xs text-gray-700">{r.ad_rate_cents != null ? `$${(r.ad_rate_cents / 100).toFixed(0)}` : '—'}</div>
                      <div className="col-span-1 text-xs text-gray-600">{r.exp_date ? humanDate(r.exp_date) : '—'}</div>
                      <div className="col-span-1"><DaysBadge days={days} /></div>
                      <div className="col-span-1"><StatusPill value={r.status} options={AG_STATUS} /></div>
                      <div className="col-span-1 flex gap-1 justify-end">
                        <button
                          className="px-2 py-1 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                          title="Send renewal email"
                          onClick={() => onSendRenewal?.(r)}
                        >Email</button>
                        <button
                          className="px-2 py-1 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700"
                          onClick={() => onRenew(r)}
                        >Renew</button>
                      </div>
                    </div>
                    {/* Mobile card */}
                    <div className="sm:hidden px-4 py-3 space-y-2">
                      <button onClick={() => onOpen(r)} className="text-left w-full">
                        <div className="text-sm font-medium text-gray-900 truncate">{r.rep_name ?? '—'}</div>
                        <div className="text-xs text-gray-500 truncate">{r.advertiser_email ?? '—'}{r.company_name ? ` · ${r.company_name}` : ''}</div>
                      </button>
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <dt className="text-gray-500 uppercase tracking-wider">Size</dt>
                        <dd className="text-gray-800 text-right">{r.ad_size ?? '—'}</dd>
                        <dt className="text-gray-500 uppercase tracking-wider">Rate</dt>
                        <dd className="text-gray-800 text-right">{r.ad_rate_cents != null ? `$${(r.ad_rate_cents / 100).toFixed(0)}` : '—'}</dd>
                        <dt className="text-gray-500 uppercase tracking-wider">Exp</dt>
                        <dd className="text-gray-800 text-right">{r.exp_date ? humanDate(r.exp_date) : '—'}</dd>
                        <dt className="text-gray-500 uppercase tracking-wider">Days</dt>
                        <dd className="text-right"><DaysBadge days={days} /></dd>
                        <dt className="text-gray-500 uppercase tracking-wider">Status</dt>
                        <dd className="text-right"><StatusPill value={r.status} options={AG_STATUS} /></dd>
                      </dl>
                      <div className="flex gap-1 justify-end">
                        <button
                          className="px-2 py-1 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                          onClick={() => onSendRenewal?.(r)}
                        >Email</button>
                        <button
                          className="px-2 py-1 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700"
                          onClick={() => onRenew(r)}
                        >Renew</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          }
        </div>
      )}

      {activeTab === 'all_renewals' && (
        <div className="rounded-md border border-gray-200 bg-white overflow-hidden">
          <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200 bg-gray-50">
            <div className="col-span-2">Client</div>
            <div className="col-span-2">Email</div>
            <div className="col-span-2">Company</div>
            <div className="col-span-1">Size</div>
            <div className="col-span-2">Rate</div>
            <div className="col-span-2">Signed</div>
            <div className="col-span-1">Status</div>
          </div>
          {allRenewals.length === 0
            ? <div className="p-8 text-center text-sm text-gray-500">No renewals yet.</div>
            : <div className="divide-y divide-gray-100">
              {allRenewals.map((r) => (
                <button key={r.id} onClick={() => onOpen(r)} className="w-full text-left hover:bg-blue-50/30 block">
                  {/* Desktop */}
                  <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-3 items-center">
                    <div className="col-span-2 text-sm font-medium text-gray-900 truncate">{r.rep_name ?? '—'}</div>
                    <div className="col-span-2 text-xs text-gray-600 truncate">{r.advertiser_email ?? '—'}</div>
                    <div className="col-span-2 text-xs text-gray-600 truncate">{r.company_name ?? '—'}</div>
                    <div className="col-span-1 text-xs text-gray-600">{r.ad_size ?? '—'}</div>
                    <div className="col-span-2 text-xs text-gray-700">{r.ad_rate_cents != null ? `$${(r.ad_rate_cents / 100).toFixed(0)}/mo` : '—'}</div>
                    <div className="col-span-2 text-xs text-gray-600">{r.signed_at ? new Date(r.signed_at).toLocaleDateString() : '—'}</div>
                    <div className="col-span-1"><StatusPill value={r.status} options={AG_STATUS} /></div>
                  </div>
                  {/* Mobile card */}
                  <div className="sm:hidden px-4 py-3 space-y-2">
                    <div>
                      <div className="text-sm font-medium text-gray-900 truncate">{r.rep_name ?? '—'}</div>
                      <div className="text-xs text-gray-500 truncate">{r.advertiser_email ?? '—'}{r.company_name ? ` · ${r.company_name}` : ''}</div>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <dt className="text-gray-500 uppercase tracking-wider">Size</dt>
                      <dd className="text-gray-800 text-right">{r.ad_size ?? '—'}</dd>
                      <dt className="text-gray-500 uppercase tracking-wider">Rate</dt>
                      <dd className="text-gray-800 text-right">{r.ad_rate_cents != null ? `$${(r.ad_rate_cents / 100).toFixed(0)}/mo` : '—'}</dd>
                      <dt className="text-gray-500 uppercase tracking-wider">Signed</dt>
                      <dd className="text-gray-800 text-right">{r.signed_at ? new Date(r.signed_at).toLocaleDateString() : '—'}</dd>
                      <dt className="text-gray-500 uppercase tracking-wider">Status</dt>
                      <dd className="text-right"><StatusPill value={r.status} options={AG_STATUS} /></dd>
                    </dl>
                  </div>
                </button>
              ))}
            </div>
          }
        </div>
      )}

      {activeTab === 'reminders' && (
        <div className="rounded-md border border-gray-200 bg-white overflow-hidden">
          <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200 bg-gray-50">
            <div className="col-span-2">Client</div>
            <div className="col-span-2">Company</div>
            <div className="col-span-1">Rate</div>
            <div className="col-span-1">Expires</div>
            <div className="col-span-1">Days</div>
            <div className="col-span-2">Remind On</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>
          {reminders.length === 0
            ? <div className="p-8 text-center text-sm text-gray-500">No renewal reminders yet.</div>
            : <div className="divide-y divide-gray-100">
              {reminders.map((r) => {
                const daysLeft = getDaysUntil(r.exp_date);
                const remindDays = getDaysUntil(r.remind_date);
                const remindUrgency = remindDays !== null && remindDays <= 0
                  ? 'text-rose-600 font-semibold'
                  : remindDays !== null && remindDays <= 7
                    ? 'text-amber-600'
                    : 'text-gray-600';
                return (
                  <div key={r.id} className="flex flex-col space-y-2 sm:space-y-0 sm:grid sm:grid-cols-12 sm:gap-2 px-4 py-3 sm:items-start hover:bg-gray-50/40">
                    <div className="sm:col-span-2 text-sm font-medium text-gray-900 truncate">{r.rep_name ?? '—'}{r.company_name && <span className="sm:hidden text-xs text-gray-500 font-normal"> · {r.company_name}</span>}</div>
                    <div className="hidden sm:block sm:col-span-2 text-xs text-gray-600 truncate">{r.company_name ?? '—'}</div>
                    <div className="sm:hidden">
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <dt className="text-gray-500 uppercase tracking-wider">Rate</dt>
                        <dd className="text-gray-800 text-right">{r.ad_rate_cents != null ? `$${(r.ad_rate_cents / 100).toFixed(0)}` : '—'}</dd>
                        <dt className="text-gray-500 uppercase tracking-wider">Expires</dt>
                        <dd className="text-gray-800 text-right">{r.exp_date ? humanDate(r.exp_date) : '—'}</dd>
                        <dt className="text-gray-500 uppercase tracking-wider">Days left</dt>
                        <dd className="text-right"><DaysBadge days={daysLeft} /></dd>
                        <dt className="text-gray-500 uppercase tracking-wider">Remind on</dt>
                        <dd className={`text-right ${remindUrgency}`}>{r.remind_date ? humanDate(r.remind_date) : '—'}</dd>
                        <dt className="text-gray-500 uppercase tracking-wider">Status</dt>
                        <dd className="text-right"><ReminderStatusBadge status={r.status} /></dd>
                      </dl>
                    </div>
                    <div className="hidden sm:block sm:col-span-1 text-xs text-gray-700">{r.ad_rate_cents != null ? `$${(r.ad_rate_cents / 100).toFixed(0)}` : '—'}</div>
                    <div className="hidden sm:block sm:col-span-1 text-xs text-gray-600">{r.exp_date ? humanDate(r.exp_date) : '—'}</div>
                    <div className="hidden sm:block sm:col-span-1"><DaysBadge days={daysLeft} /></div>
                    <div className={`hidden sm:block sm:col-span-2 text-xs ${remindUrgency}`}>{r.remind_date ? humanDate(r.remind_date) : '—'}</div>
                    <div className="hidden sm:block sm:col-span-1"><ReminderStatusBadge status={r.status} /></div>
                    <div className="sm:col-span-2 flex flex-col gap-1 items-end">
                      {noteId === r.id ? (
                        <div className="w-full space-y-1">
                          <textarea
                            className="w-full text-xs px-2 py-1 border border-gray-300 rounded-md resize-none"
                            rows={2}
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder="Add a note…"
                          />
                          <div className="flex gap-1 justify-end">
                            <button className="text-xs px-2 py-0.5 rounded-md border border-gray-300 text-gray-600" onClick={() => setNoteId(null)}>Cancel</button>
                            <button className="text-xs px-2 py-0.5 rounded-md bg-blue-600 text-white" onClick={async () => {
                              await onReminderAction(r.id, { note: noteText });
                              setNoteId(null); setNoteText('');
                            }}>Save</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-1 flex-wrap justify-end">
                          <button className="px-2 py-0.5 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                            onClick={() => onSendReminder?.(r)}>Email</button>
                          {r.status === 'Pending' && <>
                            <button className="px-2 py-0.5 text-xs rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
                              onClick={() => onReminderAction(r.id, { status: 'Completed' })}>Complete</button>
                            <button className="px-2 py-0.5 text-xs rounded-md border border-blue-300 text-blue-700 hover:bg-blue-50"
                              onClick={() => { setNoteId(r.id); setNoteText(r.note ?? ''); }}>Note</button>
                            <button className="px-2 py-0.5 text-xs rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
                              onClick={() => onReminderAction(r.id, { status: 'Dismissed' })}>Dismiss</button>
                          </>}
                        </div>
                      )}
                      {r.note && noteId !== r.id && (
                        <div className="text-xs text-gray-500 italic text-right max-w-[10rem] truncate" title={r.note}>{r.note}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          }
        </div>
      )}
    </div>
  );
}
