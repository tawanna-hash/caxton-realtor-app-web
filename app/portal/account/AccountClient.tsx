// app/portal/account/AccountClient.tsx
'use client';

import { useState } from 'react';

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

export default function AccountClient({ initial }: { initial: AccountFields & { name: string; email: string | null; portal_email: string | null } }) {
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

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 pb-4 border-b border-gray-100 text-sm">
        <div>
          <div className="text-gray-500">Name</div>
          <div className="font-medium text-gray-900">{initial.name}</div>
        </div>
        <div>
          <div className="text-gray-500">Email</div>
          <div className="font-medium text-gray-900">{initial.portal_email ?? initial.email ?? '—'}</div>
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
  );
}
