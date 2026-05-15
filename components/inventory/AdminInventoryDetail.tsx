'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { upload } from '@vercel/blob/client';
import type {
  BuilderInventoryRow,
  Publication,
  PromoType,
  Status,
} from '@/lib/builder-inventory';

type Props = {
  row: BuilderInventoryRow;
};

const US_STATE_CODES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','PR','RI','SC','SD','TN','TX','UT','VT','VA','VI','WA','WV','WI','WY',
] as const;

const STATUS_BUTTONS: { value: Status; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'active', label: 'Active' },
  { value: 'rejected', label: 'Rejected' },
];

const PROMO_TYPES: { value: PromoType; label: string }[] = [
  { value: 'rate_buydown', label: 'Rate buydown' },
  { value: 'incentive', label: 'Incentive' },
  { value: 'event', label: 'Event' },
  { value: 'broker_bonus', label: 'Broker bonus' },
  { value: 'other', label: 'Other' },
];

const fieldStyle =
  'w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-gray-900 transition-colors disabled:bg-gray-50 disabled:text-gray-400';
const labelStyle = 'block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1';

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function AdminInventoryDetail({ row }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [neighbors, setNeighbors] = useState<{ prevId: number | null; nextId: number | null }>({
    prevId: null,
    nextId: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/inventory?status=${row.status}`, {
          credentials: 'include',
        });
        if (!res.ok) return;
        const body = (await res.json()) as { rows: BuilderInventoryRow[] };
        if (cancelled) return;
        const idx = body.rows.findIndex((r) => r.id === row.id);
        if (idx < 0) return;
        setNeighbors({
          prevId: idx > 0 ? body.rows[idx - 1].id : null,
          nextId: idx < body.rows.length - 1 ? body.rows[idx + 1].id : null,
        });
      } catch {
        // silent — non-critical UX
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [row.id, row.status]);

  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [uploadingFlyer, setUploadingFlyer] = useState(false);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const flyerInputRef = useRef<HTMLInputElement>(null);

  const [edit, setEdit] = useState({
    publication: row.publication,
    builderName: row.builderName,
    title: row.title,
    city: row.city,
    state: row.state,
    description: row.description ?? '',
    bedsMin: row.bedsMin?.toString() ?? '',
    bedsMax: row.bedsMax?.toString() ?? '',
    bathsMin: row.bathsMin?.toString() ?? '',
    bathsMax: row.bathsMax?.toString() ?? '',
    sqftMin: row.sqftMin?.toString() ?? '',
    sqftMax: row.sqftMax?.toString() ?? '',
    priceMin: row.priceMin?.toString() ?? '',
    priceMax: row.priceMax?.toString() ?? '',
    promoType: row.promoType ?? 'rate_buydown',
    expiresAt: row.expiresAt ?? '',
  });

  async function patch(body: Record<string, unknown>, successLabel: string) {
    setBusy(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(`/api/admin/inventory/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: boolean; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        setErrorMessage(data?.error || `Update failed (HTTP ${res.status})`);
        return;
      }
      setSuccessMessage(successLabel);
      router.refresh();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Network error. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(next: Status) {
    if (next === row.status) return;
    await patch({ status: next }, `Status set to ${next}.`);
  }

  async function toggleFeatured() {
    await patch({ featured: !row.featured }, row.featured ? 'Unfeatured.' : 'Featured.');
  }

  async function onPickThumbnail(file: File | undefined) {
    if (!file) return;
    setUploadingThumbnail(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const blob = await upload(
        `inventory-thumbs/${row.id}/${file.name}`,
        file,
        {
          access: 'public',
          handleUploadUrl: '/api/admin/inventory/upload-token',
          contentType: file.type,
        },
      );
      await patch({ thumbnailUrl: blob.url }, 'Thumbnail replaced.');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Thumbnail upload failed.',
      );
    } finally {
      setUploadingThumbnail(false);
      if (thumbnailInputRef.current) thumbnailInputRef.current.value = '';
    }
  }

  async function onPickFlyer(file: File | undefined) {
    if (!file) return;
    setUploadingFlyer(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const blob = await upload(
        `inventory-flyers/${row.id}/${file.name}`,
        file,
        {
          access: 'public',
          handleUploadUrl: '/api/admin/inventory/upload-token',
          contentType: file.type,
        },
      );
      await patch({ flyerPdfUrl: blob.url }, 'Flyer replaced.');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Flyer upload failed.',
      );
    } finally {
      setUploadingFlyer(false);
      if (flyerInputRef.current) flyerInputRef.current.value = '';
    }
  }

  async function saveEdits() {
    if (row.kind === 'listing') {
      const violations: string[] = [];
      const pairs: { label: string; min: string; max: string }[] = [
        { label: 'Beds', min: edit.bedsMin, max: edit.bedsMax },
        { label: 'Baths', min: edit.bathsMin, max: edit.bathsMax },
        { label: 'Sqft', min: edit.sqftMin, max: edit.sqftMax },
        { label: 'Price', min: edit.priceMin, max: edit.priceMax },
      ];
      for (const { label, min, max } of pairs) {
        if (min.trim() === '' || max.trim() === '') continue;
        const minN = Number(min);
        const maxN = Number(max);
        if (Number.isFinite(minN) && Number.isFinite(maxN) && minN > maxN) {
          violations.push(`${label} min (${min}) must not exceed max (${max}).`);
        }
      }
      if (violations.length > 0) {
        setErrorMessage(violations.join(' '));
        setSuccessMessage(null);
        return;
      }
    }
    const body: Record<string, unknown> = {
      publication: edit.publication,
      builderName: edit.builderName.trim(),
      title: edit.title.trim(),
      city: edit.city.trim(),
      state: edit.state.trim().toUpperCase().slice(0, 2),
      description: edit.description.trim() || null,
    };
    if (row.kind === 'listing') {
      const num = (v: string) => (v.trim() === '' ? null : Number(v));
      Object.assign(body, {
        bedsMin: num(edit.bedsMin),
        bedsMax: num(edit.bedsMax),
        bathsMin: num(edit.bathsMin),
        bathsMax: num(edit.bathsMax),
        sqftMin: num(edit.sqftMin),
        sqftMax: num(edit.sqftMax),
        priceMin: num(edit.priceMin),
        priceMax: num(edit.priceMax),
      });
    } else {
      Object.assign(body, {
        promoType: edit.promoType,
        expiresAt: edit.expiresAt.trim() || null,
      });
    }
    await patch(body, 'Edits saved.');
  }

  async function deleteRow() {
    const ok = window.confirm(
      `Delete this submission permanently?\n\n${row.builderName} — ${row.title}\n\nThis cannot be undone. The flyer PDF in Vercel Blob and the thumbnail JPG on the droplet will be orphaned (and can be cleaned up later).`,
    );
    if (!ok) return;

    setBusy(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/admin/inventory/${row.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setErrorMessage(data?.error || `Delete failed (HTTP ${res.status})`);
        setBusy(false);
        return;
      }
      router.push('/admin/inventory');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Network error. Try again.',
      );
      setBusy(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-4">
        <Link
          href="/admin/inventory"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          ← Back to queue
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {neighbors.prevId !== null ? (
            <Link
              href={`/admin/inventory/${neighbors.prevId}`}
              className="text-gray-600 hover:text-gray-900"
            >
              ← Prev
            </Link>
          ) : (
            <span className="text-gray-300 cursor-not-allowed">← Prev</span>
          )}
          <span className="text-gray-300">|</span>
          {neighbors.nextId !== null ? (
            <Link
              href={`/admin/inventory/${neighbors.nextId}`}
              className="text-gray-600 hover:text-gray-900"
            >
              Next →
            </Link>
          ) : (
            <span className="text-gray-300 cursor-not-allowed">Next →</span>
          )}
        </div>
      </div>

      <div className="mb-6">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
          Admin · Review submission
        </p>
        <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 tracking-tight">
          {row.title}
        </h1>
        <p className="text-lg text-gray-700 font-light mt-1">{row.builderName}</p>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="mb-4 border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          {errorMessage}
        </div>
      )}
      {successMessage && (
        <div
          role="status"
          className="mb-4 border-l-4 border-green-600 bg-green-50 px-4 py-3 text-sm text-green-900"
        >
          {successMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <div className="border border-gray-200 bg-white">
            <div className="relative aspect-[3/4] bg-gray-100">
              {row.thumbnailUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={row.thumbnailUrl}
                  alt={`${row.builderName} thumbnail`}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
                  Thumbnail not yet generated
                </div>
              )}
            </div>
            {row.flyerPdfUrl && (
              <a
                href={row.flyerPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center px-4 py-2.5 border-t border-gray-200 text-sm font-medium text-gray-900 hover:bg-gray-50 transition-colors"
              >
                Open flyer PDF →
              </a>
            )}
          </div>

          <section className="border border-gray-200 bg-white px-4 py-4">
            <h3 className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-3">
              Replace files
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Thumbnail (JPG / PNG / WebP, max 10 MB)
                </label>
                <input
                  ref={thumbnailInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy || uploadingThumbnail || uploadingFlyer}
                  onChange={(e) => onPickThumbnail(e.target.files?.[0])}
                  className="block w-full text-xs text-gray-700 file:mr-3 file:py-1.5 file:px-3 file:border file:border-gray-300 file:bg-white file:text-gray-700 hover:file:bg-gray-50 file:cursor-pointer"
                />
                {uploadingThumbnail && (
                  <p className="text-xs text-gray-500 mt-1.5">Uploading thumbnail…</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Flyer PDF (max 25 MB)
                </label>
                <input
                  ref={flyerInputRef}
                  type="file"
                  accept="application/pdf"
                  disabled={busy || uploadingThumbnail || uploadingFlyer}
                  onChange={(e) => onPickFlyer(e.target.files?.[0])}
                  className="block w-full text-xs text-gray-700 file:mr-3 file:py-1.5 file:px-3 file:border file:border-gray-300 file:bg-white file:text-gray-700 hover:file:bg-gray-50 file:cursor-pointer"
                />
                {uploadingFlyer && (
                  <p className="text-xs text-gray-500 mt-1.5">Uploading flyer…</p>
                )}
              </div>
              <p className="text-xs text-gray-500 font-light pt-1">
                The previous file is not deleted from storage automatically.
              </p>
            </div>
          </section>

          <dl className="text-sm space-y-2 border border-gray-200 bg-white px-4 py-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-500 font-medium">Submitted</dt>
              <dd className="text-gray-900">{formatDateTime(row.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-500 font-medium">Kind</dt>
              <dd className="text-gray-900 capitalize">{row.kind}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-500 font-medium">Submitter</dt>
              <dd className="text-gray-900">{row.submittedByName}</dd>
              <dd className="text-gray-600">{row.submittedByEmail}</dd>
              {row.submittedByPhone && <dd className="text-gray-600">{row.submittedByPhone}</dd>}
            </div>
            {row.reviewedAt && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500 font-medium">Last reviewed</dt>
                <dd className="text-gray-900">{formatDateTime(row.reviewedAt)}</dd>
                {row.reviewedBy && <dd className="text-gray-600">by {row.reviewedBy}</dd>}
              </div>
            )}
          </dl>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <section className="border border-gray-200 bg-white px-5 py-5">
            <h2 className="text-sm uppercase tracking-[0.15em] text-gray-500 font-medium mb-3">
              Status
            </h2>
            {row.status === 'pending' && (
              <div className="mb-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => changeStatus('active')}
                  disabled={busy}
                  className="px-4 py-3 text-sm font-semibold border-2 border-green-700 bg-green-700 text-white hover:bg-green-800 hover:border-green-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  &#10003; Approve
                </button>
                <button
                  type="button"
                  onClick={() => changeStatus('rejected')}
                  disabled={busy}
                  className="px-4 py-3 text-sm font-semibold border-2 border-red-700 bg-white text-red-700 hover:bg-red-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  &#10007; Reject
                </button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {STATUS_BUTTONS.map((btn) => {
                const isActive = row.status === btn.value;
                return (
                  <button
                    key={btn.value}
                    type="button"
                    onClick={() => changeStatus(btn.value)}
                    disabled={busy || isActive}
                    className={
                      'px-4 py-2 text-sm font-medium border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ' +
                      (isActive
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-500')
                    }
                  >
                    {btn.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={toggleFeatured}
                disabled={busy || row.status !== 'active'}
                className={
                  'px-4 py-2 text-sm font-medium border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ' +
                  (row.featured
                    ? 'border-[#021D40] bg-[#021D40]/5 text-[#021D40]'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-500')
                }
              >
                {row.featured ? '★ Featured' : '☆ Feature this'}
              </button>
              {row.status !== 'active' && (
                <p className="mt-2 text-xs text-gray-500 font-light">
                  Featured toggle is only available when status is Active.
                </p>
              )}
            </div>
          </section>

          <section className="border border-gray-200 bg-white px-5 py-5">
            <h2 className="text-sm uppercase tracking-[0.15em] text-gray-500 font-medium mb-4">
              Edit details
            </h2>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="builderName" className={labelStyle}>Builder/Developer</label>
                  <input
                    id="builderName"
                    type="text"
                    disabled={busy}
                    value={edit.builderName}
                    onChange={(e) => setEdit({ ...edit, builderName: e.target.value })}
                    className={fieldStyle}
                  />
                </div>
                <div>
                  <label htmlFor="title" className={labelStyle}>Title</label>
                  <input
                    id="title"
                    type="text"
                    disabled={busy}
                    value={edit.title}
                    onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                    className={fieldStyle}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label htmlFor="city" className={labelStyle}>City</label>
                  <input
                    id="city"
                    type="text"
                    disabled={busy}
                    value={edit.city}
                    onChange={(e) => setEdit({ ...edit, city: e.target.value })}
                    className={fieldStyle}
                  />
                </div>
                <div>
                  <label htmlFor="state" className={labelStyle}>State</label>
                  <select
                    id="state"
                    disabled={busy}
                    value={edit.state}
                    onChange={(e) => setEdit({ ...edit, state: e.target.value })}
                    className={fieldStyle}
                  >
                    <option value="">Select state...</option>
                    {US_STATE_CODES.map((code) => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="publication" className={labelStyle}>Publication</label>
                <select
                  id="publication"
                  disabled={busy}
                  value={edit.publication}
                  onChange={(e) => setEdit({ ...edit, publication: e.target.value as Publication })}
                  className={fieldStyle}
                >
                  <option value="both">Both (RealtyLine + Newsline)</option>
                  <option value="realtyline">RealtyLine only</option>
                  <option value="newsline">Newsline only</option>
                </select>
              </div>

              <div>
                <label htmlFor="description" className={labelStyle}>Description</label>
                <textarea
                  id="description"
                  rows={3}
                  disabled={busy}
                  value={edit.description}
                  onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                  className={fieldStyle}
                />
              </div>

              {row.kind === 'listing' && (
                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500 font-medium">
                    Listing details
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="bedsMin" className={labelStyle}>Beds min</label>
                      <input id="bedsMin" type="number" disabled={busy} value={edit.bedsMin} onChange={(e) => setEdit({ ...edit, bedsMin: e.target.value })} className={fieldStyle} />
                    </div>
                    <div>
                      <label htmlFor="bedsMax" className={labelStyle}>Beds max</label>
                      <input id="bedsMax" type="number" disabled={busy} value={edit.bedsMax} onChange={(e) => setEdit({ ...edit, bedsMax: e.target.value })} className={fieldStyle} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="bathsMin" className={labelStyle}>Baths min</label>
                      <input id="bathsMin" type="number" step="0.5" disabled={busy} value={edit.bathsMin} onChange={(e) => setEdit({ ...edit, bathsMin: e.target.value })} className={fieldStyle} />
                    </div>
                    <div>
                      <label htmlFor="bathsMax" className={labelStyle}>Baths max</label>
                      <input id="bathsMax" type="number" step="0.5" disabled={busy} value={edit.bathsMax} onChange={(e) => setEdit({ ...edit, bathsMax: e.target.value })} className={fieldStyle} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="sqftMin" className={labelStyle}>Sqft min</label>
                      <input id="sqftMin" type="number" disabled={busy} value={edit.sqftMin} onChange={(e) => setEdit({ ...edit, sqftMin: e.target.value })} className={fieldStyle} />
                    </div>
                    <div>
                      <label htmlFor="sqftMax" className={labelStyle}>Sqft max</label>
                      <input id="sqftMax" type="number" disabled={busy} value={edit.sqftMax} onChange={(e) => setEdit({ ...edit, sqftMax: e.target.value })} className={fieldStyle} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="priceMin" className={labelStyle}>Price min ($)</label>
                      <input id="priceMin" type="number" disabled={busy} value={edit.priceMin} onChange={(e) => setEdit({ ...edit, priceMin: e.target.value })} className={fieldStyle} />
                    </div>
                    <div>
                      <label htmlFor="priceMax" className={labelStyle}>Price max ($)</label>
                      <input id="priceMax" type="number" disabled={busy} value={edit.priceMax} onChange={(e) => setEdit({ ...edit, priceMax: e.target.value })} className={fieldStyle} />
                    </div>
                  </div>
                </div>
              )}

              {row.kind === 'promotion' && (
                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500 font-medium">
                    Promotion details
                  </p>
                  <div>
                    <label htmlFor="promoType" className={labelStyle}>Promotion type</label>
                    <select
                      id="promoType"
                      disabled={busy}
                      value={edit.promoType}
                      onChange={(e) => setEdit({ ...edit, promoType: e.target.value as PromoType })}
                      className={fieldStyle}
                    >
                      {PROMO_TYPES.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="expiresAt" className={labelStyle}>Expires</label>
                    <input
                      id="expiresAt"
                      type="date"
                      disabled={busy}
                      value={edit.expiresAt ? edit.expiresAt.slice(0, 10) : ''}
                      onChange={(e) => setEdit({ ...edit, expiresAt: e.target.value })}
                      className={fieldStyle}
                    />
                  </div>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={saveEdits}
                  disabled={busy}
                  className="px-6 py-2.5 text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {busy ? 'Saving…' : 'Save edits'}
                </button>
              </div>
            </div>
          </section>

          <section className="border border-red-200 bg-red-50 px-5 py-5 rounded-md">
            <h2 className="text-sm uppercase tracking-[0.15em] text-red-700 font-medium mb-2">
              Danger zone
            </h2>
            <p className="text-sm text-red-900 font-light mb-3">
              Permanently delete this submission. The flyer PDF and thumbnail JPG will be orphaned and can be cleaned up later.
            </p>
            <button
              type="button"
              onClick={deleteRow}
              disabled={busy}
              className="px-4 py-2 text-sm font-medium text-red-900 border border-red-300 bg-white hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Delete submission
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
