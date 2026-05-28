// app/admin/advertisers/AdvertisersClient.tsx
//
// Admin UI for advertisers. Handles:
//   - List table with publication badge, hotspot/click counts, gate state
//   - Click advertiser name → drill-down analytics page
//   - "New advertiser" modal with publication selector
//   - Edit modal (same fields)
//   - Copy share URL, Regenerate share token, Delete
//
// Publication branding is set per-advertiser and drives the public
// dashboard + email theming downstream.

'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { AdvertiserWithStats } from '@/lib/advertisers';
import type { Publication } from '@/lib/publication-theme';
import { PUBLICATION_OPTIONS, getPublicationTheme } from '@/lib/publication-theme';

type Props = {
  initialAdvertisers: AdvertiserWithStats[];
};

export default function AdvertisersClient({ initialAdvertisers }: Props) {
  const [advertisers, setAdvertisers] = useState<AdvertiserWithStats[]>(initialAdvertisers);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdvertiserWithStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/advertisers', { cache: 'no-store' });
      if (res.status === 401) { router.push('/admin/login'); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAdvertisers(data.advertisers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'reload failed');
    }
  }, [router]);

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (a: AdvertiserWithStats) => { setEditing(a); setModalOpen(true); };

  const copyShareUrl = async (a: AdvertiserWithStats) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/r/advertiser/${a.slug}?t=${a.share_token}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copy this URL:', url);
    }
  };

  const regenerateToken = async (a: AdvertiserWithStats) => {
    if (!window.confirm(`Rotate the share token for "${a.name}"? Old share URLs will stop working.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/advertisers/${a.id}/regenerate-token`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'regenerate failed');
    }
  };

  const deleteAdvertiser = async (a: AdvertiserWithStats) => {
    if (!window.confirm(`Delete "${a.name}"? Their hotspot links will be unlinked (hotspots remain).`)) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/advertisers/${a.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'delete failed');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Advertisers</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage advertisers, share analytics links, and configure access.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700"
          >
            New advertiser
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded">
            {error}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-xs uppercase tracking-wider text-gray-600">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Publication</th>
                <th className="px-4 py-3 text-right">Hotspots</th>
                <th className="px-4 py-3 text-right">Clicks (30d)</th>
                <th className="px-4 py-3">Contact email</th>
                <th className="px-4 py-3">Gate</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {advertisers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    No advertisers yet. Click &ldquo;New advertiser&rdquo; to add one.
                  </td>
                </tr>
              )}
              {advertisers.map((a) => (
                <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/advertisers/${a.id}`}
                      className="font-medium text-gray-900 hover:text-blue-700"
                    >
                      {a.name}
                    </Link>
                    <div className="text-xs text-gray-500">{a.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <PublicationBadge publication={a.publication} />
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{a.hotspot_count}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{a.clicks_30d}</td>
                  <td className="px-4 py-3 text-gray-700">{a.contact_email || '—'}</td>
                  <td className="px-4 py-3">
                    {a.requires_email_gate
                      ? <span className="text-xs text-amber-700">email gate</span>
                      : <span className="text-xs text-gray-500">open</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-xs">
                    <div className="inline-flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => copyShareUrl(a)}
                        className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                      >
                        Copy link
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(a)}
                        className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => regenerateToken(a)}
                        className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                      >
                        Rotate token
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteAdvertiser(a)}
                        className="px-2 py-1 border border-red-200 text-red-700 rounded hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-500 mt-4">
          <strong>Tip:</strong> Share URL gives the advertiser a read-only dashboard.
          If <em>email gate</em> is on, the advertiser must verify the contact email via magic link before viewing.
          The dashboard&apos;s colors and email branding follow the advertiser&apos;s publication.
        </p>
      </div>

      {modalOpen && (
        <EditModal
          advertiser={editing}
          onClose={() => setModalOpen(false)}
          onSaved={async () => { setModalOpen(false); await reload(); }}
          onError={(msg) => setError(msg)}
        />
      )}
    </div>
  );
}

function PublicationBadge({ publication }: { publication?: Publication }) {
  const theme = getPublicationTheme(publication);
  const bg =
    theme.id === 'san_antonio' ? 'bg-purple-50 text-purple-800 border-purple-200'
      : theme.id === 'both' ? 'bg-gray-100 text-gray-700 border-gray-200'
      : 'bg-blue-50 text-blue-800 border-blue-200';
  return (
    <span className={`inline-block px-2 py-0.5 text-xs rounded border ${bg}`}>
      {theme.shortName}
    </span>
  );
}

function EditModal({
  advertiser, onClose, onSaved, onError,
}: {
  advertiser: AdvertiserWithStats | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState(advertiser?.name || '');
  const [publication, setPublication] = useState<Publication>(advertiser?.publication || 'austin');
  const [contactEmail, setContactEmail] = useState(advertiser?.contact_email || '');
  const [requiresGate, setRequiresGate] = useState(advertiser?.requires_email_gate || false);
  const [saving, setSaving] = useState(false);

  const onSave = useCallback(async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const url = advertiser
        ? `/api/admin/advertisers/${advertiser.id}`
        : '/api/admin/advertisers';
      const method = advertiser ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          contact_email: contactEmail.trim() || null,
          requires_email_gate: requiresGate,
          publication,
        }),
      });
      if (res.status === 401) {
        onError('Your session expired. Please log in again.');
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }, [name, publication, contactEmail, requiresGate, advertiser, onSaved, onError]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {advertiser ? 'Edit advertiser' : 'New advertiser'}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-gray-600 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. La Cima"
              disabled={saving}
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-gray-600 mb-1">Publication</label>
            <select
              value={publication}
              onChange={(e) => setPublication(e.target.value as Publication)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={saving}
            >
              {PUBLICATION_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Drives branding on the advertiser&apos;s public dashboard and outbound emails.
            </p>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-gray-600 mb-1">Contact email</label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="contact@example.com"
              disabled={saving}
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={requiresGate}
                onChange={(e) => setRequiresGate(e.target.checked)}
                disabled={saving}
              />
              <span>Requires email gate (advertiser must verify email before viewing)</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !name.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : (advertiser ? 'Save' : 'Create')}
          </button>
        </div>
      </div>
    </div>
  );
}
