'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { adminApi } from '@/lib/admin-api';
import { PUBLICATION_LABELS_WITH_BOTH, type PublicationId } from '@/lib/publications';

import PageTitle from '@/components/ui/PageTitle';
type Giveaway = {
  id: string;
  title: string;
  prize: string;
  publication: PublicationId | 'both';
  status: 'draft' | 'active' | 'closed' | 'announced';
  starts_at: string;
  ends_at: string;
  ticket_count?: number;
  participant_count?: number;
  winner_name?: string;
};

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 border-gray-200 rounded-md',
  active: 'bg-green-50 text-green-700 border-green-200 rounded-md',
  closed: 'bg-amber-50 text-amber-700 border-amber-200 rounded-md',
  announced: 'bg-blue-50 text-blue-700 border-blue-200',
};

function formatDate(s?: string) {
  if (!s) return '-';
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function GiveawaysPage() {
  const { admin, loading: authLoading } = useAdmin();
  const [items, setItems] = useState<Giveaway[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!admin) return;
    adminApi.listGiveaways()
      .then((data) => {
        setItems(data?.giveaways || data || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [admin]);

  if (authLoading || !admin) {
    return <div className="max-w-6xl mx-auto px-6 py-12 text-sm text-gray-500">Loading...</div>;
  }

  return (
    <div className="content-admin-shell">
      <div className="flex items-center justify-between mb-8">
        <div>
          <PageTitle size="md">Giveaways</PageTitle>
          <p className="text-sm text-gray-500 mt-1">
            {items.length} {items.length === 1 ? 'giveaway' : 'giveaways'}
          </p>
        </div>
        <Link
          href="/admin/giveaways/new"
          className="bg-orange-600 text-white px-4 py-2 text-sm font-medium hover:bg-orange-700 rounded-md transition-colors"
        >
          + Create Giveaway
        </Link>
      </div>

      <section className="content-admin-summary" aria-label="Giveaway summary">
        <div><strong>{items.length.toLocaleString()}</strong><span>Total giveaways</span></div>
        <div><strong>{items.filter((item) => item.status === 'active').length.toLocaleString()}</strong><span>Active</span></div>
        <div><strong>{items.reduce((sum, item) => sum + (item.participant_count ?? 0), 0).toLocaleString()}</strong><span>Entries</span></div>
        <div><strong>{items.filter((item) => Boolean(item.winner_name)).length.toLocaleString()}</strong><span>Winners announced</span></div>
      </section>

      {loading && <div className="text-sm text-gray-500">Loading giveaways...</div>}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-md">{error}</div>
      )}

      {!loading && items.length === 0 && (
        <div className="content-admin-empty">
          <p className="font-semibold text-gray-900">No giveaways yet</p>
          <p className="mb-4 mt-1 text-sm text-gray-500">Create a promotion and begin collecting entries.</p>
          <Link href="/admin/giveaways/new" className="text-sm font-medium text-brand-700 underline">
            Create your first giveaway
          </Link>
        </div>
      )}

      {items.length > 0 && (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table>
            <thead>
              <tr>
                <th className="text-left">Giveaway</th>
                <th className="text-left">Publication</th>
                <th className="text-left">Dates</th>
                <th className="text-left">Status</th>
                <th className="text-right">Entries</th>
                <th className="text-right">Tickets</th>
                <th className="text-left">Winner</th>
              </tr>
            </thead>
            <tbody>
              {items.map((g) => (
                <tr key={g.id}>
                  <td>
                    <Link href={`/admin/giveaways/${g.id}`} className="font-semibold text-brand-700 hover:underline">
                      {g.title}
                    </Link>
                    <div className="mt-0.5 text-xs text-gray-500">{g.prize}</div>
                  </td>
                  <td>{PUBLICATION_LABELS_WITH_BOTH[g.publication] || g.publication}</td>
                  <td className="whitespace-nowrap">{formatDate(g.starts_at)} – {formatDate(g.ends_at)}</td>
                  <td><span className={`inline-flex border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_STYLES[g.status] || ''}`}>{g.status}</span></td>
                  <td className="text-right tabular-nums">{g.participant_count ?? 0}</td>
                  <td className="text-right tabular-nums">{g.ticket_count ?? 0}</td>
                  <td>{g.winner_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
