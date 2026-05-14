// caxton-ads-v1
// Campaign create/edit form. Used by /admin/ads/campaigns/new
// and /admin/ads/campaigns/[id]. Mode is determined by whether
// an `initial` prop is passed.

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/admin-api';
import { CreativeUpload } from './CreativeUpload';
import type {
  AdSpace, AdCreative, AdCampaign, AdPublication,
} from './types';
import { ZONE_LABELS, formatSizes } from './types';
import { PUBLICATION_LABELS_WITH_BOTH as PUBLICATION_LABELS } from '@/lib/publications';

interface Props {
  initial?: AdCampaign;  // edit mode if present, create mode if not
}

type CreativeMode = 'existing' | 'upload';

export function CampaignForm({ initial }: Props) {
  const router = useRouter();
  const isEdit = !!initial;

  const [spaces, setSpaces] = useState<AdSpace[]>([]);
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [advertiserName, setAdvertiserName] = useState(initial?.advertiser_name ?? '');
  const [adSpaceSlug, setAdSpaceSlug] = useState(initial?.ad_space_slug ?? '');
  const [creativeId, setCreativeId] = useState(initial?.creative_id ?? '');
  const [publication, setPublication] = useState<AdPublication>(initial?.publication ?? 'both');
  const [startDate, setStartDate] = useState(initial?.start_date ?? '');
  const [endDate, setEndDate] = useState(initial?.end_date ?? '');
  const [priceTotal, setPriceTotal] = useState(initial?.price_total ?? '');
  const [priceNotes, setPriceNotes] = useState(initial?.price_notes ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  // For new-creative inline upload
  const [creativeMode, setCreativeMode] = useState<CreativeMode>(isEdit ? 'existing' : 'upload');
  const [clickUrl, setClickUrl] = useState('');
  const [altText, setAltText] = useState('');

  useEffect(() => {
    Promise.all([
      adminApi.listAdSpaces() as Promise<{ spaces: AdSpace[] }>,
      adminApi.listAdCreatives() as Promise<{ creatives: AdCreative[] }>,
    ])
      .then(([s, c]) => {
        setSpaces(s.spaces);
        setCreatives(c.creatives);
        setLoaded(true);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load form data');
        setLoaded(true);
      });
  }, []);

  // Abort in-flight save when the form unmounts (prevents leaked connections
  // that exhaust Chrome's 6-per-host connection limit).
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function handleCreativeUploaded(c: AdCreative) {
    setCreatives((prev) => [c, ...prev]);
    setCreativeId(c.id);
    setCreativeMode('existing'); // After upload, switch to "existing" with new one selected
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Client-side validation
    if (!advertiserName.trim()) return setError('Advertiser name is required');
    if (!adSpaceSlug) return setError('Ad slot is required');
    if (!creativeId) return setError('Creative is required');
    if (!startDate) return setError('Start date is required');
    if (!endDate) return setError('End date is required');
    if (endDate < startDate) return setError('End date must be on or after start date');

    const priceNum = priceTotal === '' ? null : Number(priceTotal);
    if (priceTotal !== '' && (Number.isNaN(priceNum) || (priceNum as number) < 0)) {
      return setError('Price must be a positive number or blank');
    }

    // Cancel any prior in-flight save (prevents connection-pool exhaustion
    // and double-submits via React StrictMode double-render in production).
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Safety-net timeout — if the request stalls for any reason (browser
    // connection limit, droplet hang, network hiccup), abort + show an error
    // rather than spin "Saving..." forever.
    const timeoutId = setTimeout(() => controller.abort(new Error('Request timed out after 30s')), 30000);

    setSubmitting(true);
    try {
      const payload = {
        advertiser_name: advertiserName.trim(),
        ad_space_slug: adSpaceSlug,
        creative_id: creativeId,
        publication,
        start_date: startDate,
        end_date: endDate,
        price_total: priceNum,
        price_notes: priceNotes.trim() || null,
        notes: notes.trim() || null,
      };
      if (isEdit) {
        await adminApi.updateAdCampaign(initial!.id, payload, controller.signal);
      } else {
        await adminApi.createAdCampaign(payload, controller.signal);
      }
      clearTimeout(timeoutId);
      // Hard navigation — router.push has been hanging, see GOTCHAS.md
      window.location.href = '/admin/ads?tab=campaigns';
    } catch (err) {
      clearTimeout(timeoutId);
      // Ignore aborts caused by the user navigating away or re-submitting
      if (err instanceof DOMException && err.name === 'AbortError') {
        setSubmitting(false);
        return;
      }
      setError(err instanceof Error ? err.message : 'Save failed');
      setSubmitting(false);
    }
  }

  if (!loaded) return <p className="text-gray-700">Loading form...</p>;

  const selectedCreative = creatives.find((c) => c.id === creativeId);

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
          {error}
        </div>
      )}

      {/* Advertiser */}
      <Field label="Advertiser name" required>
        <input
          type="text"
          value={advertiserName}
          onChange={(e) => setAdvertiserName(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder:text-gray-400"
          placeholder="e.g. Champions School"
          required
        />
      </Field>

      {/* Ad slot */}
      <Field label="Ad slot" required>
        <select
          value={adSpaceSlug}
          onChange={(e) => setAdSpaceSlug(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 bg-white"
          required
        >
          <option value="">— Select a slot —</option>
          {spaces.map((s) => (
            <option key={s.slug} value={s.slug}>
              [{ZONE_LABELS[s.zone]}] {s.display_name} — {s.tier}
            </option>
          ))}
        </select>
        {adSpaceSlug && (
          <p className="mt-1 text-xs text-gray-600">
            Sizes: {formatSizes(spaces.find((s) => s.slug === adSpaceSlug)?.sizes_json ?? [])}
          </p>
        )}
      </Field>

      {/* Publication */}
      <Field label="Publication" required>
        <div className="space-y-2">
          {(['both', 'austin', 'san_antonio'] as const).map((pub) => (
            <label key={pub} className="flex items-center gap-2">
              <input
                type="radio"
                name="publication"
                value={pub}
                checked={publication === pub}
                onChange={() => setPublication(pub)}
              />
              <span className="text-gray-900">{PUBLICATION_LABELS[pub]}</span>
            </label>
          ))}
        </div>
      </Field>

      {/* Creative — toggle between existing + upload */}
      <Field label="Creative" required>
        <div className="space-y-3">
          <div className="flex gap-4 text-sm">
            <button
              type="button"
              onClick={() => setCreativeMode('existing')}
              className={`px-3 py-1 rounded-md ${creativeMode === 'existing' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}
            >
              Use existing
            </button>
            <button
              type="button"
              onClick={() => setCreativeMode('upload')}
              className={`px-3 py-1 rounded-md ${creativeMode === 'upload' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}
            >
              Upload new
            </button>
          </div>

          {creativeMode === 'existing' ? (
            <select
              value={creativeId}
              onChange={(e) => setCreativeId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 bg-white"
            >
              <option value="">— Select a creative —</option>
              {creatives.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.advertiser_name} — {c.width}×{c.height} — {c.alt_text || c.blob_url.split('/').pop()}
                </option>
              ))}
            </select>
          ) : (
            <div className="space-y-3 rounded-md border border-gray-200 p-3 bg-gray-50">
              <Field label="Click URL" required>
                <input
                  type="url"
                  value={clickUrl}
                  onChange={(e) => setClickUrl(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder:text-gray-400"
                  placeholder="https://www.advertiser.com/landing"
                />
              </Field>
              <Field label="Alt text (accessibility)">
                <input
                  type="text"
                  value={altText}
                  onChange={(e) => setAltText(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder:text-gray-400"
                  placeholder="e.g. Champions School logo and CE class promo"
                />
              </Field>
              <CreativeUpload
                advertiserName={advertiserName}
                clickUrl={clickUrl}
                altText={altText}
                onUploaded={handleCreativeUploaded}
              />
              <p className="text-xs text-gray-600">
                Fill advertiser name + click URL above before choosing a file.
              </p>
            </div>
          )}

          {selectedCreative && (
            <div className="rounded-md border border-gray-200 p-2 bg-white">
              <p className="text-xs text-gray-600 mb-1">Selected creative:</p>
              <img
                src={selectedCreative.blob_url}
                alt={selectedCreative.alt_text || ''}
                className="max-h-32 max-w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                {selectedCreative.width}×{selectedCreative.height} → {selectedCreative.click_url}
              </p>
            </div>
          )}
        </div>
      </Field>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Start date" required>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900"
            required
          />
        </Field>
        <Field label="End date" required>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900"
            required
          />
        </Field>
      </div>

      {/* Price */}
      <div className="grid grid-cols-3 gap-4">
        <Field label="Price total ($)">
          <input
            type="number"
            step="0.01"
            min="0"
            value={priceTotal}
            onChange={(e) => setPriceTotal(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder:text-gray-400"
            placeholder="e.g. 1200.00"
          />
        </Field>
        <div className="col-span-2">
          <Field label="Price notes">
            <input
              type="text"
              value={priceNotes}
              onChange={(e) => setPriceNotes(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder:text-gray-400"
              placeholder="e.g. Paid quarterly, or trade for sponsorship"
            />
          </Field>
        </div>
      </div>

      {/* Internal notes */}
      <Field label="Internal notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder:text-gray-400"
          placeholder="Anything to remember about this campaign..."
        />
      </Field>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Saving...' : isEdit ? 'Save changes' : 'Create campaign'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md bg-gray-100 px-4 py-2 text-gray-800 font-medium hover:bg-gray-200"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-900 mb-1">
        {label}{required && <span className="text-red-600 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}
