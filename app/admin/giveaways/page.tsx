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
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <PageTitle size="md">Giveaways</PageTitle>
          <p className="text-sm text-gray-500 mt-1">
            {items.length} {items.length === 1 ? 'giveaway' : 'giveaways'}
          </p>
        </div>
        <Link
          href="/admin/giveaways/new"
          className="bg-brand-700 text-white px-4 py-2 text-sm font-medium hover:bg-brand-800 rounded-md transition-colors"
        >
          + Create Giveaway
        </Link>
      </div>

      {loading && <div className="text-sm text-gray-500">Loading giveaways...</div>}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-md">{error}</div>
      )}

      {!loading && items.length === 0 && (
        <div className="bg-white border border-gray-200 p-12 text-center rounded-md">
          <p className="text-gray-500 mb-4">No giveaways yet.</p>
          <Link href="/admin/giveaways/new" className="text-sm font-medium text-brand-700 underline">
            Create your first giveaway
          </Link>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {items.map((g) => (
          <Link
            key={g.id}
            href={`/admin/giveaways/${g.id}`}
            className="bg-white border border-gray-200 p-5 hover:border-brand-700 transition-colors block rounded-md"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <h2 className="font-semibold text-brand-700 leading-tight">{g.title}</h2>
              <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 border whitespace-nowrap ${STATUS_STYLES[g.status] || ''}`}>
                {g.status}
              </span>
            </div>
            <div className="text-sm text-gray-700 mb-1">{g.prize}</div>
            <div className="text-xs text-gray-500 mb-3">{PUBLICATION_LABELS_WITH_BOTH[g.publication] || g.publication}</div>
            <div className="text-xs text-gray-500 mb-3">
              {formatDate(g.starts_at)} - {formatDate(g.ends_at)}
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-600 pt-3 border-t border-gray-100">
              <span><strong className="text-brand-700">{g.participant_count ?? 0}</strong> entries</span>
              <span><strong className="text-brand-700">{g.ticket_count ?? 0}</strong> tickets</span>
            </div>
            {g.winner_name && (
              <div className="mt-3 pt-3 border-t border-gray-100 text-xs">
                <span className="text-gray-500">Winner: </span>
                <span className="font-medium text-brand-700">{g.winner_name}</span>
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
