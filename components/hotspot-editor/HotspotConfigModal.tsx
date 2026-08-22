// components/hotspot-editor/HotspotConfigModal.tsx
//
// Modal for editing one hotspot's type, config, label, advertiser, and
// published state.
//
// Phase 6: the free-text "Advertiser name" input was replaced with a real
// AdvertiserPicker. The picker lists existing advertisers from
// /api/admin/advertisers/picker, lets the editor select one (setting
// hotspot.advertiser_id immediately so click tracking/reports work), and
// has an inline "+ New advertiser…" form that POSTs to
// /api/admin/advertisers and re-selects the new row.
//
// advertiser_name is still kept in sync with the selected advertiser's
// display name for backward compatibility with any code that still reads
// the legacy column. If no advertiser is selected, advertiser_name is
// left alone — that preserves legacy free-text from older imports.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import type { Hotspot, HotspotType, HotspotConfig } from '@/lib/hotspots';
import { defaultConfigForType, TYPE_LABELS } from '@/lib/hotspot-editor-helpers';

type PickerAdvertiser = {
  id: number;
  name: string;
  slug: string;
  publication: 'austin' | 'san_antonio' | 'both';
};

interface Props {
  hotspot: Hotspot;
  onSave: (updates: {
    type?: HotspotType;
    config?: HotspotConfig;
    label?: string;
    advertiser_name?: string;
    advertiser_id?: number | null;
    is_published?: boolean;
  }) => Promise<void>;
  onClose: () => void;
  onRequestDelete: () => void;
  /** Default publication for the inline "+ New advertiser" form. */
  defaultPublication?: 'austin' | 'san_antonio' | 'both';
}

