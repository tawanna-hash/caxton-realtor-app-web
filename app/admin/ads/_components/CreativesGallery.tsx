// caxton-ads-v1
// Creatives tab — image grid showing every uploaded creative,
// with edit + delete + "used in N" badge.

'use client';

import { useState } from 'react';
import { adminApi } from '@/lib/admin-api';
import { CreativeUpload } from './CreativeUpload';
import type { AdCreative, AdCampaign } from './types';

interface Props {
  creatives: AdCreative[];
  campaigns: AdCampaign[];
  onChange: () => void;
}

interface EditDraft {
  advertiser_name: string;
  width: string;
  height: string;
  click_url: string;
  alt_text: string;
}

function draftFromCreative(c: AdCreative): EditDraft {
  return {
    advertiser_name: c.advertiser_name,
    width: c.width != null ? String(c.width) : '',
    height: c.height != null ? String(c.height) : '',
    click_url: c.click_url,
    alt_text: c.alt_text ?? '',
  };
}

export function CreativesGallery({ creatives, campaigns, onChange }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);

  // Standalone upload form (not tied to creating a campaign).
  const [showUpload, setShowUpload] = useState(false);
  const [uploadAdvertiser, setUploadAdvertiser] = useState('');
  const [uploadClickUrl, setUploadClickUrl] = useState('');
  const [uploadAlt, setUploadAlt] = useState('');

  function resetUploadForm() {
    setUploadAdvertiser('');
    setUploadClickUrl('');
    setUploadAlt('');
    setShowUpload(false);
  }

  function usageCount(creativeId: string): number {
    return campaigns.filter((c) => c.creative_id === creativeId).length;
  }

  function startEdit(c: AdCreative) {
    setEditingId(c.id);
    setDraft(draftFromCreative(c));
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
    setError(null);
  }

  async function handleSave(c: AdCreative) {
    if (!draft) return;
    const advertiser_name = draft.advertiser_name.trim();
    const click_url = draft.click_url.trim();
    if (!advertiser_name) {
      setError('Advertiser name is required');
      return;
    }
    if (!click_url) {
      setError('Click URL is required');
      return;
    }
    try {
      new URL(click_url);
    } catch {
      setError('Click URL must be a valid URL (https://… or mailto:…)');
      return;
    }
    const widthVal = draft.width.trim() === '' ? null : Number(draft.width);
    const heightVal = draft.height.trim() === '' ? null : Number(draft.height);
    if (widthVal != null && (!Number.isInteger(widthVal) || widthVal <= 0)) {
      setError('Width must be a positive integer');
      return;
    }
    if (heightVal != null && (!Number.isInteger(heightVal) || heightVal <= 0)) {
      setError('Height must be a positive integer');
      return;
    }
    setBusyId(c.id);
    setError(null);
    try {
      await adminApi.updateAdCreative(c.id, {
        advertiser_name,
        width: widthVal,
        height: heightVal,
        click_url,
        alt_text: draft.alt_text.trim() === '' ? null : draft.alt_text.trim(),
      });
      cancelEdit();
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(c: AdCreative) {
    const used = usageCount(c.id);
    if (used > 0) {
      alert(`Cannot delete — referenced by ${used} campaign(s). Delete those campaigns first.`);
      return;
    }
    if (!confirm(`Delete creative for ${c.advertiser_name}? This removes the image record (the file in Vercel Blob is not auto-deleted).`)) return;
    setBusyId(c.id);
    setError(null);
    try {
      await adminApi.deleteAdCreative(c.id);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusyId(null);
    }
  }



  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
          {error}
        </div>
      )}

      <div className="rounded-md border border-gray-200 bg-white p-4">
        {!showUpload ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-700">
              Upload a new creative image to the library. You can attach it to a campaign later.
            </p>
            <button
              type="button"
              onClick={() => setShowUpload(true)}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              + Upload creative
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900">New creative</h3>
              <button
                type="button"
                onClick={resetUploadForm}
                className="text-xs text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-gray-600">Advertiser name *</span>
                <input
                  type="text"
                  value={uploadAdvertiser}
                  onChange={(e) => setUploadAdvertiser(e.target.value)}
                  placeholder="RealtyLine House"
                  className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-600">Click URL * (https:// or mailto:)</span>
                <input
                  type="text"
                  value={uploadClickUrl}
                  onChange={(e) => setUploadClickUrl(e.target.value)}
                  placeholder="https://advertiser.com or mailto:info@myrealtyline.com"
                  className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm font-mono"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs text-gray-600">Alt text</span>
                <input
                  type="text"
                  value={uploadAlt}
                  onChange={(e) => setUploadAlt(e.target.value)}
                  placeholder="Describe the image for accessibility"
                  className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                />
              </label>
            </div>
            <CreativeUpload
              advertiserName={uploadAdvertiser}
              clickUrl={uploadClickUrl}
              altText={uploadAlt}
              disabled={!uploadAdvertiser.trim() || !uploadClickUrl.trim()}
              onUploaded={() => {
                resetUploadForm();
                onChange();
              }}
            />
          </div>
        )}
      </div>

      {creatives.length === 0 && (
        <div className="text-center py-6 bg-white rounded-md border border-gray-200">
          <p className="text-sm text-gray-600">No creatives uploaded yet — use the form above.</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {creatives.map((c) => {
          const used = usageCount(c.id);
          const busy = busyId === c.id;
          const isEditing = editingId === c.id;
          return (
            <div key={c.id} className="rounded-md border border-gray-200 bg-white overflow-hidden">
              <div className="aspect-[4/3] bg-gray-100 flex items-center justify-center">
                <img
                  src={c.blob_url}
                  alt={c.alt_text || c.advertiser_name}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              {isEditing && draft ? (
                <div className="p-3 text-sm space-y-2">
                  <label className="block">
                    <span className="text-xs text-gray-600">Advertiser</span>
                    <input
                      type="text"
                      value={draft.advertiser_name}
                      onChange={(e) => setDraft({ ...draft, advertiser_name: e.target.value })}
                      className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-xs text-gray-600">Width</span>
                      <input
                        type="number"
                        value={draft.width}
                        onChange={(e) => setDraft({ ...draft, width: e.target.value })}
                        className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-gray-600">Height</span>
                      <input
                        type="number"
                        value={draft.height}
                        onChange={(e) => setDraft({ ...draft, height: e.target.value })}
                        className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-xs text-gray-600">Click URL (https:// or mailto:)</span>
                    <input
                      type="text"
                      value={draft.click_url}
                      onChange={(e) => setDraft({ ...draft, click_url: e.target.value })}
                      className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm font-mono"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-600">Alt text</span>
                    <input
                      type="text"
                      value={draft.alt_text}
                      onChange={(e) => setDraft({ ...draft, alt_text: e.target.value })}
                      className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                    />
                  </label>
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={busy}
                      className="text-xs text-gray-700 hover:text-gray-900 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSave(c)}
                      disabled={busy}
                      className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {busy ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3 text-sm">
                  <p className="font-medium text-gray-900">{c.advertiser_name}</p>
                  <p className="text-xs text-gray-600">{c.width}×{c.height}</p>
                  <p className="text-xs text-gray-500 truncate mt-1" title={c.click_url}>
                    → {c.click_url}
                  </p>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                    <span className="text-xs text-gray-600">
                      {used === 0 ? (
                        <span className="text-amber-700">Unused</span>
                      ) : (
                        <span className="text-green-700">Used in {used}</span>
                      )}
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => startEdit(c)}
                        disabled={busy}
                        className="text-indigo-700 hover:text-indigo-900 text-xs disabled:opacity-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(c)}
                        disabled={busy || used > 0}
                        className="text-red-700 hover:text-red-900 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                        title={used > 0 ? `Referenced by ${used} campaign(s)` : 'Delete this creative'}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
