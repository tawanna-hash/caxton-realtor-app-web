'use client';

/**
 * Admin: SABOR MLS Reports (v2 — full SABOR infographic shape + Spanish).
 *
 * The editor mirrors the actual SABOR monthly Market Stats infographic
 * (see May 2026 PDF). Sections:
 *
 *   - Month + release date (EN + ES month label)
 *   - Subtitle (EN + ES)
 *   - Headline number (value + delta + direction + EN/ES label)
 *   - Indicator stats x 8  (Days on Market, Price per SqFt, etc.)
 *   - Listing counts   x 4 (New / Active / Pending / Active Rental)
 *   - Price bands      x 4 ($0-199K / $200-499K / $500-749K / $750K+)
 *
 * Each indicator + listing-count row carries:
 *   value, optional delta + direction, English label, Spanish label.
 *
 * A "Pre-fill labels from preset" button populates all EN+ES labels in one
 * click so the editor just types numbers month over month.
 */

import { useEffect, useState } from 'react';
import { useAdmin } from '@/hooks/use-admin';

import PageTitle from '@/components/ui/PageTitle';
import {
  type SaborReport,
  type DeltaDirection,
  type IndicatorStat,
  type ListingCount,
  type PriceBand,
  makeBlankReport,
  translateMonthLabel,
  INDICATOR_PRESETS,
  LISTING_COUNT_PRESETS,
  PRICE_BAND_PRESETS,
  DEFAULT_SUBTITLE_EN,
  DEFAULT_SUBTITLE_ES,
  DEFAULT_HEADLINE_LABEL_EN,
  DEFAULT_HEADLINE_LABEL_ES,
} from '@/lib/sabor-mls';

interface ReportRow extends SaborReport {
  id: number;
  created_at?: string;
  updated_at?: string;
}

function blankForm(): SaborReport {
  const today = new Date().toISOString().slice(0, 10);
  return makeBlankReport('', today);
}

export default function SaborMlsAdminPage() {
  const { admin, loading: authLoading } = useAdmin();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<SaborReport>(blankForm());
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/sabor-mls', { credentials: 'include', cache: 'no-store' });
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
        const res = await fetch('/api/admin/sabor-mls', { credentials: 'include', cache: 'no-store' });
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
    // Defensive: if a legacy row sneaks in without v2 arrays, fall back to
    // a blank report seeded with the legacy headline.
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
      listing_counts: r.listing_counts && r.listing_counts.length > 0 ? r.listing_counts : base.listing_counts,
      price_bands: r.price_bands && r.price_bands.length > 0 ? r.price_bands : base.price_bands,
      page_count: r.page_count,
      pdf_storage_key: r.pdf_storage_key,
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const url = editingId ? `/api/admin/sabor-mls?id=${editingId}` : '/api/admin/sabor-mls';
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
      const res = await fetch(`/api/admin/sabor-mls?id=${id}`, { method: 'DELETE', credentials: 'include' });
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
      listing_counts: LISTING_COUNT_PRESETS.map((p, i) => {
        const cur = f.listing_counts[i];
        return {
          ...p,
          value: cur?.value || '',
          delta: cur?.delta,
          delta_direction: cur?.delta_direction,
        };
      }),
      price_bands: PRICE_BAND_PRESETS.map((p, i) => {
        const cur = f.price_bands[i];
        return { ...p, share: cur?.share || '' };
      }),
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
        <PageTitle size="md">SABOR Report</PageTitle>
        <p className="text-gray-600 mt-2 max-w-2xl">
          Update the monthly SABOR MLS Summary that appears on the dashboard and in the Newsline San Antonio feed.
          Captures every field on the official SABOR infographic, with English + Spanish labels so the public card can
          toggle between languages. The most recent row by release date powers the card.
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
                  placeholder="$1.16B"
                  className="input"
                />
              </Field>
              <Field label="Delta (no glyph)">
                <input
                  value={form.headline_delta}
                  onChange={(e) => setForm({ ...form, headline_delta: e.target.value })}
                  placeholder="4%"
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
            <p className="text-xs text-gray-500 mb-4">Days on Market, Price/SqFt, Close to List, Months of Inventory, Avg Rental, Total Sales, Avg Price, Median Price.</p>
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

          {/* Listing counts */}
          <div className="bg-white border border-gray-200 rounded-md p-5">
            <h2 className="font-semibold mb-1">Listing counts</h2>
            <p className="text-xs text-gray-500 mb-4">New, Active, Pending, Active Residential Rental.</p>
            <div className="space-y-3">
              {form.listing_counts.map((s, i) => (
                <StatRow
                  key={s.key || i}
                  s={s}
                  onChange={(patch) => updListing(i, patch)}
                  showDelta
                />
              ))}
            </div>
          </div>

          {/* Price bands */}
          <div className="bg-white border border-gray-200 rounded-md p-5">
            <h2 className="font-semibold mb-1">Price bands (% of sales)</h2>
            <p className="text-xs text-gray-500 mb-4">Share of closed sales by price tier.</p>
            <div className="space-y-3">
              {form.price_bands.map((b, i) => (
                <div key={b.key || i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
                    <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Label EN</p>
                    <input
                      value={b.label_en}
                      onChange={(e) => updBand(i, { label_en: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div className="col-span-5">
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
                      placeholder="66.30%"
                      className="input"
                    />
                  </div>
                </div>
              ))}
            </div>
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
                  placeholder="112"
                  className="input"
                />
              </Field>
              <Field label="PDF storage key (optional)">
                <input
                  value={form.pdf_storage_key ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, pdf_storage_key: e.target.value || null })
                  }
                  placeholder="sabor/mls-2026-05.pdf"
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
            <p className="text-gray-500 italic">No reports yet. Create one to populate the Newsline San Antonio card.</p>
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
            <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Δ</p>
            <input
              value={s.delta ?? ''}
              onChange={(e) => onChange({ delta: e.target.value || undefined })}
              placeholder="5%"
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
              <option value="up">↑</option>
              <option value="down">↓</option>
              <option value="flat">—</option>
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