export default function HotspotConfigModal({
  hotspot, onSave, onClose, onRequestDelete, defaultPublication = 'austin',
}: Props) {
  const [type, setType] = useState<HotspotType>(hotspot.type);
  const [config, setConfig] = useState<HotspotConfig>(hotspot.config);
  const [label, setLabel] = useState(hotspot.label ?? '');
  const [advertiserId, setAdvertiserId] = useState<number | null>(hotspot.advertiser_id ?? null);
  const [advertiserName, setAdvertiserName] = useState(hotspot.advertiser_name ?? '');
  const [isPublished, setIsPublished] = useState(hotspot.is_published);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When type changes, reset config to default for new type.
  const changeType = (newType: HotspotType) => {
    setType(newType);
    setConfig(defaultConfigForType(newType));
  };

  // Trap focus once on mount, restore on unmount, support escape.
  // We deliberately keep the dep array empty and read the latest onClose
  // through a ref so parent re-renders (e.g. the 10s Saved-indicator
  // ticker) don't refire this effect and steal focus from the input the
  // editor is typing into. Prior behaviour was a `[onClose]` dep, which
  // caused `dialogRef.current.focus()` to yank focus off the active
  // input every parent render — the "jumpy fields" bug.
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prevFocus?.focus?.();
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        type,
        config,
        label: label.trim() || undefined,
        // advertiser_name stays in sync with the selected advertiser's display
        // name when one is linked. When not linked, we still pass whatever's
        // in the state field — preserves legacy PDF-imported strings.
        advertiser_name: advertiserName.trim() || undefined,
        advertiser_id: advertiserId,
        is_published: isPublished,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setSaving(false);
    }
  };

  // Picker callback: when the editor picks (or creates) an advertiser, update
  // both id and name so they stay in sync. When they explicitly choose "— None —",
  // clear the id but keep advertiser_name (in case it's legacy data the editor
  // wants to retain).
  const handleAdvertiserChange = useCallback((adv: PickerAdvertiser | null) => {
    if (adv) {
      setAdvertiserId(adv.id);
      setAdvertiserName(adv.name);
    } else {
      setAdvertiserId(null);
    }
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="bg-white rounded-md shadow-xl max-w-2xl w-full my-8 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Configure hotspot</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <span className="sr-only">Close</span>
            <svg width={20} height={20} viewBox="0 0 20 20" fill="currentColor"><path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/></svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Type picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {(['link', 'video', 'image', 'phone', 'email', 'form', 'mls', 'audio', 'reveal'] as HotspotType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => changeType(t)}
                  className={`px-3 py-2 text-sm rounded-md border ${type === t ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Per-type config */}
          <div className="border-t border-gray-100 pt-4">
            <TypeSpecificForm type={type} config={config} onChange={setConfig} onError={setError} />
          </div>

          {/* Common fields */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Label (optional)</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Chicago Title — Stacy Turchiano"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
              />
              <p className="text-xs text-gray-500 mt-1">Shown to admins and as aria-label for accessibility. Not displayed to public readers.</p>
            </div>

            {/* Phase 6: real advertiser picker (replaces the old free-text input).
                Wires hotspot.advertiser_id immediately so click tracking and
                advertiser reports link up without a 5-minute backfill wait. */}
            <AdvertiserPicker
              selectedId={advertiserId}
              legacyName={advertiserName}
              defaultPublication={defaultPublication}
              onChange={handleAdvertiserChange}
              onError={setError}
            />

            <label className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
              />
              <span className="text-sm text-gray-700"><strong>Publish</strong> — show to public readers</span>
            </label>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onRequestDelete}
            className="px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 rounded-md"
          >
            Delete hotspot
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// AdvertiserPicker — dropdown of existing advertisers with an
// inline "+ New advertiser…" form. Phase 6.
// ============================================================
function AdvertiserPicker({
  selectedId, legacyName, defaultPublication, onChange, onError,
}: {
  selectedId: number | null;
  legacyName: string;
  defaultPublication: 'austin' | 'san_antonio' | 'both';
  onChange: (adv: PickerAdvertiser | null) => void;
  onError: (err: string | null) => void;
}) {
  const [advertisers, setAdvertisers] = useState<PickerAdvertiser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPublication, setNewPublication] = useState<'austin' | 'san_antonio' | 'both'>(defaultPublication);
  const [newEmail, setNewEmail] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/advertisers/picker', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load advertisers');
        const data = await res.json() as { advertisers: PickerAdvertiser[] };
        if (!cancelled) setAdvertisers(data.advertisers ?? []);
      } catch (err) {
        if (!cancelled) onError(err instanceof Error ? err.message : 'Failed to load advertisers');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // We deliberately omit onError from deps — it's referentially unstable
    // and re-running this effect would re-fetch and reset selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = (value: string) => {
    if (value === '') {
      onChange(null);
    } else {
      const id = Number(value);
      const adv = advertisers.find((a) => a.id === id) ?? null;
      onChange(adv);
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      onError('Advertiser name is required');
      return;
    }
    setCreating(true);
    onError(null);
    try {
      const res = await fetch('/api/admin/advertisers', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          publication: newPublication,
          contact_email: newEmail.trim() || undefined,
          requires_email_gate: false,
        }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
        throw new Error(errBody.detail ?? errBody.error ?? 'Failed to create advertiser');
      }
      const data = (await res.json()) as { advertiser?: PickerAdvertiser };
      const created = data.advertiser;
      if (!created) throw new Error('No advertiser returned');
      setAdvertisers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      onChange(created);
      setShowNewForm(false);
      setNewName('');
      setNewEmail('');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  // Legacy hint: if advertiser_name has free-text data but no advertiser is linked
  // (typical for PDF-imported hotspots before Phase 6), surface it as a hint so
  // the editor knows what to look for in the dropdown.
  const showLegacyHint = selectedId === null && legacyName.trim().length > 0;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Partner</label>
      <select
        value={selectedId === null ? '' : String(selectedId)}
        onChange={(e) => handleSelect(e.target.value)}
        disabled={loading}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-white"
      >
        <option value="">— None —</option>
        {advertisers.map((a) => (
          <option key={a.id} value={String(a.id)}>
            {a.name} {a.publication === 'san_antonio' ? '(Newsline San Antonio)' : a.publication === 'both' ? '(Both)' : '(RealtyLine)'}
          </option>
        ))}
      </select>

      <div className="mt-1 flex items-start justify-between gap-2">
        <p className="text-xs text-gray-500 flex-1">
          {showLegacyHint ? (
            <>Legacy text: <em>{legacyName}</em>. Pick an advertiser above (or create one) to link click tracking and reports.</>
          ) : (
            'Used for advertiser performance reports and dashboard access.'
          )}
        </p>
        {!showNewForm && (
          <button
            type="button"
            onClick={() => setShowNewForm(true)}
            className="text-xs text-blue-600 hover:underline whitespace-nowrap"
          >
            + New advertiser…
          </button>
        )}
      </div>

      {showNewForm && (
        <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-md space-y-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Chicago Title"
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Publication</label>
              <select
                value={newPublication}
                onChange={(e) => setNewPublication(e.target.value as 'austin' | 'san_antonio' | 'both')}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white"
              >
                <option value="austin">RealtyLine Austin</option>
                <option value="san_antonio">Newsline San Antonio</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Contact email</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="ads@example.com"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setShowNewForm(false); setNewName(''); setNewEmail(''); }}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:opacity-40"
            >
              {creating ? 'Creating…' : 'Create + link'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


// ============================================================
// Per-type config form. Co-located for now; extract per-type
// if any one grows past ~40 lines.
// ============================================================
function TypeSpecificForm({
  type, config, onChange, onError,
}: {
  type: HotspotType;
  config: HotspotConfig;
  onChange: (cfg: HotspotConfig) => void;
  onError: (err: string | null) => void;
}) {
  if (type === 'link' && config.type === 'link') {
    return (
      <div className="space-y-3">
        <Field label="URL" required>
          <input
            type="url"
            value={config.url}
            onChange={(e) => onChange({ ...config, url: e.target.value })}
            placeholder="https://example.com"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
          />
        </Field>
        <Field label="Open in">
          <select
            value={config.open_in ?? 'new_tab'}
            onChange={(e) => onChange({ ...config, open_in: e.target.value as 'new_tab' | 'same_tab' })}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
          >
            <option value="new_tab">New tab (recommended)</option>
            <option value="same_tab">Same tab</option>
          </select>
        </Field>
      </div>
    );
  }

  if (type === 'mls' && config.type === 'mls') {
    return (
      <div className="space-y-3">
        <Field label="MLS listing URL" required>
          <input
            type="url"
            value={config.url}
            onChange={(e) => onChange({ ...config, url: e.target.value })}
            placeholder="https://matrix.unlockmls.com/..."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
          />
        </Field>
        <Field label="Address (optional)">
          <input
            type="text"
            value={config.address ?? ''}
            onChange={(e) => onChange({ ...config, address: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
          />
        </Field>
        <Field label="Price (optional)">
          <input
            type="text"
            value={config.price ?? ''}
            onChange={(e) => onChange({ ...config, price: e.target.value })}
            placeholder="$1,250,000"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
          />
        </Field>
      </div>
    );
  }

  if (type === 'phone' && config.type === 'phone') {
    return (
      <div className="space-y-3">
        <Field label="Phone number" required>
          <input
            type="tel"
            value={config.number}
            onChange={(e) => onChange({ ...config, number: e.target.value })}
            placeholder="+15125551234"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
          />
          <p className="text-xs text-gray-500 mt-1">Use E.164 format (+1 followed by digits) for best results on all devices.</p>
        </Field>
        <Field label="Display label (optional)">
          <input
            type="text"
            value={config.label ?? ''}
            onChange={(e) => onChange({ ...config, label: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
          />
        </Field>
      </div>
    );
  }

  if (type === 'email' && config.type === 'email') {
    return (
      <div className="space-y-3">
        <Field label="Email address" required>
          <input
            type="email"
            value={config.address}
            onChange={(e) => onChange({ ...config, address: e.target.value })}
            placeholder="agent@example.com"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
          />
        </Field>
        <Field label="Subject (optional)">
          <input
            type="text"
            value={config.subject ?? ''}
            onChange={(e) => onChange({ ...config, subject: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
          />
        </Field>
        <Field label="Body (optional)">
          <textarea
            value={config.body ?? ''}
            onChange={(e) => onChange({ ...config, body: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
          />
        </Field>
      </div>
    );
  }

  if ((type === 'video' || type === 'audio') && (config.type === 'video' || config.type === 'audio')) {
    return (
      <div className="space-y-3">
        <Field label="Source">
          <div className="inline-flex rounded-md border border-gray-300">
            <button
              type="button"
              onClick={() => onChange({ ...config, source: 'embed', upload_url: undefined })}
              className={`px-3 py-1.5 text-sm rounded-md ${config.source === 'embed' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700'}`}
            >
              Embed URL
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...config, source: 'upload', embed_url: undefined })}
              className={`px-3 py-1.5 text-sm border-l border-gray-300 ${config.source === 'upload' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700'}`}
            >
              Upload file
            </button>
          </div>
        </Field>

        {config.source === 'embed' && (
          <Field label="Embed URL" required>
            <input
              type="url"
              value={config.embed_url ?? ''}
              onChange={(e) => onChange({ ...config, embed_url: e.target.value })}
              placeholder={type === 'video' ? 'https://www.youtube.com/embed/...' : 'https://soundcloud.com/...'}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
            />
            <p className="text-xs text-gray-500 mt-1">
              {type === 'video'
                ? 'YouTube or Vimeo embed URL works best. Use the share → embed code → src URL.'
                : 'SoundCloud, Spotify, or direct .mp3 URL.'}
            </p>
          </Field>
        )}

        {config.source === 'upload' && (
          <Field label="Upload file" required>
            <BlobUpload
              currentUrl={config.upload_url}
              accept={type === 'video' ? 'video/*' : 'audio/*'}
              pathnamePrefix={type === 'video' ? 'hotspot-video' : 'hotspot-audio'}
              onUploaded={(url) => onChange({ ...config, upload_url: url })}
              onError={onError}
            />
          </Field>
        )}
      </div>
    );
  }

  if (type === 'image' && config.type === 'image') {
    return (
      <div className="space-y-3">
        <Field label="Images">
          <BlobUpload
            currentUrl={null}
            accept="image/*"
            pathnamePrefix="hotspot-image"
            onUploaded={(url) => onChange({ ...config, images: [...config.images, { url }] })}
            onError={onError}
          />
          <div className="mt-3 grid grid-cols-3 gap-2">
            {config.images.map((img, i) => (
              <div key={i} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" className="w-full h-20 object-cover rounded-md border border-gray-200" />
                <button
                  type="button"
                  onClick={() => onChange({ ...config, images: config.images.filter((_, j) => j !== i) })}
                  className="absolute top-1 right-1 px-1.5 py-0.5 text-xs bg-white border border-gray-300 rounded-md opacity-0 group-hover:opacity-100"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </Field>
      </div>
    );
  }

  if (type === 'form' && config.type === 'form') {
    return (
      <div className="space-y-3">
        <Field label="Fields to collect">
          <div className="space-y-2">
            {['name', 'email', 'phone', 'message'].map((field) => (
              <label key={field} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={config.fields.includes(field)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...config.fields, field]
                      : config.fields.filter((f) => f !== field);
                    onChange({ ...config, fields: next });
                  }}
                />
                <span className="text-sm text-gray-700 capitalize">{field}</span>
              </label>
            ))}
          </div>
        </Field>
        <Field label="Form ID (optional)">
          <input
            type="text"
            value={config.form_id ?? ''}
            onChange={(e) => onChange({ ...config, form_id: e.target.value })}
            placeholder="lead-capture-may-2026"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
          />
        </Field>
      </div>
    );
  }

  if (type === 'reveal' && config.type === 'reveal') {
    return (
      <div className="space-y-3">
        <Field label="Media URL or upload" required>
          <BlobUpload
            currentUrl={config.media_url}
            accept="image/*,video/*"
            pathnamePrefix="hotspot-reveal"
            onUploaded={(url) => onChange({ ...config, media_url: url })}
            onError={onError}
          />
        </Field>
        <Field label="Caption (optional)">
          <input
            type="text"
            value={config.caption ?? ''}
            onChange={(e) => onChange({ ...config, caption: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
          />
        </Field>
        <Field label="Animation">
          <select
            value={config.animation ?? 'fade'}
            onChange={(e) => onChange({ ...config, animation: e.target.value as 'fade' | 'slide' | 'scale' })}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
          >
            <option value="fade">Fade</option>
            <option value="slide">Slide</option>
            <option value="scale">Scale</option>
          </select>
        </Field>
      </div>
    );
  }

  return <p className="text-sm text-gray-500">No configuration for this type.</p>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-600">*</span>}
      </label>
      {children}
    </div>
  );
}

// ============================================================
// Vercel Blob upload widget. Reuses the existing /api/admin/hotspot-uploads/upload-token
// endpoint we ship in Phase 2.
// ============================================================
function BlobUpload({
  currentUrl, accept, pathnamePrefix, onUploaded, onError,
}: {
  currentUrl: string | null | undefined;
  accept: string;
  pathnamePrefix: string;
  onUploaded: (url: string) => void;
  onError: (err: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    setProgress(0);
    onError(null);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const pathname = `${pathnamePrefix}/${Date.now()}-${safeName}`;
      const result = await upload(pathname, file, {
        access: 'public',
        handleUploadUrl: '/api/admin/hotspot-uploads/upload-token',
        onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
      });
      onUploaded(result.url);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40"
        >
          {uploading ? `Uploading… ${progress}%` : 'Choose file'}
        </button>
        {currentUrl && !uploading && (
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline truncate max-w-xs"
          >
            {currentUrl.split('/').pop()}
          </a>
        )}
      </div>
    </div>
  );
}
