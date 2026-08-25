'use client';

// app/admin/magazines/settings/PublicationSettingsForm.tsx
//
// Admin form for editing the GA4 Measurement ID per publication.
// One row per publication (austin = RealtyLine, san_antonio = Newsline San Antonio).
// Saves via PATCH /api/admin/publication-settings.

import { useState } from 'react';
import Link from 'next/link';

import PageTitle from '@/components/ui/PageTitle';
import { PUBLICATIONS as PUBLICATION_OPTIONS, type PublicationId } from '@/lib/publications';
export type Publication = PublicationId;

export type PublicationSettingsRow = {
  publication: Publication;
  ga_measurement_id: string | null;
  updated_at: string;
};

type Props = {
  initialSettings: PublicationSettingsRow[];
};

const PUB_LABEL: Record<Publication, string> = {
  austin: 'RealtyLine Austin',
  san_antonio: 'Newsline San Antonio',
  houston: 'RealtyLine Houston',
  dallas: 'RealtyLine Dallas/Ft. Worth',
};

const PUB_HELP: Record<Publication, string> = {
  austin:
    'Paste the GA4 Measurement ID for the RealtyLine property. Looks like G-XXXXXXX. Leave blank to disable tracking on RealtyLine magazines.',
  san_antonio:
    'Paste the GA4 Measurement ID for the Newsline San Antonio property. Looks like G-XXXXXXX. Leave blank to disable tracking on Newsline San Antonio magazines.',
  houston:
    'Paste the GA4 Measurement ID for the RealtyLine Houston property. Looks like G-XXXXXXX. Leave blank to disable tracking on RealtyLine Houston magazines.',
  dallas:
    'Paste the GA4 Measurement ID for the RealtyLine Dallas/Ft. Worth property. Looks like G-XXXXXXX. Leave blank to disable tracking on RealtyLine Dallas/Ft. Worth magazines.',
};

const PUBLICATIONS: Publication[] = PUBLICATION_OPTIONS.map((publication) => publication.id);

function findRow(rows: PublicationSettingsRow[], pub: Publication): PublicationSettingsRow {
  return (
    rows.find((r) => r.publication === pub) || {
      publication: pub,
      ga_measurement_id: null,
      updated_at: '',
    }
  );
}

export default function PublicationSettingsForm({ initialSettings }: Props) {
  const [rows, setRows] = useState<PublicationSettingsRow[]>(initialSettings);
  const [draft, setDraft] = useState<Record<Publication, string>>(() => ({
    austin: findRow(initialSettings, 'austin').ga_measurement_id ?? '',
    san_antonio: findRow(initialSettings, 'san_antonio').ga_measurement_id ?? '',
    houston: findRow(initialSettings, 'houston').ga_measurement_id ?? '',
    dallas: findRow(initialSettings, 'dallas').ga_measurement_id ?? '',
  }));
  const [savingPub, setSavingPub] = useState<Publication | null>(null);
  const [savedPub, setSavedPub] = useState<Publication | null>(null);
  const [errorByPub, setErrorByPub] = useState<Partial<Record<Publication, string>>>({});

  async function handleSave(pub: Publication) {
    setSavingPub(pub);
    setSavedPub(null);
    setErrorByPub((prev) => {
      const next = { ...prev };
      delete next[pub];
      return next;
    });
    const value = draft[pub].trim();
    try {
      const r = await fetch('/api/admin/publication-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publication: pub,
          ga_measurement_id: value === '' ? null : value,
        }),
      });
      const body = (await r.json().catch(() => ({}))) as {
        settings?: PublicationSettingsRow;
        error?: string;
      };
      if (!r.ok || !body.settings) {
        throw new Error(body.error || `Save failed (${r.status})`);
      }
      const saved = body.settings;
      setRows((prev) => {
        const without = prev.filter((row) => row.publication !== pub);
        return [...without, saved].sort((a, b) => a.publication.localeCompare(b.publication));
      });
      setDraft((prev) => ({ ...prev, [pub]: saved.ga_measurement_id ?? '' }));
      setSavedPub(pub);
      setTimeout(() => setSavedPub((curr) => (curr === pub ? null : curr)), 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setErrorByPub((prev) => ({ ...prev, [pub]: msg }));
    } finally {
      setSavingPub((curr) => (curr === pub ? null : curr));
    }
  }

  return (
    <div className="min-h-screen bg-white p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <PageTitle size="md">Magazine Settings</PageTitle>
            <p className="text-sm text-gray-600 mt-1">
              Per-publication settings shared across every issue.
            </p>
          </div>
          <Link
            href="/admin/magazines"
            className="text-sm text-gray-700 hover:text-gray-900 px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            ← Back to Magazines
          </Link>
        </div>

        <div className="bg-white border border-gray-200 rounded-md p-5 mb-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Google Analytics</h2>
          <p className="text-sm text-gray-600 mb-4">
            Each magazine in a publication will fire GA4 events (page views and a
            <code className="px-1 mx-1 bg-gray-100 rounded-md text-xs">magazine_page_flip</code>
            event on every page turn) into the property tied to its Measurement ID.
          </p>

          <div className="space-y-5">
            {PUBLICATIONS.map((pub) => {
              const row = findRow(rows, pub);
              const value = draft[pub];
              const saved = row.ga_measurement_id ?? '';
              const dirty = value.trim() !== saved;
              const isSaving = savingPub === pub;
              const justSaved = savedPub === pub;
              const err = errorByPub[pub];
              return (
                <div key={pub} className="border-t border-gray-100 pt-5 first:border-t-0 first:pt-0">
                  <label className="block">
                    <span className="block text-sm font-medium text-gray-900">{PUB_LABEL[pub]}</span>
                    <span className="block text-xs text-gray-500 mt-0.5 mb-2">{PUB_HELP[pub]}</span>
                    <input
                      type="text"
                      value={value}
                      onChange={(e) => setDraft((prev) => ({ ...prev, [pub]: e.target.value }))}
                      placeholder="G-XXXXXXX"
                      className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleSave(pub)}
                      disabled={isSaving || !dirty}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-md text-sm font-medium"
                    >
                      {isSaving ? 'Saving…' : 'Save'}
                    </button>
                    {dirty && !isSaving && (
                      <button
                        type="button"
                        onClick={() => setDraft((prev) => ({ ...prev, [pub]: saved }))}
                        className="text-sm text-gray-600 hover:text-gray-900"
                      >
                        Revert
                      </button>
                    )}
                    {justSaved && <span className="text-xs text-green-700">Saved</span>}
                    {saved && <span className="text-xs text-gray-500">Current: {saved}</span>}
                  </div>
                  {err && (
                    <p className="text-sm text-red-700 mt-2">{err}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
