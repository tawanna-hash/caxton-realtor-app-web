'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { AdvertiserWithStats } from '@/lib/advertisers';
import type { Publication } from '@/lib/publication-theme';
import { PUBLICATION_OPTIONS, getPublicationTheme } from '@/lib/publication-theme';

type Props = {
  initialAdvertisers: AdvertiserWithStats[];
};

export default function AdvertisersClient({ initialAdvertisers }: Props) {
  const [advertisers, setAdvertisers] = useState(initialAdvertisers);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdvertiserWithStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const router = useRouter();

  const realtyLineAdvertisers = useMemo(
    () => advertisers.filter((a) => (a.publication ?? 'austin') === 'austin'),
    [advertisers],
  );

  const newslineAdvertisers = useMemo(
    () => advertisers.filter((a) => (a.publication ?? 'austin') === 'san_antonio'),
    [advertisers],
  );

  const reload = useCallback(async () => {
    try {
      setError(null);

      const res = await fetch('/api/admin/advertisers', { cache: 'no-store' });

      if (res.status === 401) {
        setAuthExpired(true);
        setAdvertisers([]);
        setEditing(null);
        setError('Your session expired. Please log in again.');
        router.push('/admin/login');
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      setAuthExpired(false);
      setAdvertisers(data.advertisers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'reload failed');
    }
  }, [router]);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (a: AdvertiserWithStats) => {
    setEditing(a);
    setModalOpen(true);
  };

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
      const res = await fetch(`/api/admin/advertisers/${a.id}/regenerate-token`, {
        method: 'POST',
      });

      if (res.status === 401) {
        setAuthExpired(true);
        setAdvertisers([]);
        setEditing(null);
        setError('Your session expired. Please log in again.');
        router.push('/admin/login');
        return;
      }

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
      const res = await fetch(`/api/admin/advertisers/${a.id}`, {
        method: 'DELETE',
      });

      if (res.status === 401) {
        setAuthExpired(true);
        setAdvertisers([]);
        setEditing(null);
        setError('Your session expired. Please log in again.');
        router.push('/admin/login');
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'delete failed');
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Advertisers</h1>
          <p className="text-sm text-gray-600 mt-1">
            Manage advertisers, share analytics links, and configure access.
          </p>
        </div>

        <button
          onClick={openCreate}
          disabled={authExpired}
          className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          New advertiser
        </button>
      </div>

      {authExpired && (
        <div className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          Your session expired. Please log in again.
        </div>
      )}

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <AdvertiserColumn
          title="RealtyLine"
          advertisers={realtyLineAdvertisers}
          emptyText="No RealtyLine advertisers yet. Click “New advertiser” to add one."
          onCopyShareUrl={copyShareUrl}
          onEdit={openEdit}
          onRegenerateToken={regenerateToken}
          onDelete={deleteAdvertiser}
        />

        <AdvertiserColumn
          title="Newsline"
          advertisers={newslineAdvertisers}
          emptyText="No Newsline advertisers yet. Click “New advertiser” to add one."
          onCopyShareUrl={copyShareUrl}
          onEdit={openEdit}
          onRegenerateToken={regenerateToken}
          onDelete={deleteAdvertiser}
        />
      </div>

      <p className="text-xs text-gray-500">
        <strong>Tip:</strong> Share URL gives the advertiser a read-only dashboard. If{' '}
        <em>email gate</em> is on, the advertiser must verify the contact email via magic
        link before viewing. The dashboard&apos;s colors and email branding follow the
        advertiser&apos;s publication.
      </p>

      {modalOpen && (
        <EditModal
          advertiser={editing}
          onClose={() => setModalOpen(false)}
          onSaved={async () => {
            setModalOpen(false);
            await reload();
          }}
          onError={(msg) => setError(msg)}
        />
      )}
    </div>
  );
}

