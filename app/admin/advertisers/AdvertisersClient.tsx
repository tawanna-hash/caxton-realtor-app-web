// app/admin/advertisers/AdvertisersClient.tsx
//
// Interactive UI for the advertiser management page.
// Handles: list, create, edit, delete, regenerate token, copy share URL.

'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import type { AdvertiserWithStats } from '@/lib/advertisers';

interface Props {
  initialAdvertisers: AdvertiserWithStats[];
}

export default function AdvertisersClient({ initialAdvertisers }: Props) {
  const [advertisers, setAdvertisers] = useState<AdvertiserWithStats[]>(initialAdvertisers);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/advertisers', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setAdvertisers(data.advertisers as AdvertiserWithStats[]);
    } catch (err) {
      console.warn('[advertisers] refresh failed:', err);
    }
  }, []);

  const create = useCallback(async (payload: {
    name: string; contact_email?: string; requires_email_gate: boolean;
  }) => {
    setError(null);
    try {
      const res = await fetch('/api/admin/advertisers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Create failed');
        return false;
      }
      await refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
      return false;
    }
  }, [refresh]);

  const update = useCallback(async (id: number, payload: Partial<{
    name: string; contact_email: string | null; requires_email_gate: boolean;
  }>) => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/advertisers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Update failed');
        return false;
      }
      await refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
      return false;
    }
  }, [refresh]);

  const remove = useCallback(async (id: number, name: string) => {
    if (!confirm(`Delete advertiser "${name}"? Their hotspots will remain but be unlinked.`)) return;
    try {
      const res = await fetch(`/api/admin/advertisers/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Delete failed');
        return;
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
    }
  }, [refresh]);

  const regenerateToken = useCallback(async (id: number, name: string) => {
    if (!confirm(`Regenerate share token for "${name}"? Any links already sent will stop working.`)) return;
    try {
      const res = await fetch(`/api/admin/advertisers/${id}/regenerate-token`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Regenerate failed');
        return;
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
    }
  }, [refresh]);

  const buildShareUrl = (a: AdvertiserWithStats) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/r/advertiser/${a.slug}?t=${a.share_token}`;
  };

  const copyShareUrl = useCallback(async (a: AdvertiserWithStats) => {
    try {
      await navigator.clipboard.writeText(buildShareUrl(a));
      setCopiedId(a.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError('Copy failed; select and copy manually');
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Advertisers</h1>
            <p className="text-sm text-gray-600 mt-1">
              Manage advertisers, share analytics links, and configure access.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-700 text-white text-sm font-medium rounded hover:bg-blue-800"
          >
            New advertiser
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded">
            {error}
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-3 text-red-600 underline text-xs"
            >
              dismiss
            </button>
          </div>
        )}

        <div className="bg-white shadow-sm rounded border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-xs uppercase tracking-wider text-gray-600">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Hotspots</th>
                <th className="px-4 py-3">Clicks (30d)</th>
                <th className="px-4 py-3">Contact email</th>
                <th className="px-4 py-3">Gate</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {advertisers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                    No advertisers yet. Create one above, or they&apos;ll be backfilled
                    from existing hotspots&apos; advertiser_name fields automatically.
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
                  <td className="px-4 py-3 text-gray-700">{a.hotspot_count}</td>
                  <td className="px-4 py-3 text-gray-700">{a.clicks_30d}</td>
                  <td className="px-4 py-3 text-gray-700">{a.contact_email || '—'}</td>
                  <td className="px-4 py-3">
                    {a.requires_email_gate
                      ? <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-800 rounded">email</span>
                      : <span className="text-xs text-gray-500">open</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        type="button"
                        onClick={() => copyShareUrl(a)}
                        className="text-xs px-2 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50"
                        title="Copy share URL"
                      >
                        {copiedId === a.id ? 'Copied!' : 'Copy link'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(a.id)}
                        className="text-xs px-2 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => regenerateToken(a.id, a.name)}
                        className="text-xs px-2 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50"
                        title="Regenerate share token (invalidates old links)"
                      >
                        Rotate token
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(a.id, a.name)}
                        className="text-xs px-2 py-1 text-red-700 border border-red-300 rounded hover:bg-red-50"
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

        <div className="mt-6 text-xs text-gray-500">
          <p>
            <strong>Tip:</strong> Share URL gives the advertiser a read-only dashboard.
            If <em>email gate</em> is on, the advertiser must verify the contact email
            via magic link before viewing.
          </p>
        </div>
      </div>

      {showCreateModal && (
        <AdvertiserFormModal
          mode="create"
          onSave={async (payload) => {
            const ok = await create(payload);
            if (ok) setShowCreateModal(false);
          }}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {editingId !== null && (
        <AdvertiserFormModal
          mode="edit"
          initial={advertisers.find((a) => a.id === editingId)!}
          onSave={async (payload) => {
            const ok = await update(editingId, payload);
            if (ok) setEditingId(null);
          }}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// Create/edit form modal
// ============================================================
function AdvertiserFormModal({
  mode, initial, onSave, onClose,
}: {
  mode: 'create' | 'edit';
  initial?: AdvertiserWithStats;
  onSave: (payload: { name: string; contact_email?: string; requires_email_gate: boolean }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [contactEmail, setContactEmail] = useState(initial?.contact_email ?? '');
  const [requiresEmailGate, setRequiresEmailGate] = useState(initial?.requires_email_gate ?? false);
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-white rounded shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {mode === 'create' ? 'New advertiser' : 'Edit advertiser'}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. La Cima"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Contact email <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="marketing@example.com"
            />
          </div>
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="requires_email_gate"
              checked={requiresEmailGate}
              onChange={(e) => setRequiresEmailGate(e.target.checked)}
              className="mt-1"
            />
            <label htmlFor="requires_email_gate" className="text-sm text-gray-700">
              Require email verification before viewing analytics
              <p className="text-xs text-gray-500 mt-0.5">
                Advertisers will need to enter their email and click a magic link before
                seeing reports. Useful for sensitive accounts.
              </p>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || !name.trim()}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onSave({
                  name: name.trim(),
                  contact_email: contactEmail.trim() || undefined,
                  requires_email_gate: requiresEmailGate,
                });
              } finally {
                setSubmitting(false);
              }
            }}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded hover:bg-blue-800 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : (mode === 'create' ? 'Create' : 'Save')}
          </button>
        </div>
      </div>
    </div>
  );
}
