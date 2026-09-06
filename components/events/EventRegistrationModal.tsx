'use client';

import { FormEvent, useState } from 'react';
import { openExternal } from '@/lib/native/external-link';

type Props = {
  eventId: number;
  eventTitle: string;
  color: string;
  onClose: () => void;
};

const INPUT =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-base text-gray-900 outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-700/15';

export function EventRegistrationModal({ eventId, eventTitle, color, onClose }: Props) {
  const [form, setForm] = useState({
    fullName: '',
    company: '',
    isRealtor: false,
    licenseNumber: '',
    email: '',
    mobile: '',
    consent: false,
    hp: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; redirectUrl?: string | null }
        | null;
      if (!res.ok || !body?.ok) throw new Error(body?.error || 'Registration failed.');
      setComplete(true);
      if (body.redirectUrl) {
        setTimeout(() => void openExternal(body.redirectUrl as string), 650);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center sm:p-5">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-white shadow-2xl sm:max-w-lg sm:rounded-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-200 bg-white px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color }}>
              Event registration
            </p>
            <h2 className="mt-1 text-lg font-semibold text-gray-950">{eventTitle}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close registration form"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-2xl text-gray-500 hover:bg-gray-100"
          >
            ×
          </button>
        </div>

        {complete ? (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700">✓</div>
            <h3 className="text-xl font-semibold text-gray-950">You’re registered</h3>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Your attendee information has been received. If the organizer has an event
              website, it will open next.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 rounded-md px-5 py-2.5 text-sm font-semibold text-white"
              style={{ backgroundColor: color }}
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 px-5 py-5">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-800">Name</span>
              <input required value={form.fullName} onChange={(e) => set('fullName', e.target.value)} className={INPUT} autoComplete="name" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-800">Company</span>
              <input required value={form.company} onChange={(e) => set('company', e.target.value)} className={INPUT} autoComplete="organization" />
            </label>
            <label className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-3">
              <input type="checkbox" checked={form.isRealtor} onChange={(e) => set('isRealtor', e.target.checked)} className="h-4 w-4" />
              <span className="text-sm font-medium text-gray-800">I am a REALTOR®</span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-800">Real estate license number <span className="font-normal text-gray-500">(optional)</span></span>
              <input value={form.licenseNumber} onChange={(e) => set('licenseNumber', e.target.value)} className={INPUT} autoComplete="off" />
            </label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-gray-800">Email</span>
                <input required type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={INPUT} autoComplete="email" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-gray-800">Mobile</span>
                <input required type="tel" value={form.mobile} onChange={(e) => set('mobile', e.target.value)} className={INPUT} autoComplete="tel" />
              </label>
            </div>
            <input
              tabIndex={-1}
              aria-hidden="true"
              value={form.hp}
              onChange={(e) => set('hp', e.target.value)}
              className="hidden"
              autoComplete="off"
            />
            <label className="flex items-start gap-3 rounded-md bg-gray-50 px-3 py-3">
              <input required type="checkbox" checked={form.consent} onChange={(e) => set('consent', e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span className="text-xs leading-5 text-gray-600">
                I agree that Realty News Now may share my registration details with the
                event organizer for event administration.
              </span>
            </label>
            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md py-3 text-sm font-semibold uppercase tracking-wider text-white disabled:opacity-60"
              style={{ backgroundColor: color }}
            >
              {submitting ? 'Registering…' : 'Complete registration'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