function AdvertiserColumn({
  title,
  advertisers,
  emptyText,
  onCopyShareUrl,
  onEdit,
  onRegenerateToken,
  onDelete,
}: {
  title: string;
  advertisers: AdvertiserWithStats[];
  emptyText: string;
  onCopyShareUrl: (a: AdvertiserWithStats) => void | Promise<void>;
  onEdit: (a: AdvertiserWithStats) => void;
  onRegenerateToken: (a: AdvertiserWithStats) => void | Promise<void>;
  onDelete: (a: AdvertiserWithStats) => void | Promise<void>;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      </div>

      {advertisers.length === 0 ? (
        <div className="px-4 py-6 text-sm text-gray-500">{emptyText}</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {advertisers.map((a) => (
            <div key={a.id} className="px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Link
                    href={`/admin/analytics/advertiser/${a.id}`}
                    className="font-medium text-gray-900 hover:underline"
                  >
                    {a.name}
                  </Link>
                  <div className="text-xs text-gray-500">{a.slug}</div>
                </div>

                <PublicationBadge publication={a.publication ?? 'austin'} />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-gray-700">
                <Metric label="Hotspots" value={String(a.hotspot_count)} />
                <Metric label="Clicks (30d)" value={String(a.clicks_30d)} />
                <Metric label="Contact email" value={a.contact_email || '—'} breakAll />
                <Metric label="Gate" value={a.requires_email_gate ? 'email gate' : 'open'} />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => onCopyShareUrl(a)}
                  className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                >
                  Copy link
                </button>
                <button
                  onClick={() => onEdit(a)}
                  className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                >
                  Edit
                </button>
                <button
                  onClick={() => onRegenerateToken(a)}
                  className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                >
                  Rotate token
                </button>
                <button
                  onClick={() => onDelete(a)}
                  className="px-2 py-1 border border-red-200 text-red-700 rounded hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  breakAll = false,
}: {
  label: string;
  value: string;
  breakAll?: boolean;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className={breakAll ? 'break-all' : undefined}>{value}</div>
    </div>
  );
}

function PublicationBadge({ publication }: { publication?: Publication }) {
  const theme = getPublicationTheme(publication);

  const tone =
    theme.id === 'san_antonio'
      ? 'bg-purple-50 text-purple-800 border-purple-200'
      : theme.id === 'both'
        ? 'bg-gray-100 text-gray-700 border-gray-200'
        : 'bg-blue-50 text-blue-800 border-blue-200';

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {theme.shortName}
    </span>
  );
}

function EditModal({
  advertiser,
  onClose,
  onSaved,
  onError,
}: {
  advertiser: AdvertiserWithStats | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState(advertiser?.name ?? '');
  const [publication, setPublication] = useState<Publication>(advertiser?.publication ?? 'austin');
  const [contactEmail, setContactEmail] = useState(advertiser?.contact_email ?? '');
  const [requiresGate, setRequiresGate] = useState(advertiser?.requires_email_gate ?? false);
  const [saving, setSaving] = useState(false);

  const onSave = useCallback(async () => {
    if (!name.trim()) return;

    setSaving(true);

    try {
      const url = advertiser ? `/api/admin/advertisers/${advertiser.id}` : '/api/admin/advertisers';
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
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `HTTP ${res.status}`);
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
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {advertiser ? 'Edit advertiser' : 'New advertiser'}
          </h2>
        </div>

        <div className="p-5 space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-700">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. La Cima"
              disabled={saving}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-700">Publication</span>
            <select
              value={publication}
              onChange={(e) => setPublication(e.target.value as Publication)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={saving}
            >
              {PUBLICATION_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <p className="text-xs text-gray-500">
            Drives branding on the advertiser&apos;s public dashboard and outbound emails.
          </p>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-700">Contact email</span>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="contact@example.com"
              disabled={saving}
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={requiresGate}
              onChange={(e) => setRequiresGate(e.target.checked)}
              disabled={saving}
            />
            Require email gate (advertiser must verify email before viewing)
          </label>
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={saving || !name.trim()}
          >
            {saving ? 'Saving…' : advertiser ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}