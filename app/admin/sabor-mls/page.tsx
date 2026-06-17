'use client';

/**
 * Admin: SABOR MLS Reports
 *
 * Manages the monthly SABOR MLS Summary Report card that shows in the
 * Newsline San Antonio feed. Most recent row (by released_at) is what the feed displays.
 *
 * Editor controls:
 *   - month_label              "April 2026"
 *   - released_at              date the report was published
 *   - headline_value           "$1.16B"
 *   - headline_delta           "▲ 4%"
 *   - headline_delta_direction up | down | flat (drives color)
 *   - headline_label           "Closed dollar volume · single family · YoY"
 *   - mini_stats[4]            value + label pairs
 *   - page_count               optional (shown in card footer)
 *   - pdf_storage_key          optional pointer to the PDF (S3 key); leave
 *                              blank until file upload is wired
 */

import { useEffect, useState } from 'react';
import { useAdmin } from '@/hooks/use-admin';

type Direction = 'up' | 'down' | 'flat';
type MiniStat = { value: string; label: string };

interface Report {
  id: number;
  month_label: string;
  released_at: string;
  headline_value: string;
  headline_delta: string;
  headline_delta_direction: Direction;
  headline_label: string;
  mini_stats: MiniStat[];
  page_count: number | null;
  pdf_storage_key: string | null;
  created_at?: string;
  updated_at?: string;
}

const BLANK_FORM: Omit<Report, 'id'> = {
  month_label: '',
  released_at: new Date().toISOString().slice(0, 10),
  headline_value: '',
  headline_delta: '',
  headline_delta_direction: 'up',
  headline_label: '',
  mini_stats: [
    { value: '', label: '' },
    { value: '', label: '' },
    { value: '', label: '' },
    { value: '', label: '' },
  ],
  page_count: null,
  pdf_storage_key: null,
};

export default function SaborMlsAdminPage() {
  const { admin, loading: authLoading } = useAdmin();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Omit<Report, 'id'>>(BLANK_FORM);
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

  // Subscribe-on-mount pattern: kick off the fetch once auth is ready.
  // The fetch's own then-chain calls setState; the effect body itself does not.
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
    setForm(BLANK_FORM);
  }

  function startEdit(r: Report) {
    setEditingId(r.id);
    setForm({
      month_label: r.month_label,
      released_at: r.released_at,
      headline_value: r.headline_value,
      headline_delta: r.headline_delta,
      headline_delta_direction: r.headline_delta_direction,
      headline_label: r.headline_label,
      mini_stats: r.mini_stats.length === 4 ? r.mini_stats : BLANK_FORM.mini_stats,
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

  function updateMini(idx: number, key: 'value' | 'label', value: string) {
    setForm((f) => {
      const next = f.mini_stats.slice();
      next[idx] = { ...next[idx], [key]: value };
      return { ...f, mini_stats: next };
    });
  }

  if (authLoading) {
    return <div className="p-8 text-gray-500">Loading\u2026</div>;
  }
  if (!admin) {
    return <div className="p-8 text-gray-700">Sign in required.</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-6">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Admin</p>
        <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>
          SABOR MLS Reports
        </h1>
        <p className="text-gray-600 mt-2 max-w-2xl">
          The most recent row by release date powers the gated card in the Newsline San Antonio feed.
          Hero placement runs for 7 days from release, then the card demotes to inline placement.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Editor */}
        <div className="lg:col-span-3 bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold mb-4">{editingId ? `Edit report #${editingId}` : 'New report'}</h2>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <Field label="Month label">
              <input
                value={form.month_label}
                onChange={(e) => setForm({ ...form, month_label: e.target.value })}
                placeholder="April 2026"
                className="input"
              />
            </Field>
            <Field label="Released at">
              <input
                type="date"
                value={form.released_at}
                onChange={(e) => setForm({ ...form, released_at: e.target.value })}
                className="input"
              />
            </Field>
          </div>

          <Field label="Headline label (shown above the big number)">
            <input
              value={form.headline_label}
              onChange={(e) => setForm({ ...form, headline_label: e.target.value })}
              placeholder="Closed dollar volume \u00b7 single family \u00b7 YoY"
              className="input"
            />
          </Field>

          <div className="grid grid-cols-3 gap-4 mt-4">
            <Field label="Headline value">
              <input
                value={form.headline_value}
                onChange={(e) => setForm({ ...form, headline_value: e.target.value })}
                placeholder="$1.16B"
                className="input"
              />
            </Field>
            <Field label="Headline delta">
              <input
                value={form.headline_delta}
                onChange={(e) => setForm({ ...form, headline_delta: e.target.value })}
                placeholder="\u25B2 4%"
                className="input"
              />
            </Field>
            <Field label="Direction">
              <select
                value={form.headline_delta_direction}
                onChange={(e) => setForm({ ...form, headline_delta_direction: e.target.value as Direction })}
                className="input"
              >
                <option value="up">Up (green)</option>
                <option value="flat">Flat (gray)</option>
                <option value="down">Down (red)</option>
              </select>
            </Field>
          </div>

          <div className="mt-5">
            <p className="text-sm font-medium text-gray-700 mb-2">4 supporting stats</p>
            <div className="grid grid-cols-2 gap-3">
              {form.mini_stats.map((m, i) => (
                <div key={i} className="p-3 border border-gray-200 rounded">
                  <input
                    value={m.value}
                    onChange={(e) => updateMini(i, 'value', e.target.value)}
                    placeholder="$307K"
                    className="input mb-2"
                  />
                  <input
                    value={m.label}
                    onChange={(e) => updateMini(i, 'label', e.target.value)}
                    placeholder="Median Price"
                    className="input"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-5">
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
                placeholder="sabor/mls-2026-04.pdf"
                className="input"
              />
            </Field>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="px-5 py-2.5 bg-[#874F80] text-white rounded font-medium disabled:opacity-60"
            >
              {saving ? 'Saving\u2026' : editingId ? 'Update report' : 'Create report'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={startNew}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded font-medium"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="lg:col-span-2">
          <h2 className="font-semibold mb-3">Reports</h2>
          {loading ? (
            <p className="text-gray-500">Loading\u2026</p>
          ) : reports.length === 0 ? (
            <p className="text-gray-500 italic">No reports yet. Create one to populate the Newsline San Antonio card.</p>
          ) : (
            <ul className="space-y-2">
              {reports.map((r, i) => (
                <li
                  key={r.id}
                  className="border border-gray-200 rounded p-3 bg-white flex items-start justify-between gap-3"
                >
                  <div>
                    <p className="font-semibold">
                      {r.month_label}{' '}
                      {i === 0 && <span className="ml-2 text-[10px] uppercase tracking-wider bg-[#874F80] text-white px-2 py-0.5 rounded">Live</span>}
                    </p>
                    <p className="text-sm text-gray-600">{r.released_at} \u00b7 {r.headline_value} {r.headline_delta}</p>
                    <p className="text-xs text-gray-500 mt-1">{r.headline_label}</p>
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
