'use client';

/**
 * Admin: RealtyLine MLS Reports (Austin / ABoR — Central Texas Housing).
 *
 * Mirror of the SABOR editor — same sectioned form, same EN+ES side-by-side
 * labels, same "Pre-fill labels" button. Differences from SABOR:
 *
 *   - 9 indicator stats (Median Sales Price, Closed Sales, New Listings,
 *     Months of Inventory, Active Listings, Pending Sales, Sales Dollar
 *     Volume, Average Days on Market, Average Close to List Price)
 *   - Listing counts + price bands are optional (ABoR rolls them into
 *     the main indicator grid). The sections render so admins CAN
 *     populate them if a future infographic adds them, but they default
 *     to empty arrays.
 *
 * The most recent row by release date powers the RealtyLine feed card.
 */

import { useEffect, useState } from 'react';
import { useAdmin } from '@/hooks/use-admin';

import PageTitle from '@/components/ui/PageTitle';
import {
  type RealtyLineReport,
  type DeltaDirection,
  type IndicatorStat,
  type ListingCount,
  type PriceBand,
  makeBlankReport,
  translateMonthLabel,
  INDICATOR_PRESETS,
  DEFAULT_SUBTITLE_EN,
  DEFAULT_SUBTITLE_ES,
  DEFAULT_HEADLINE_LABEL_EN,
  DEFAULT_HEADLINE_LABEL_ES,
} from '@/lib/realtyline-mls';

interface ReportRow extends RealtyLineReport {
  id: number;
  created_at?: string;
  updated_at?: string;
}

function blankForm(): RealtyLineReport {
  const today = new Date().toISOString().slice(0, 10);
  return makeBlankReport('', today);
}

