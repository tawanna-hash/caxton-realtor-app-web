'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { adminApi } from '@/lib/admin-api';

import PageTitle from '@/components/ui/PageTitle';
const RULE_ACTIONS = [
  { value: 'signup', label: 'Sign Up' },
  { value: 'follow_facebook', label: 'Follow on Facebook' },
  { value: 'follow_instagram', label: 'Follow on Instagram' },
  { value: 'follow_linkedin', label: 'Follow on LinkedIn' },
  { value: 'follow_twitter', label: 'Follow on Twitter' },
  { value: 'subscribe_list', label: 'Subscribe to List' },
  { value: 'custom', label: 'Custom Action' },
];

function toDateTimeLocal(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function GiveawayDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { admin, loading: authLoading } = useAdmin();
  const [giveaway, setGiveaway] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [prize, setPrize] = useState('');
  const [publication, setPublication] = useState('both');
  const [status, setStatus] = useState('draft');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [drawAt, setDrawAt] = useState('');

  const loadGiveaway = async () => {
    const data = await adminApi.getGiveaway(id);
    const g = (data?.giveaway || data) as Record<string, unknown>;
    // API returns { giveaway, rules, stats } at top level - merge them
    // onto the state object so downstream reads of giveaway.rules work.
    const merged = {
      ...g,
      rules: ((data as Record<string, unknown>)?.rules as unknown[]) || [],
      stats: ((data as Record<string, unknown>)?.stats as Record<string, unknown>) || {},
    };
    setGiveaway(merged);
    setTitle((g.title as string) || '');
    setDescription((g.description as string) || '');
    setPrize((g.prize as string) || '');
    setPublication((g.publication as string) || 'both');
    setStatus((g.status as string) || 'draft');
    setStartsAt(toDateTimeLocal(g.starts_at as string));
    setEndsAt(toDateTimeLocal(g.ends_at as string));
    setDrawAt(toDateTimeLocal(g.draw_at as string));
    setLoading(false);
  };

  useEffect(() => {
    if (!admin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preexisting error-flow pattern; refactor tracked separately
    loadGiveaway().catch((e) => {
      setError(e.message);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      // Schema (lib/server/schemas/giveaways.ts) expects camelCase keys
      // and rejects null description / drawAt. Omit those keys when empty.
      const payload: Record<string, unknown> = {
        title,
        prize,
        publication,
        status,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      };
      if (description) payload.description = description;
      if (drawAt) payload.drawAt = new Date(drawAt).toISOString();
      await adminApi.updateGiveaway(id, payload);
      await loadGiveaway();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this draft giveaway? This cannot be undone.')) return;
    try {
      await adminApi.deleteGiveaway(id);
      router.push('/admin/giveaways');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDraw = async () => {
    if (!confirm('Draw a winner now? This will close the giveaway and cannot be undone.')) return;
    setDrawing(true);
    try {
      await adminApi.drawWinner(id);
      await loadGiveaway();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDrawing(false);
    }
  };

  if (authLoading || !admin || loading) {
    return <div className="max-w-5xl mx-auto px-6 py-12 text-sm text-gray-500">Loading...</div>;
  }

  if (!giveaway) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="text-sm text-red-600">{error || 'Giveaway not found'}</div>
      </div>
    );
  }

  const endsAtPassed = new Date(giveaway.ends_at as string) <= new Date();
  const winnerFirst = giveaway.winner_first_name as string | undefined;
  const winnerLast = giveaway.winner_last_name as string | undefined;
  const winnerEmail = giveaway.winner_email as string | undefined;
  const winnerName =
    winnerFirst || winnerLast
      ? `${winnerFirst ?? ''} ${winnerLast ?? ''}`.trim()
      : winnerEmail;
  const canDraw = endsAtPassed && (giveaway.status as string) !== 'announced' && !giveaway.winner_realtor_id;
  const canDelete = (giveaway.status as string) === 'draft';
  const rules = (giveaway.rules as Record<string, unknown>[]) || [];

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      <div>
        <Link href="/admin/giveaways" className="text-sm text-gray-500 hover:text-[#021D40]">
          &larr; Back to giveaways
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <PageTitle size="md">{giveaway.title as string}</PageTitle>
          <div className="text-xs uppercase tracking-wider text-gray-500 mt-1">
            Status: <span className="font-medium text-[#021D40]">{giveaway.status as string}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canDelete && (
            <button
              onClick={handleDelete}
              className="text-xs uppercase tracking-wider text-red-600 hover:text-red-700 px-3 py-2"
            >
              Delete Draft
            </button>
          )}
          {winnerName ? (
            <div className="text-sm bg-blue-50 border border-blue-200 px-4 py-2 rounded-md">
              <span className="text-blue-700 text-xs uppercase tracking-wider">Winner:</span>{' '}
              <span className="font-medium text-[#021D40]">{winnerName}</span>
            </div>
          ) : (
            <button
              onClick={handleDraw}
              disabled={!canDraw || drawing}
              title={!endsAtPassed ? 'Cannot draw until ends-at has passed' : ''}
              className="bg-[#021D40] text-white px-4 py-2 text-sm font-medium hover:bg-[#03285a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {drawing ? 'Drawing...' : 'Draw Winner'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-md">{error}</div>
      )}

      <section className="bg-white border border-gray-200 p-6 rounded-md">
        <h2 className="text-sm uppercase tracking-wider text-gray-500 mb-5">Details</h2>
        <form onSubmit={handleSave} className="space-y-5">
          <FieldRow label="Title" required>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#021D40] rounded-md"
            />
          </FieldRow>
          <FieldRow label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#021D40] rounded-md"
            />
          </FieldRow>
          <FieldRow label="Prize" required>
            <input
              type="text"
              required
              value={prize}
              onChange={(e) => setPrize(e.target.value)}
              className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#021D40] rounded-md"
            />
          </FieldRow>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FieldRow label="Publication">
              <select
                value={publication}
                onChange={(e) => setPublication(e.target.value)}
                className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#021D40] bg-white rounded-md"
              >
                <option value="both">Both Publications</option>
                <option value="austin">RealtyLine Austin</option>
                <option value="san_antonio">Newsline San Antonio</option>
              </select>
            </FieldRow>
            <FieldRow label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#021D40] bg-white rounded-md"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="closed">Closed</option>
                <option value="announced">Announced</option>
              </select>
            </FieldRow>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FieldRow label="Starts At">
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#021D40] rounded-md"
              />
            </FieldRow>
            <FieldRow label="Ends At">
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#021D40] rounded-md"
              />
            </FieldRow>
            <FieldRow label="Draw At">
              <input
                type="datetime-local"
                value={drawAt}
                onChange={(e) => setDrawAt(e.target.value)}
                className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#021D40] rounded-md"
              />
            </FieldRow>
          </div>
          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-[#021D40] text-white px-5 py-2 text-sm font-medium hover:bg-[#03285a] disabled:opacity-60 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </section>

      <RulesSection giveawayId={id} rules={rules} onChange={loadGiveaway} />
      <EntriesSection giveawayId={id} />
    </div>
  );
}

function FieldRow({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

// === Rules ===

function RulesSection({
  giveawayId,
  rules,
  onChange,
}: {
  giveawayId: string;
  rules: Record<string, unknown>[];
  onChange: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [actionType, setActionType] = useState('signup');
  const [label, setLabel] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [tickets, setTickets] = useState(1);
  const [required, setRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setActionType('signup');
    setLabel('');
    setTargetUrl('');
    setTickets(1);
    setRequired(false);
    setAdding(false);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await adminApi.createRule(giveawayId, {
        action_type: actionType,
        label: label || undefined,
        target_url: targetUrl || undefined,
        tickets,
        sort_order: rules.length,
        required,
      });
      reset();
      await onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (ruleId: string) => {
    if (!confirm('Remove this rule?')) return;
    try {
      await adminApi.deleteRule(giveawayId, ruleId);
      await onChange();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <section className="bg-white border border-gray-200 p-6 rounded-md">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm uppercase tracking-wider text-gray-500">Rules ({rules.length})</h2>
        {!adding && (
          <button onClick={() => setAdding(true)} className="text-sm text-[#021D40] font-medium hover:underline">
            + Add Rule
          </button>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 mb-4 rounded-md">{error}</div>
      )}

      {rules.length === 0 && !adding && (
        <p className="text-sm text-gray-500">No rules defined yet.</p>
      )}

      <div className="space-y-2 mb-4">
        {rules.map((r) => {
          const ruleId = r.id as string;
          const action = r.action_type as string;
          const lbl = r.label as string;
          const url = r.target_url as string;
          const tix = (r.tickets as number) ?? 0;
          const isRequired = r.required as boolean;
          return (
            <div key={ruleId} className="flex items-center justify-between gap-3 border border-gray-100 px-4 py-3 text-sm rounded-md">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs uppercase tracking-wider text-gray-500 min-w-[140px]">{action}</span>
                <span className="text-[#021D40] truncate">{lbl || '-'}</span>
                {url && (
                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:underline truncate max-w-[200px]">
                    {url}
                  </a>
                )}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs text-gray-500">{tix} ticket{tix === 1 ? '' : 's'}</span>
                {isRequired && (
                  <span className="text-[10px] uppercase tracking-wider bg-red-50 text-red-700 border border-red-100 px-2 py-0.5 rounded-md">
                    Required
                  </span>
                )}
                <button onClick={() => handleDelete(ruleId)} className="text-xs text-red-600 hover:text-red-700">
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {adding && (
        <form onSubmit={handleAdd} className="border-t border-gray-100 pt-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1.5">Action Type</label>
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value)}
                className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#021D40] bg-white rounded-md"
              >
                {RULE_ACTIONS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1.5">Display Label</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Follow @myrealtyline"
                className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#021D40] rounded-md"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1.5">Target URL</label>
              <input
                type="url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://"
                className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#021D40] rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1.5">Tickets</label>
              <input
                type="number"
                min={1}
                value={tickets}
                onChange={(e) => setTickets(parseInt(e.target.value) || 1)}
                className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#021D40] rounded-md"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="border-gray-300"
            />
            Required to enter
          </label>
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="bg-[#021D40] text-white px-4 py-2 text-sm font-medium hover:bg-[#03285a] disabled:opacity-60 transition-colors"
            >
              {submitting ? 'Adding...' : 'Add Rule'}
            </button>
            <button type="button" onClick={reset} className="text-sm text-gray-500 hover:text-[#021D40]">
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

// === Entries ===

function EntriesSection({ giveawayId }: { giveawayId: string }) {
  const [entries, setEntries] = useState<Record<string, unknown>[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preexisting pattern; refactor tracked separately
    setLoading(true);
    adminApi.listEntries(giveawayId, page)
      .then((data) => {
        const list = (data?.entries || data?.realtors || data || []) as Record<string, unknown>[];
        setEntries(list);
        setTotal((data?.total as number) || list.length);
        if (data?.page_size) setPageSize(data.page_size as number);
        setLoading(false);
      })
      .catch((err) => {
        setError((err as Error).message);
        setLoading(false);
      });
  }, [giveawayId, page]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="bg-white border border-gray-200 p-6 rounded-md">
      <h2 className="text-sm uppercase tracking-wider text-gray-500 mb-5">
        Entries {total > 0 && <span className="text-[#021D40] normal-case">({total})</span>}
      </h2>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 mb-4 rounded-md">{error}</div>
      )}

      {loading && <p className="text-sm text-gray-500">Loading entries...</p>}

      {!loading && entries.length === 0 && (
        <p className="text-sm text-gray-500">No entries yet.</p>
      )}

      {!loading && entries.length > 0 && (
        <>
          <div className="border border-gray-100 divide-y divide-gray-100 rounded-md">
            {entries.map((e, i) => {
              const name = (e.realtor_name || e.name || e.email || '-') as string;
              const email = (e.realtor_email || e.email) as string | undefined;
              const completions = (e.completed_count || e.completions || 0) as number;
              const tickets = (e.tickets || e.ticket_count || 0) as number;
              return (
                <div key={(e.realtor_id as string) || (e.id as string) || i} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium text-[#021D40] truncate">{name}</div>
                    {email && <div className="text-xs text-gray-500 truncate">{email}</div>}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-600 flex-shrink-0">
                    <span>{completions} completions</span>
                    <span><strong className="text-[#021D40]">{tickets}</strong> tickets</span>
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="text-gray-500 hover:text-[#021D40] disabled:opacity-40"
              >
                &larr; Previous
              </button>
              <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="text-gray-500 hover:text-[#021D40] disabled:opacity-40"
              >
                Next &rarr;
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
