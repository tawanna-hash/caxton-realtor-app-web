'use client';

// app/admin/crm/LocationsStaffEditor.tsx
//
// Embeddable sub-editor for the CRM drawer that manages an advertiser's
// `advertiser_locations` and `advertiser_staff` rows via dedicated API
// routes. Renders two sections:
//   1) Locations — add / edit / delete office locations
//   2) Staff    — add / edit / delete staff members, assign to N locations

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdvertiserLocation, AdvertiserStaff } from '@/lib/advertisers';
import { formatPhoneInput } from '@/lib/format-phone';

const INPUT = 'w-full px-3 py-2 rounded border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

type Props = {
  advertiserId: number;
  onError?: (msg: string) => void;
};

export default function LocationsStaffEditor({ advertiserId, onError }: Props) {
  const [locations, setLocations] = useState<AdvertiserLocation[]>([]);
  const [staff, setStaff] = useState<AdvertiserStaff[]>([]);
  const [loading, setLoading] = useState(true);

  // Import affordance state (screenshot OR CSV/Excel/XML)
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const reportError = useCallback(
    (msg: string) => {
      if (onError) onError(msg);
      else console.warn('[LocationsStaffEditor]', msg);
    },
    [onError],
  );

  const reload = useCallback(async () => {
    try {
      const [lr, sr] = await Promise.all([
        fetch(`/api/admin/advertisers/${advertiserId}/locations`),
        fetch(`/api/admin/advertisers/${advertiserId}/staff`),
      ]);
      if (lr.ok) {
        const data = await lr.json();
        setLocations(data.locations ?? []);
      }
      if (sr.ok) {
        const data = await sr.json();
        setStaff(data.staff ?? []);
      }
    } catch (err) {
      reportError(err instanceof Error ? err.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, [advertiserId, reportError]);

  // Initial data fetch when the drawer opens. The rule below is designed
  // to catch cascading-render bugs, but a one-shot fetch-on-mount is
  // exactly the kind of "subscribe to external system" use case effects
  // are meant for. Disable for this single line.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reload(); }, [reload]);

  // ── Location CRUD ───────────────────────────────────────────────
  const addLocation = async () => {
    try {
      const res = await fetch(`/api/admin/advertisers/${advertiserId}/locations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          label: 'New location',
          is_primary: locations.length === 0,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await reload();
    } catch (err) {
      reportError(err instanceof Error ? err.message : 'add location failed');
    }
  };

  const patchLocation = async (id: string, patch: Partial<AdvertiserLocation>) => {
    // Optimistic update
    setLocations((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    try {
      const res = await fetch(`/api/admin/advertisers/${advertiserId}/locations/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // If primary flag changed, server may have unset others — reload to sync
      if ('is_primary' in patch) await reload();
    } catch (err) {
      reportError(err instanceof Error ? err.message : 'update location failed');
      await reload();
    }
  };

  const deleteLocation = async (id: string) => {
    if (!confirm('Delete this location? Staff assigned only here will become unassigned.')) return;
    try {
      const res = await fetch(`/api/admin/advertisers/${advertiserId}/locations/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await reload();
    } catch (err) {
      reportError(err instanceof Error ? err.message : 'delete location failed');
    }
  };

  // ── Staff CRUD ──────────────────────────────────────────────────
  const addStaff = async () => {
    try {
      const res = await fetch(`/api/admin/advertisers/${advertiserId}/staff`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'New staff member' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await reload();
    } catch (err) {
      reportError(err instanceof Error ? err.message : 'add staff failed');
    }
  };

  const patchStaff = async (id: string, patch: Partial<AdvertiserStaff>) => {
    setStaff((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    try {
      const res = await fetch(`/api/admin/advertisers/${advertiserId}/staff/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      reportError(err instanceof Error ? err.message : 'update staff failed');
      await reload();
    }
  };

  const deleteStaff = async (id: string) => {
    if (!confirm('Delete this staff member?')) return;
    try {
      const res = await fetch(`/api/admin/advertisers/${advertiserId}/staff/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await reload();
    } catch (err) {
      reportError(err instanceof Error ? err.message : 'delete staff failed');
    }
  };

  // -- Import (screenshot OR CSV/Excel/XML) --------------------
  // Decide which endpoint + form field to use for this file.
  const classifyImportFile = (file: File): {
    endpoint: 'screenshot' | 'data';
    field: 'image' | 'file';
    label: string;
  } | null => {
    const mime = (file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();
    if (mime.startsWith('image/')) {
      return { endpoint: 'screenshot', field: 'image', label: 'screenshot' };
    }
    if (mime.includes('csv') || name.endsWith('.csv')) {
      return { endpoint: 'data', field: 'file', label: 'CSV' };
    }
    if (
      mime.includes('spreadsheetml') ||
      mime.includes('ms-excel') ||
      name.endsWith('.xlsx') ||
      name.endsWith('.xls')
    ) {
      return { endpoint: 'data', field: 'file', label: 'Excel' };
    }
    if (mime.includes('xml') || name.endsWith('.xml')) {
      return { endpoint: 'data', field: 'file', label: 'XML' };
    }
    return null;
  };

  const handleImportFile = useCallback(async (file: File) => {
    if (importing) return;

    const classified = classifyImportFile(file);
    if (!classified) {
      setImportMsg(
        `Import failed: unsupported file type "${file.type || file.name}". Drop a screenshot (PNG/JPEG), CSV, Excel, or XML file.`,
      );
      setTimeout(() => setImportMsg(null), 10_000);
      return;
    }

    setImporting(true);
    setImportMsg(`Reading ${classified.label}...`);
    try {
      const fd = new FormData();
      fd.append(classified.field, file);
      if (classified.endpoint === 'screenshot') {
        setImportMsg('Extracting locations & staff from screenshot (this can take 10-20s)...');
      } else {
        setImportMsg(`Parsing ${classified.label} and inserting rows...`);
      }
      const url =
        classified.endpoint === 'screenshot'
          ? `/api/admin/advertisers/${advertiserId}/import-screenshot`
          : `/api/admin/advertisers/${advertiserId}/import-data`;
      const res = await fetch(url, { method: 'POST', body: fd });

      const rawText = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
      } catch {
        data = { error: rawText.slice(0, 200) || `HTTP ${res.status}` };
      }
      if (!res.ok) {
        const detail =
          typeof data?.detail === 'string' ? (data.detail as string) :
          typeof data?.error  === 'string' ? (data.error  as string) :
          `HTTP ${res.status}`;
        throw new Error(`${res.status} - ${detail}`);
      }
      const ins = (data?.inserted ?? {}) as { locations?: number; staff?: number };
      const locCount = Number(ins.locations ?? 0);
      const staffCount = Number(ins.staff ?? 0);
      setImportMsg(
        `Imported ${locCount} location${locCount === 1 ? '' : 's'} and ${staffCount} staff member${staffCount === 1 ? '' : 's'} from ${classified.label}.`,
      );
      await reload();
      setTimeout(() => setImportMsg(null), 5_000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'import failed';
      setImportMsg(`Import failed: ${msg}`);
      setTimeout(() => setImportMsg(null), 10_000);
    } finally {
      setImporting(false);
    }
  }, [advertiserId, importing, reload]);

  const onPickImportFile = () => {
    if (importing) return;
    fileInputRef.current?.click();
  };

  const onImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    await handleImportFile(file);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (importing) return;
    if (e.dataTransfer.types.includes('Files')) setDragOver(true);
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (importing) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await handleImportFile(file);
  };

  const toggleStaffLocation = async (staffId: string, locationId: string) => {
    const current = staff.find((s) => s.id === staffId);
    if (!current) return;
    const next = current.location_ids.includes(locationId)
      ? current.location_ids.filter((x) => x !== locationId)
      : [...current.location_ids, locationId];
    await patchStaff(staffId, { location_ids: next });
  };

  if (loading) {
    return <div className="text-xs text-gray-500">Loading locations & staff…</div>;
  }

  return (
    <div className="space-y-6">
      {/* Hidden file input shared by the import drop-zone */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,text/csv,.csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/xml,application/xml,.xml"
        onChange={onImportFileChange}
        className="hidden"
      />

      {/* Drag-and-drop import affordance */}
      <div
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onPickImportFile}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onPickImportFile();
          }
        }}
        className={`rounded-lg border-2 border-dashed px-4 py-5 text-center cursor-pointer transition-colors ${
          importing
            ? 'border-gray-200 bg-gray-100 cursor-wait'
            : dragOver
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 bg-gray-50/60 hover:border-gray-400 hover:bg-gray-100'
        }`}
      >
        <div className="flex flex-col items-center gap-1.5 pointer-events-none">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={importing ? 'text-gray-400' : dragOver ? 'text-blue-600' : 'text-gray-500'}
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <div className="text-sm font-medium text-gray-800">
            {importing ? 'Importing...' : 'Drop a file or click to upload'}
          </div>
          <div className="text-xs text-gray-500">
            Screenshot (PNG, JPEG), CSV, Excel (.xlsx/.xls), or XML &mdash; we&apos;ll auto-fill locations &amp; staff.
          </div>
        </div>
      </div>
      {importMsg && (
        <div
          className={`text-xs px-3 py-2 rounded ${
            importMsg.startsWith('Import failed')
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}
        >
          {importMsg}
        </div>
      )}

      {/* ── Locations ─────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium">
            Locations
          </div>
          <button
            onClick={addLocation}
            type="button"
            className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            + Add location
          </button>
        </div>

        {locations.length === 0 && (
          <div className="text-xs text-gray-500 italic">
            No locations yet. The mailing address above will be used as the default.
          </div>
        )}

        <div className="space-y-3">
          {locations.map((loc) => (
            <div
              key={loc.id}
              className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 space-y-2"
            >
              <div className="flex items-center gap-2">
                <input
                  value={loc.label ?? ''}
                  onChange={(e) => patchLocation(loc.id, { label: e.target.value })}
                  placeholder="Label (e.g. Houston Office)"
                  className={`${INPUT} flex-1`}
                />
                <label className="flex items-center gap-1 text-xs text-gray-700 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={loc.is_primary}
                    onChange={(e) => patchLocation(loc.id, { is_primary: e.target.checked })}
                  />
                  Primary / HQ
                </label>
                <button
                  onClick={() => deleteLocation(loc.id)}
                  type="button"
                  className="text-xs text-red-600 hover:text-red-800 px-2"
                  aria-label="Delete location"
                >
                  ×
                </button>
              </div>
              <input
                value={loc.address ?? ''}
                onChange={(e) => patchLocation(loc.id, { address: e.target.value })}
                placeholder="Street address"
                className={INPUT}
              />
              <input
                value={loc.address_2 ?? ''}
                onChange={(e) => patchLocation(loc.id, { address_2: e.target.value })}
                placeholder="Suite / floor (optional)"
                className={INPUT}
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  value={loc.city ?? ''}
                  onChange={(e) => patchLocation(loc.id, { city: e.target.value })}
                  placeholder="City"
                  className={INPUT}
                />
                <input
                  value={loc.state ?? ''}
                  onChange={(e) => patchLocation(loc.id, { state: e.target.value })}
                  placeholder="State"
                  className={INPUT}
                />
                <input
                  value={loc.zip ?? ''}
                  onChange={(e) => patchLocation(loc.id, { zip: e.target.value })}
                  placeholder="ZIP"
                  className={INPUT}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={loc.phone ?? ''}
                  onChange={(e) => patchLocation(loc.id, { phone: formatPhoneInput(e.target.value) })}
                  placeholder="(000) 000-0000"
                  inputMode="tel"
                  className={INPUT}
                />
                <input
                  value={loc.email ?? ''}
                  onChange={(e) => patchLocation(loc.id, { email: e.target.value })}
                  placeholder="Office email"
                  className={INPUT}
                />
              </div>
              <input
                value={loc.hours ?? ''}
                onChange={(e) => patchLocation(loc.id, { hours: e.target.value })}
                placeholder="Hours (e.g. Mon–Fri 9am–6pm)"
                className={INPUT}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── Staff ───────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium">
            Staff
          </div>
          <button
            onClick={addStaff}
            type="button"
            className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            + Add staff
          </button>
        </div>

        {staff.length === 0 && (
          <div className="text-xs text-gray-500 italic">
            No staff members yet.
          </div>
        )}

        <div className="space-y-3">
          {staff.map((s) => (
            <div
              key={s.id}
              className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 space-y-2"
            >
              <div className="flex items-center gap-2">
                <input
                  value={s.name}
                  onChange={(e) => patchStaff(s.id, { name: e.target.value })}
                  placeholder="Full name"
                  className={`${INPUT} flex-1 font-medium`}
                />
                <button
                  onClick={() => deleteStaff(s.id)}
                  type="button"
                  className="text-xs text-red-600 hover:text-red-800 px-2"
                  aria-label="Delete staff"
                >
                  ×
                </button>
              </div>
              <input
                value={s.title ?? ''}
                onChange={(e) => patchStaff(s.id, { title: e.target.value })}
                placeholder="Title (e.g. Sales Manager)"
                className={INPUT}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={s.email ?? ''}
                  onChange={(e) => patchStaff(s.id, { email: e.target.value })}
                  placeholder="Email"
                  className={INPUT}
                />
                <input
                  value={s.phone ?? ''}
                  onChange={(e) => patchStaff(s.id, { phone: formatPhoneInput(e.target.value) })}
                  placeholder="(000) 000-0000"
                  inputMode="tel"
                  className={INPUT}
                />
              </div>
              <input
                value={s.photo_url ?? ''}
                onChange={(e) => patchStaff(s.id, { photo_url: e.target.value })}
                placeholder="Photo URL (https://…)"
                className={INPUT}
              />

              {locations.length > 0 && (
                <div className="pt-1">
                  <div className="text-xs text-gray-600 mb-1">Assigned to location(s)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {locations.map((loc) => {
                      const checked = s.location_ids.includes(loc.id);
                      return (
                        <button
                          key={loc.id}
                          type="button"
                          onClick={() => toggleStaffLocation(s.id, loc.id)}
                          className={`text-xs px-2 py-1 rounded border ${
                            checked
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {loc.label || loc.city || 'Unnamed'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
