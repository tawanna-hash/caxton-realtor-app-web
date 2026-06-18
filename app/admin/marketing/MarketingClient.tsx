// app/admin/marketing/MarketingClient.tsx
'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import type {
  MarketingCampaign,
  MarketingCampaignWithStats,
  MarketingCampaignTask,
  MarketingCampaignOutreach,
  AudienceFilter,
} from '@/lib/marketing-campaigns';
import { summarizeAudience } from '@/lib/marketing-campaigns';
import { toTitleCaseName } from '@/lib/format-name';

type CampaignDetail = {
  campaign: MarketingCampaign;
  tasks: MarketingCampaignTask[];
  outreach: MarketingCampaignOutreach[];
};

type AudiencePreview = {
  count: number;
  sample: Array<{ id: number; name: string; company: string | null; status: string | null; publication: string | null }>;
};

const STATUS_TONES: Record<string, string> = {
  draft:     'bg-gray-50 text-gray-700 border-gray-200',
  planning:  'bg-blue-50 text-blue-700 border-blue-200',
  active:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  completed: 'bg-purple-50 text-purple-700 border-purple-200',
  archived:  'bg-gray-100 text-gray-600 border-gray-200',
};

function StatusPill({ value }: { value: string }) {
  const tone = STATUS_TONES[value] ?? 'bg-gray-50 text-gray-700 border-gray-200';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${tone}`}>
      {value}
    </span>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className="font-serif text-2xl text-gray-900 mt-1">
        {value}
      </div>
    </div>
  );
}

export default function MarketingClient({
  initial,
  adminEmail,
}: {
  initial: MarketingCampaignWithStats[];
  adminEmail: string | null;
}) {
  const [campaigns, setCampaigns] = useState(initial);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [audience, setAudience] = useState<AudiencePreview | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  // ── KPIs ────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const active = campaigns.filter(c => c.status === 'active').length;
    const drafts = campaigns.filter(c => c.status === 'draft' || c.status === 'planning').length;
    const sent = campaigns.reduce((s, c) => s + c.outreach_sent, 0);
    const reach = campaigns.reduce((s, c) => s + c.recipients_total, 0);
    return { active, drafts, sent, reach };
  }, [campaigns]);

  // ── Filtering ──────────────────────────────────────────
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return campaigns.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (!q) return true;
      const hay = `${c.name} ${c.brief ?? ''} ${c.goal ?? ''} ${c.publication ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [campaigns, statusFilter, search]);

  // ── Loaders ────────────────────────────────────────────
  const loadCampaigns = useCallback(async () => {
    const res = await fetch('/api/admin/marketing-campaigns', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.campaigns)) setCampaigns(data.campaigns);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/admin/marketing-campaigns/${id}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setDetail(data as CampaignDetail);
      }
      const a = await fetch(`/api/admin/marketing-campaigns/${id}/audience`, { cache: 'no-store' });
      if (a.ok) setAudience(await a.json());
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  // Detail fetch is an external effect (HTTP). State updates inside
  // loadDetail occur after the await resolves — the synchronous clears in
  // the else branch are correct external-state synchronization.
  useEffect(() => {
    if (openId) {
      void loadDetail(openId);
    } else {
      setDetail(null);
      setAudience(null);
    }
  }, [openId, loadDetail]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Mutations ──────────────────────────────────────────
  async function createCampaign() {
    if (!newName.trim()) return;
    const res = await fetch('/api/admin/marketing-campaigns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), status: 'draft', created_by: adminEmail }),
    });
    if (res.ok) {
      const data = await res.json();
      setNewName('');
      setCreating(false);
      await loadCampaigns();
      if (data.campaign?.id) setOpenId(data.campaign.id);
    }
  }

  async function patchCampaign(id: string, patch: Partial<MarketingCampaign> & { audience_filter?: AudienceFilter }) {
    const res = await fetch(`/api/admin/marketing-campaigns/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      await loadDetail(id);
      await loadCampaigns();
    }
  }

  async function createTask(id: string, title: string) {
    if (!title.trim()) return;
    await fetch(`/api/admin/marketing-campaigns/${id}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: title.trim() }),
    });
    await loadDetail(id);
    await loadCampaigns();
  }

  async function patchTask(taskId: string, patch: Partial<MarketingCampaignTask>) {
    await fetch(`/api/admin/marketing-campaign-tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (openId) {
      await loadDetail(openId);
      await loadCampaigns();
    }
  }

  async function deleteTask(taskId: string) {
    await fetch(`/api/admin/marketing-campaign-tasks/${taskId}`, { method: 'DELETE' });
    if (openId) {
      await loadDetail(openId);
      await loadCampaigns();
    }
  }

  async function createOutreach(id: string, payload: Partial<MarketingCampaignOutreach>) {
    await fetch(`/api/admin/marketing-campaigns/${id}/outreach`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await loadDetail(id);
    await loadCampaigns();
  }

  async function deleteCampaign(id: string) {
    if (!confirm('Delete this campaign? Tasks and outreach will be removed.')) return;
    await fetch(`/api/admin/marketing-campaigns/${id}`, { method: 'DELETE' });
    setOpenId(null);
    await loadCampaigns();
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Active" value={kpis.active} />
        <Kpi label="Drafts / planning" value={kpis.drafts} />
        <Kpi label="Outreach sent" value={kpis.sent} />
        <Kpi label="Total reach" value={kpis.reach.toLocaleString()} />
      </section>

      <section className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search campaigns…"
          className="flex-1 min-w-[200px] rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="planning">Planning</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select>
        <button
          onClick={() => setCreating(true)}
          className="rounded-md bg-[#E06100] text-white px-4 py-2 text-sm font-medium hover:bg-[#FF7820]"
        >
          New campaign
        </button>
      </section>

      <section className="rounded-md border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Audience</th>
              <th className="px-4 py-3 font-medium text-right">Tasks</th>
              <th className="px-4 py-3 font-medium text-right">Sent</th>
              <th className="px-4 py-3 font-medium text-right">Reach</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No campaigns match.
                </td>
              </tr>
            )}
            {visible.map((c) => (
              <tr
                key={c.id}
                onClick={() => setOpenId(c.id)}
                className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{c.name}</div>
                  {c.publication && <div className="text-xs text-gray-500">{c.publication}</div>}
                </td>
                <td className="px-4 py-3"><StatusPill value={c.status} /></td>
                <td className="px-4 py-3 text-gray-600">{summarizeAudience(c.audience_filter)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{c.task_done}/{c.task_count}</td>
                <td className="px-4 py-3 text-right tabular-nums">{c.outreach_sent}</td>
                <td className="px-4 py-3 text-right tabular-nums">{c.recipients_total.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {creating && (
        <CreateDrawer
          newName={newName}
          setNewName={setNewName}
          onCancel={() => { setCreating(false); setNewName(''); }}
          onCreate={createCampaign}
        />
      )}

      {openId && (
        <DetailDrawer
          loading={loadingDetail}
          detail={detail}
          audience={audience}
          onClose={() => setOpenId(null)}
          onPatch={(patch) => patchCampaign(openId, patch)}
          onCreateTask={(title) => createTask(openId, title)}
          onPatchTask={patchTask}
          onDeleteTask={deleteTask}
          onCreateOutreach={(payload) => createOutreach(openId, payload)}
          onDelete={() => deleteCampaign(openId)}
        />
      )}
    </div>
  );
}

// ─── Create Drawer ──────────────────────────────────────────────────
function CreateDrawer({
  newName, setNewName, onCancel, onCreate,
}: {
  newName: string;
  setNewName: (s: string) => void;
  onCancel: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <button aria-label="Close" className="flex-1 bg-black/30" onClick={onCancel} />
      <div className="w-full max-w-xl bg-white shadow-xl overflow-y-auto">
        <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-serif text-xl text-gray-900">
            New campaign
          </h2>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-900">✕</button>
        </div>
        <div className="px-6 py-6 space-y-4">
          <label className="block">
            <div className="text-sm font-medium text-gray-700 mb-1">Campaign name</div>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Spring Builder Push 2026"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onCancel} className="rounded-md border border-gray-300 px-4 py-2 text-sm">Cancel</button>
            <button
              onClick={onCreate}
              disabled={!newName.trim()}
              className="rounded-md bg-[#E06100] text-white px-4 py-2 text-sm disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Drawer ──────────────────────────────────────────────────
function DetailDrawer({
  loading, detail, audience, onClose, onPatch, onCreateTask, onPatchTask, onDeleteTask, onCreateOutreach, onDelete,
}: {
  loading: boolean;
  detail: CampaignDetail | null;
  audience: AudiencePreview | null;
  onClose: () => void;
  onPatch: (patch: Partial<MarketingCampaign> & { audience_filter?: AudienceFilter }) => void;
  onCreateTask: (title: string) => void;
  onPatchTask: (id: string, patch: Partial<MarketingCampaignTask>) => void;
  onDeleteTask: (id: string) => void;
  onCreateOutreach: (payload: Partial<MarketingCampaignOutreach>) => void;
  onDelete: () => void;
}) {
  const [tab, setTab] = useState<'overview' | 'tasks' | 'outreach' | 'audience'>('overview');
  const [newTask, setNewTask] = useState('');
  const [outreachDraft, setOutreachDraft] = useState({ subject: '', body: '', channel: 'email' as const });

  if (loading || !detail) {
    return (
      <div className="fixed inset-0 z-50 flex">
        <button aria-label="Close" className="flex-1 bg-black/30" onClick={onClose} />
        <div className="w-full max-w-3xl bg-white shadow-xl p-10 text-gray-500 rounded-md">Loading…</div>
      </div>
    );
  }

  const c = detail.campaign;
  const tasksByStatus = {
    to_do: detail.tasks.filter(t => t.status === 'to_do'),
    in_progress: detail.tasks.filter(t => t.status === 'in_progress'),
    done: detail.tasks.filter(t => t.status === 'done'),
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <button aria-label="Close" className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-3xl bg-white shadow-xl overflow-y-auto">
        <div className="px-6 py-5 border-b border-gray-200">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
                Campaign
              </div>
              <h2 className="font-serif text-2xl text-gray-900">
                {c.name}
              </h2>
              <div className="mt-2 flex items-center gap-2">
                <StatusPill value={c.status} />
                <span className="text-sm text-gray-500">{summarizeAudience(c.audience_filter)}</span>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-900">✕</button>
          </div>

          <div className="mt-4 flex gap-1 border-b border-gray-200">
            {(['overview', 'tasks', 'outreach', 'audience'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                  tab === t ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                {t === 'overview' && 'Overview'}
                {t === 'tasks' && `Tasks (${detail.tasks.length})`}
                {t === 'outreach' && `Outreach (${detail.outreach.length})`}
                {t === 'audience' && `Audience${audience ? ` (${audience.count})` : ''}`}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-6">
          {tab === 'overview' && (
            <div className="space-y-4">
              <Field label="Status">
                <select
                  value={c.status}
                  onChange={(e) => onPatch({ status: e.target.value as MarketingCampaign['status'] })}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="draft">Draft</option>
                  <option value="planning">Planning</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </select>
              </Field>
              <Field label="Type">
                <input
                  defaultValue={c.type ?? ''}
                  onBlur={(e) => onPatch({ type: e.target.value || null })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Publication">
                <select
                  defaultValue={c.publication ?? ''}
                  onChange={(e) => onPatch({ publication: e.target.value || null })}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">(any)</option>
                  <option value="austin">Austin</option>
                  <option value="san_antonio">San Antonio</option>
                  <option value="both">Both</option>
                </select>
              </Field>
              <Field label="Brief">
                <textarea
                  defaultValue={c.brief ?? ''}
                  onBlur={(e) => onPatch({ brief: e.target.value || null })}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Goal">
                <textarea
                  defaultValue={c.goal ?? ''}
                  onBlur={(e) => onPatch({ goal: e.target.value || null })}
                  rows={2}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start date">
                  <input
                    type="date"
                    defaultValue={c.start_date ?? ''}
                    onBlur={(e) => onPatch({ start_date: e.target.value || null })}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </Field>
                <Field label="End date">
                  <input
                    type="date"
                    defaultValue={c.end_date ?? ''}
                    onBlur={(e) => onPatch({ end_date: e.target.value || null })}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </Field>
              </div>
              <div className="pt-4 border-t border-gray-200">
                <button
                  onClick={onDelete}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Delete campaign
                </button>
              </div>
            </div>
          )}

          {tab === 'tasks' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  placeholder="Add a task…"
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTask.trim()) { onCreateTask(newTask); setNewTask(''); }
                  }}
                />
                <button
                  onClick={() => { onCreateTask(newTask); setNewTask(''); }}
                  disabled={!newTask.trim()}
                  className="rounded-md bg-[#E06100] text-white px-4 py-2 text-sm disabled:opacity-50"
                >
                  Add
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {(['to_do', 'in_progress', 'done'] as const).map((col) => (
                  <div key={col} className="rounded-md bg-gray-50 p-3">
                    <div className="text-xs font-medium uppercase tracking-wider text-gray-600 mb-2">
                      {col.replace('_', ' ')} ({tasksByStatus[col].length})
                    </div>
                    <div className="space-y-2">
                      {tasksByStatus[col].map((t) => (
                        <div key={t.id} className="rounded-md border border-gray-200 bg-white p-2 text-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">{t.title}</div>
                            <button onClick={() => onDeleteTask(t.id)} className="text-gray-400 hover:text-red-600 text-xs">✕</button>
                          </div>
                          <div className="mt-2 flex items-center gap-1 text-xs">
                            {(['to_do', 'in_progress', 'done'] as const).filter(s => s !== t.status).map(s => (
                              <button
                                key={s}
                                onClick={() => onPatchTask(t.id, { status: s })}
                                className="rounded-md border border-gray-200 px-1.5 py-0.5 text-gray-600 hover:bg-gray-100"
                              >
                                → {s.replace('_', ' ')}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'outreach' && (
            <div className="space-y-4">
              <div className="rounded-md border border-gray-200 p-4 space-y-3 bg-gray-50">
                <div className="text-sm font-medium text-gray-700">New outreach</div>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={outreachDraft.channel}
                    onChange={(e) => setOutreachDraft({ ...outreachDraft, channel: e.target.value as 'email' })}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                    <option value="drip">Drip</option>
                  </select>
                  <input
                    value={outreachDraft.subject}
                    onChange={(e) => setOutreachDraft({ ...outreachDraft, subject: e.target.value })}
                    placeholder="Subject"
                    className="col-span-2 rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <textarea
                  value={outreachDraft.body}
                  onChange={(e) => setOutreachDraft({ ...outreachDraft, body: e.target.value })}
                  placeholder="Body…"
                  rows={3}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      onCreateOutreach({ ...outreachDraft, status: 'draft' });
                      setOutreachDraft({ subject: '', body: '', channel: 'email' });
                    }}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                  >
                    Save draft
                  </button>
                  <button
                    onClick={() => {
                      onCreateOutreach({ ...outreachDraft, status: 'scheduled' });
                      setOutreachDraft({ subject: '', body: '', channel: 'email' });
                    }}
                    disabled={!outreachDraft.subject.trim() || !outreachDraft.body.trim()}
                    className="rounded-md bg-[#E06100] text-white px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    Schedule
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {detail.outreach.length === 0 && (
                  <div className="text-sm text-gray-500 py-6 text-center">No outreach yet.</div>
                )}
                {detail.outreach.map((o) => (
                  <div key={o.id} className="rounded-md border border-gray-200 bg-white p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{o.subject ?? '(no subject)'}</div>
                      <StatusPill value={o.status} />
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {o.channel} · {o.recipient_count ?? 0} recipients
                      {o.sent_at ? ` · sent ${new Date(o.sent_at).toLocaleString()}` : ''}
                    </div>
                    {o.body && <div className="mt-2 text-gray-700 whitespace-pre-wrap text-sm">{o.body}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'audience' && (
            <div className="space-y-3">
              {!audience ? (
                <div className="text-sm text-gray-500">Resolving audience…</div>
              ) : (
                <>
                  <div className="rounded-md border border-gray-200 bg-white p-4">
                    <div className="text-xs uppercase tracking-wider text-gray-500">Matching advertisers</div>
                    <div className="font-serif text-3xl text-gray-900 mt-1">
                      {audience.count.toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">{summarizeAudience(c.audience_filter)}</div>
                  </div>
                  <div className="rounded-md border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600 text-left">
                        <tr>
                          <th className="px-3 py-2 font-medium">Name</th>
                          <th className="px-3 py-2 font-medium">Company</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                          <th className="px-3 py-2 font-medium">Publication</th>
                        </tr>
                      </thead>
                      <tbody>
                        {audience.sample.map((s) => (
                          <tr key={s.id} className="border-t border-gray-100">
                            <td className="px-3 py-2">{toTitleCaseName(s.name)}</td>
                            <td className="px-3 py-2 text-gray-600">{s.company ?? ''}</td>
                            <td className="px-3 py-2"><StatusPill value={s.status ?? '—'} /></td>
                            <td className="px-3 py-2 text-gray-600">{s.publication ?? ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {audience.count > audience.sample.length && (
                    <div className="text-xs text-gray-500">
                      Showing first {audience.sample.length} of {audience.count}.
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-sm font-medium text-gray-700 mb-1">{label}</div>
      {children}
    </label>
  );
}