export default function RealtyLineMlsAdminPage() {
  const { admin, loading: authLoading } = useAdmin();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<RealtyLineReport>(blankForm());
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string>('');

  async function handleImportGraphic(file: File) {
    setImporting(true);
    setImportMsg('Reading graphic and calling extractor (10-30s)...');
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch('/api/admin/realtyline-mls/import-graphic', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setImportMsg(`Extraction failed: ${data.error ?? 'unknown'}`);
        return;
      }
      const extracted = (data.extracted ?? {}) as {
        month_label?: string;
        released_at?: string;
        subtitle_en?: string;
        headline_value?: string;
        headline_delta?: string;
        headline_delta_direction?: 'up' | 'down' | 'flat';
        headline_label_en?: string;
        indicator_stats?: Array<{ key?: string; value?: string; delta?: string; delta_direction?: 'up' | 'down' | 'flat' }>;
        listing_counts?: Array<{ key?: string; label_en?: string; value?: string; delta?: string; delta_direction?: 'up' | 'down' | 'flat' }>;
      };
      setForm((prev) => {
        const next = { ...prev };
        if (extracted.month_label) {
          next.month_label = extracted.month_label;
          next.month_label_es = translateMonthLabel(extracted.month_label);
        }
        if (extracted.released_at) next.released_at = extracted.released_at;
        if (extracted.subtitle_en) next.subtitle_en = extracted.subtitle_en;
        if (extracted.headline_value) next.headline_value = extracted.headline_value;
        if (extracted.headline_delta) next.headline_delta = extracted.headline_delta;
        if (extracted.headline_delta_direction) next.headline_delta_direction = extracted.headline_delta_direction;
        if (extracted.headline_label_en) next.headline_label_en = extracted.headline_label_en;
        if (Array.isArray(extracted.indicator_stats)) {
          const byKey = new Map(extracted.indicator_stats.map((s) => [s.key, s]));
          next.indicator_stats = next.indicator_stats.map((row) => {
            const m = byKey.get(row.key);
            if (!m) return row;
            return {
              ...row,
              value: m.value ?? row.value,
              delta: m.delta ?? row.delta,
              delta_direction: m.delta_direction ?? row.delta_direction,
            };
          });
        }
        if (Array.isArray(extracted.listing_counts)) next.listing_counts = extracted.listing_counts as typeof next.listing_counts;
        return next;
      });
      setImportMsg('Fields populated from graphic. Review before Save.');
    } catch (err) {
      setImportMsg(`Import error: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setImporting(false);
    }
  }


  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/realtyline-mls', { credentials: 'include', cache: 'no-store' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed to load');
      setReports(json.reports || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading || !admin) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/realtyline-mls', { credentials: 'include', cache: 'no-store' });
        const json = await res.json();
        if (!alive) return;
        if (!json.ok) throw new Error(json.error || 'Failed to load');
        setReports(json.reports || []);
      } catch (e: unknown) {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [authLoading, admin]);

  function startNew() {
    setEditingId(null);
    setForm(blankForm());
  }

  function startEdit(r: ReportRow) {
    setEditingId(r.id);
    const base = makeBlankReport(r.month_label, r.released_at);
    setForm({
      ...base,
      month_label: r.month_label,
      month_label_es: r.month_label_es || translateMonthLabel(r.month_label),
      released_at: r.released_at,
      subtitle_en: r.subtitle_en || DEFAULT_SUBTITLE_EN,
      subtitle_es: r.subtitle_es || DEFAULT_SUBTITLE_ES,
      headline_value: r.headline_value,
      headline_delta: r.headline_delta,
      headline_delta_direction: r.headline_delta_direction,
      headline_label_en: r.headline_label_en || DEFAULT_HEADLINE_LABEL_EN,
      headline_label_es: r.headline_label_es || DEFAULT_HEADLINE_LABEL_ES,
      indicator_stats: r.indicator_stats && r.indicator_stats.length > 0 ? r.indicator_stats : base.indicator_stats,
      listing_counts: Array.isArray(r.listing_counts) ? r.listing_counts : [],
      price_bands: Array.isArray(r.price_bands) ? r.price_bands : [],
      page_count: r.page_count,
      pdf_storage_key: r.pdf_storage_key,
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const url = editingId ? `/api/admin/realtyline-mls?id=${editingId}` : '/api/admin/realtyline-mls';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Save failed');
      await load();
      startNew();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    if (!confirm('Delete this report row? The PDF (if uploaded separately) is unaffected.')) return;
    try {
      const res = await fetch(`/api/admin/realtyline-mls?id=${id}`, { method: 'DELETE', credentials: 'include' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Delete failed');
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  function prefillLabels() {
    setForm((f) => ({
      ...f,
      month_label_es: f.month_label_es || translateMonthLabel(f.month_label),
      subtitle_en: f.subtitle_en || DEFAULT_SUBTITLE_EN,
      subtitle_es: f.subtitle_es || DEFAULT_SUBTITLE_ES,
      headline_label_en: f.headline_label_en || DEFAULT_HEADLINE_LABEL_EN,
      headline_label_es: f.headline_label_es || DEFAULT_HEADLINE_LABEL_ES,
      indicator_stats: INDICATOR_PRESETS.map((p, i) => {
        const cur = f.indicator_stats[i];
        return {
          ...p,
          value: cur?.value || '',
          delta: cur?.delta,
          delta_direction: cur?.delta_direction,
        };
      }),
      // Leave listing_counts + price_bands as-is — RealtyLine usually
      // doesn't populate these; the admin can manually add rows if needed.
    }));
  }

  // ----- per-row updaters ----------------------------------------------------
  function updIndicator(i: number, patch: Partial<IndicatorStat>) {
    setForm((f) => {
      const next = f.indicator_stats.slice();
      next[i] = { ...next[i], ...patch };
      return { ...f, indicator_stats: next };
    });
  }
  function updListing(i: number, patch: Partial<ListingCount>) {
    setForm((f) => {
      const next = f.listing_counts.slice();
      next[i] = { ...next[i], ...patch };
      return { ...f, listing_counts: next };
    });
  }
  function updBand(i: number, patch: Partial<PriceBand>) {
    setForm((f) => {
      const next = f.price_bands.slice();
      next[i] = { ...next[i], ...patch };
      return { ...f, price_bands: next };
    });
  }
  function addListingRow() {
    setForm((f) => ({
      ...f,
      listing_counts: [...f.listing_counts, { key: `listing_${f.listing_counts.length + 1}`, label_en: '', label_es: '', value: '' }],
    }));
  }
  function removeListingRow(i: number) {
    setForm((f) => ({ ...f, listing_counts: f.listing_counts.filter((_, idx) => idx !== i) }));
  }
  function addBandRow() {
    setForm((f) => ({
      ...f,
      price_bands: [...f.price_bands, { key: `band_${f.price_bands.length + 1}`, label_en: '', label_es: '', share: '' }],
    }));
  }
  function removeBandRow(i: number) {
    setForm((f) => ({ ...f, price_bands: f.price_bands.filter((_, idx) => idx !== i) }));
  }

  if (authLoading) {
    return <div className="p-8 text-gray-500">{'Loading\u2026'}</div>;
  }
  if (!admin) {
    return <div className="p-8 text-gray-700">Sign in required.</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-6">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Admin</p>
        <PageTitle size="md">ABOR Report</PageTitle>
        <p className="text-gray-600 mt-2 max-w-2xl">
          Update the monthly Central Texas Housing Market Report (ABoR) that appears on the dashboard and in the
          RealtyLine Austin feed. Captures every field on the official ABoR infographic, with English + Spanish
          labels so the public card can toggle between languages. The most recent row by release date powers the card.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Editor */}
        <div className="lg:col-span-3 space-y-5">
          {/* Header */}
          <div className="bg-white border border-gray-200 rounded-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">{editingId ? `Edit report #${editingId}` : 'New report'}</h2>

              <div className="mb-6 mt-4 rounded-md border border-purple-200 bg-purple-50 p-4">
                <div className="mb-2 text-sm font-semibold text-purple-900">Upload UnlockMLS graphic to autopopulate</div>
                <p className="mb-3 text-xs text-purple-800">
                  Drop a PNG, JPEG, WEBP, or PDF screenshot of the UnlockMLS Sales
                  block. The extractor reads the Sales block only; leases are ignored.
                </p>
                <label className="inline-block cursor-pointer rounded-md bg-purple-700 px-3 py-2 text-sm text-white hover:bg-purple-800">
                  {importing ? 'Extracting\u2026' : 'Choose file'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                    className="hidden"
                    disabled={importing}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleImportGraphic(f);
                      e.target.value = '';
                    }}
                  />
                </label>
                {importMsg && (
                  <div className="mt-2 text-xs text-purple-900">{importMsg}</div>
                )}
              </div>

              <button
                type="button"
                onClick={prefillLabels}
                className="text-xs font-medium px-3 py-1.5 border border-brand-700 text-brand-700 rounded-md hover:bg-brand-700 hover:text-white transition"
              >
                Pre-fill labels (EN + ES)
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <Field label="Month label (English)">
                <input
                  value={form.month_label}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((f) => ({
                      ...f,
                      month_label: v,
                      month_label_es: translateMonthLabel(v),
                    }));
                  }}
                  placeholder="May 2026"
                  className="input"
                />
              </Field>
              <Field label="Month label (Spanish)">
                <input
                  value={form.month_label_es}
                  onChange={(e) => setForm({ ...form, month_label_es: e.target.value })}
                  placeholder="Mayo 2026"
                  className="input"
                />
              </Field>
            </div>

            <Field label="Released at">
              <input
                type="date"
                value={form.released_at}
                onChange={(e) => setForm({ ...form, released_at: e.target.value })}
                className="input"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <Field label="Subtitle (English)">
                <textarea
                  value={form.subtitle_en}
                  onChange={(e) => setForm({ ...form, subtitle_en: e.target.value })}
                  rows={3}
                  className="input"
                />
              </Field>
              <Field label="Subtitle (Spanish)">
                <textarea
                  value={form.subtitle_es}
                  onChange={(e) => setForm({ ...form, subtitle_es: e.target.value })}
                  rows={3}
                  className="input"
                />
              </Field>
            </div>
          </div>

          {/* Headline */}
          <div className="bg-white border border-gray-200 rounded-md p-5">
            <h2 className="font-semibold mb-4">Headline number</h2>

            <div className="grid grid-cols-3 gap-4">
              <Field label="Headline value">
                <input
                  value={form.headline_value}
                  onChange={(e) => setForm({ ...form, headline_value: e.target.value })}
                  placeholder="$1.74B"
                  className="input"
                />
              </Field>
              <Field label="Delta (no glyph)">
                <input
                  value={form.headline_delta}
                  onChange={(e) => setForm({ ...form, headline_delta: e.target.value })}
                  placeholder="2.2%"
                  className="input"
                />
              </Field>
              <Field label="Direction">
                <select
                  value={form.headline_delta_direction}
                  onChange={(e) => setForm({ ...form, headline_delta_direction: e.target.value as DeltaDirection })}
                  className="input"
                >
                  <option value="up">Up</option>
                  <option value="flat">Flat</option>
                  <option value="down">Down</option>
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <Field label="Headline label (English)">
                <input
                  value={form.headline_label_en}
                  onChange={(e) => setForm({ ...form, headline_label_en: e.target.value })}
                  className="input"
                />
              </Field>
              <Field label="Headline label (Spanish)">
                <input
                  value={form.headline_label_es}
                  onChange={(e) => setForm({ ...form, headline_label_es: e.target.value })}
                  className="input"
                />
              </Field>
            </div>
          </div>

          {/* Indicator stats */}
          <div className="bg-white border border-gray-200 rounded-md p-5">
            <h2 className="font-semibold mb-1">Indicator stats</h2>
            <p className="text-xs text-gray-500 mb-4">Median Sales Price, Closed Sales, New Listings, Months of Inventory, Active Listings, Pending Sales, Sales Dollar Volume, Average Days on Market, Average Close to List Price.</p>
            <div className="space-y-3">
              {form.indicator_stats.map((s, i) => (
                <StatRow
                  key={s.key || i}
                  s={s}
                  onChange={(patch) => updIndicator(i, patch)}
                  showDelta
                />
              ))}
            </div>
          </div>

          {/* Listing counts (optional) */}
          <div className="bg-white border border-gray-200 rounded-md p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold">Listing counts (optional)</h2>
              <button
                type="button"
                onClick={addListingRow}
                className="text-xs font-medium px-3 py-1.5 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                + Add row
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">ABoR usually rolls these into the indicator grid above. Leave empty unless the monthly infographic splits them out.</p>
            {form.listing_counts.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No listing-count rows.</p>
            ) : (
              <div className="space-y-3">
                {form.listing_counts.map((s, i) => (
                  <div key={s.key || i} className="flex items-end gap-2">
                    <div className="flex-1">
                      <StatRow s={s} onChange={(patch) => updListing(i, patch)} showDelta />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeListingRow(i)}
                      className="text-xs text-red-600 hover:underline pb-2"
                      aria-label="Remove row"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Price bands (optional) */}
          <div className="bg-white border border-gray-200 rounded-md p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold">Price bands (optional)</h2>
              <button
                type="button"
                onClick={addBandRow}
                className="text-xs font-medium px-3 py-1.5 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                + Add band
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">Share of closed sales by price tier. ABoR publishes this quarterly; leave empty during off months.</p>
            {form.price_bands.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No price bands.</p>
            ) : (
              <div className="space-y-3">
                {form.price_bands.map((b, i) => (
                  <div key={b.key || i} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-4">
                      <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Label EN</p>
                      <input
                        value={b.label_en}
                        onChange={(e) => updBand(i, { label_en: e.target.value })}
                        className="input"
                      />
                    </div>
                    <div className="col-span-4">
                      <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Label ES</p>
                      <input
                        value={b.label_es}
                        onChange={(e) => updBand(i, { label_es: e.target.value })}
                        className="input"
                      />
                    </div>
                    <div className="col-span-2">
                      <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Share</p>
                      <input
                        value={b.share}
                        onChange={(e) => updBand(i, { share: e.target.value })}
                        placeholder="12.40%"
                        className="input"
                      />
                    </div>
                    <div className="col-span-2 pb-2">
                      <button
                        type="button"
                        onClick={() => removeBandRow(i)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer fields + save */}
          <div className="bg-white border border-gray-200 rounded-md p-5">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Page count (optional)">
                <input
                  type="number"
                  value={form.page_count ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, page_count: e.target.value === '' ? null : Number(e.target.value) })
                  }
                  placeholder="1"
                  className="input"
                />
              </Field>
              <Field label="PDF storage key (optional)">
                <input
                  value={form.pdf_storage_key ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, pdf_storage_key: e.target.value || null })
                  }
                  placeholder="abor/central-texas-2026-05.pdf"
                  className="input"
                />
              </Field>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="px-5 py-2.5 bg-brand-700 text-white rounded-md font-medium disabled:opacity-60"
              >
                {saving ? 'Saving\u2026' : editingId ? 'Update report' : 'Create report'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={startNew}
                  className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-md font-medium"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>

        {/* List */}
        <div className="lg:col-span-2">
          <h2 className="font-semibold mb-3">Reports</h2>
          {loading ? (
            <p className="text-gray-500">{'Loading\u2026'}</p>
          ) : reports.length === 0 ? (
            <p className="text-gray-500 italic">No reports yet. Create one to populate the RealtyLine Austin card.</p>
          ) : (
            <ul className="space-y-2">
              {reports.map((r, i) => (
                <li
                  key={r.id}
                  className="border border-gray-200 rounded-md p-3 bg-white flex items-start justify-between gap-3"
                >
                  <div>
                    <p className="font-semibold">
                      {r.month_label}{' '}
                      {i === 0 && <span className="ml-2 text-[10px] uppercase tracking-wider bg-brand-700 text-white px-2 py-0.5 rounded-md">Live</span>}
                    </p>
                    <p className="text-sm text-gray-600">{r.released_at} {'\u00b7'} {r.headline_value} {r.headline_delta}</p>
                    <p className="text-xs text-gray-500 mt-1">{r.headline_label_en || ''}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button onClick={() => startEdit(r)} className="text-sm text-blue-600 hover:underline">Edit</button>
                    <button onClick={() => remove(r.id)} className="text-sm text-red-600 hover:underline">Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <style jsx>{`
        .input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          background: white;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700 block mb-1">{label}</span>
      {children}
    </label>
  );
}

/**
 * Reusable row: EN label / ES label / value / delta / direction.
 */
function StatRow({
  s,
  onChange,
  showDelta,
}: {
  s: IndicatorStat | ListingCount;
  onChange: (patch: Partial<IndicatorStat>) => void;
  showDelta: boolean;
}) {
  return (
    <div className="grid grid-cols-12 gap-2 items-end">
      <div className="col-span-4">
        <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Label EN</p>
        <input
          value={s.label_en}
          onChange={(e) => onChange({ label_en: e.target.value })}
          className="input"
          style={inputStyle}
        />
      </div>
      <div className="col-span-4">
        <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Label ES</p>
        <input
          value={s.label_es}
          onChange={(e) => onChange({ label_es: e.target.value })}
          className="input"
          style={inputStyle}
        />
      </div>
      <div className="col-span-2">
        <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Value</p>
        <input
          value={s.value}
          onChange={(e) => onChange({ value: e.target.value })}
          className="input"
          style={inputStyle}
        />
      </div>
      {showDelta && (
        <>
          <div className="col-span-1">
            <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">{'\u0394'}</p>
            <input
              value={s.delta ?? ''}
              onChange={(e) => onChange({ delta: e.target.value || undefined })}
              placeholder="3.4%"
              className="input"
              style={inputStyle}
            />
          </div>
          <div className="col-span-1">
            <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Dir</p>
            <select
              value={s.delta_direction ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                onChange({ delta_direction: v === '' ? undefined : (v as DeltaDirection) });
              }}
              className="input"
              style={inputStyle}
            >
              <option value=""></option>
              <option value="up">{'\u2191'}</option>
              <option value="down">{'\u2193'}</option>
              <option value="flat">{'\u2014'}</option>
            </select>
          </div>
        </>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: 14,
  background: 'white',
};
