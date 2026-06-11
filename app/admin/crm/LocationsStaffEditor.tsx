'use client';

// app/admin/crm/LocationsStaffEditor.tsx
//
// Embeddable sub-editor for the CRM drawer that manages an advertiser's
// `advertiser_locations` and `advertiser_staff` rows via dedicated API
// routes. Renders two sections:
//   1) Locations — add / edit / delete office locations
//   2) Staff    — add / edit / delete staff members, assign to N locations

import { useCallback, useEffect, useState } from 'react';
import type { AdvertiserLocation, AdvertiserStaff } from '@/lib/advertisers';

const INPUT = 'w-full px-3 py-2 rounded border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

type Props = {
  advertiserId: number;
  onError?: (msg: string) => void;
};

export default function LocationsStaffEditor({ advertiserId, onError }: Props) {
  const [locations, setLocations] = useState<AdvertiserLocation[]>([]);
  const [staff, setStaff] = useState<AdvertiserStaff[]>([]);
  const [loading, setLoading] = useState(true);

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
                  onChange={(e) => patchLocation(loc.id, { phone: e.target.value })}
                  placeholder="Office phone"
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
                  onChange={(e) => patchStaff(s.id, { phone: e.target.value })}
                  placeholder="Direct phone"
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
