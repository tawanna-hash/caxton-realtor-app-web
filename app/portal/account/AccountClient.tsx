// app/portal/account/AccountClient.tsx
'use client';

import { useState } from 'react';
import {
  FOOTER_TEMPLATE_IDS,
  FOOTER_TEMPLATE_META,
  coerceFooterTemplateId,
  type FooterTemplateId,
} from '@/lib/footer-templates';

type AccountFields = {
  company: string | null;
  phone: string | null;
  office_phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

const FIELD_LABELS: Array<[keyof AccountFields, string]> = [
  ['company', 'Company'],
  ['phone', 'Mobile phone'],
  ['office_phone', 'Office phone'],
  ['website', 'Website'],
  ['address', 'Street address'],
  ['city', 'City'],
  ['state', 'State'],
  ['zip', 'ZIP'],
];

interface InitialProps extends AccountFields {
  name: string;
  email: string | null;
  portal_email: string | null;
  footer_template: string | null;
}

export default function AccountClient({ initial }: { initial: InitialProps }) {
  const [values, setValues] = useState<Record<keyof AccountFields, string>>({
    company: initial.company ?? '',
    phone: initial.phone ?? '',
    office_phone: initial.office_phone ?? '',
    website: initial.website ?? '',
    address: initial.address ?? '',
    city: initial.city ?? '',
    state: initial.state ?? '',
    zip: initial.zip ?? '',
  });
  const [footerTemplate, setFooterTemplate] = useState<FooterTemplateId>(
    coerceFooterTemplateId(initial.footer_template),
  );
  const [footerSaved, setFooterSaved] = useState(false);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function saveField(key: keyof AccountFields, value: string) {
    setSaveError(null);
    const res = await fetch('/api/portal/account', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [key]: value || null }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSaveError(data?.error ?? 'save failed');
      return;
    }
    setSavedKey(key);
    setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 1500);
  }

  async function saveFooterTemplate(next: FooterTemplateId) {
    setSaveError(null);
    setFooterTemplate(next);
    const res = await fetch('/api/portal/account', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ footer_template: next }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSaveError(data?.error ?? 'save failed');
      return;
    }
    setFooterSaved(true);
    setTimeout(() => setFooterSaved(false), 1500);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 pb-4 border-b border-gray-100 text-sm">
          <div>
            <div className="text-gray-500">Name</div>
            <div className="font-medium text-gray-900">{initial.name}</div>
          </div>
          <div>
            <div className="text-gray-500">Email</div>
            <div className="font-medium text-gray-900">{initial.portal_email ?? initial.email ?? '-'}</div>
          </div>
        </div>

        {FIELD_LABELS.map(([key, label]) => (
          <label key={key} className="block">
            <div className="flex items-center justify-between text-sm font-medium text-gray-700 mb-1">
              <span>{label}</span>
              {savedKey === key && <span className="text-xs text-emerald-700">Saved</span>}
            </div>
            <input
              value={values[key]}
              onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
              onBlur={(e) => {
                if (e.target.value !== (initial[key] ?? '')) {
                  saveField(key, e.target.value);
                }
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        ))}

        {saveError && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 px-3 py-2 text-sm">
            {saveError}
          </div>
        )}
      </div>

      {/* Default footer template */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-start justify-between mb-1">
          <h2
            className="font-serif text-lg text-gray-900"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            Default footer template
          </h2>
          {footerSaved && <span className="text-xs text-emerald-700">Saved</span>}
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Picked automatically when you download any tool from the Resources
          section. You can still override per download.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {FOOTER_TEMPLATE_IDS.map((id) => {
            const meta = FOOTER_TEMPLATE_META[id];
            const selected = footerTemplate === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => saveFooterTemplate(id)}
                className={`text-left rounded-xl border p-3 transition ${
                  selected
                    ? 'border-[#021D40] ring-2 ring-[#021D40]/20 bg-white'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="text-sm font-medium text-gray-900">{meta.label}</div>
                <div className="text-xs text-gray-500 mt-0.5 leading-snug">{meta.blurb}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
