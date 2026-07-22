'use client';

import { useEffect, useState } from 'react';

import PageTitle from '@/components/ui/PageTitle';
interface AdvertiserMeta {
  advertiserName: string;
  publication: string | null;
}

export default function SubmitEventClient({ token }: { token: string }) {
  const [meta, setMeta] = useState<AdvertiserMeta | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [location, setLocation] = useState('');
  const [website, setWebsite] = useState('');
  const [rsvpLink, setRsvpLink] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [hp, setHp] = useState(''); // honeypot — must stay empty

  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState(false);

  // Resolve the token → friendly advertiser name on mount. A 404 here means
  // the link is bad / expired and we should not render the form at all.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/submit-event/${token}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `Lookup failed (${r.status})`);
        }
        return r.json() as Promise<AdvertiserMeta>;
      })
      .then((data) => {
        if (!cancelled) setMeta(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadErr(err instanceof Error ? err.message : 'Lookup failed');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitErr(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/submit-event/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          startDate,
          endDate: endDate || null,
          location: location.trim() || null,
          website: website.trim() || null,
          rsvpLink: rsvpLink.trim() || null,
          imageUrl: imageUrl.trim() || null,
          hp,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `Submission failed (${res.status})`);
      }

      setSubmitOk(true);
      // Reset the editable fields so a second submission is friction-free.
      setTitle('');
      setDescription('');
      setStartDate('');
      setEndDate('');
      setLocation('');
      setWebsite('');
      setRsvpLink('');
      setImageUrl('');
    } catch (err) {
      setSubmitErr(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadErr) {
    return (
      <div className="rounded-md bg-white border border-red-200 p-8 shadow-sm">
        <PageTitle size="md">
          Submission link not found
        </PageTitle>
        <p className="text-sm text-gray-700">
          {loadErr}. If you believe this is an error, please contact your
          Realty News Now representative for a fresh link.
        </p>
      </div>
    );
  }

  if (!meta) {
    return <p className="text-gray-500">Loading submission form…</p>;
  }

  if (submitOk) {
    return (
      <div className="rounded-md bg-white border border-emerald-200 p-8 shadow-sm">
        <p className="text-[10px] uppercase tracking-[0.3em] text-emerald-700 font-medium mb-2">
          Submitted
        </p>
        <PageTitle size="md">
          Thanks — your event is queued for review
        </PageTitle>
        <p className="text-sm text-gray-700 mb-6">
          Our team will review the details and add it to the Realty News Now
          Calendar once approved. Submitting on behalf of{' '}
          <strong>{meta.advertiserName}</strong>.
        </p>
        <button
          onClick={() => setSubmitOk(false)}
          className="inline-flex items-center rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          Submit another event
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-md bg-white border border-gray-200 p-6 sm:p-8 shadow-sm">
      <p className="text-[10px] uppercase tracking-[0.3em] text-gray-500 font-medium mb-2">
        Submit an event
      </p>
      <PageTitle size="md">
        Realty News Now Calendar
      </PageTitle>
      <p className="text-sm text-gray-700 mb-6">
        Submitting on behalf of <strong>{meta.advertiserName}</strong>. Fill in
        what you have and we&rsquo;ll take it from here — our team reviews
        every submission before it appears on the Calendar.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Event title" required>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Open House at 123 Main St"
            required
            maxLength={500}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Start date & time" required>
            <input
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
          </Field>
          <Field label="End date & time">
            <input
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
          </Field>
        </div>

        <Field label="Location">
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="123 Main St, Austin, TX 78701"
            maxLength={500}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            maxLength={5_000}
            placeholder="What attendees should expect, refreshments, RSVP cutoff, etc."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="RSVP link">
            <input
              type="url"
              value={rsvpLink}
              onChange={(e) => setRsvpLink(e.target.value)}
              placeholder="https://…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
          </Field>
          <Field label="Event website">
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
          </Field>
        </div>

        <Field label="Image URL">
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-gray-500">
            Paste a direct image URL (jpg, png). If you don&rsquo;t have one,
            leave blank and we&rsquo;ll add a default.
          </p>
        </Field>

        {/* Honeypot — invisible to humans, irresistible to bots */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', height: 0, overflow: 'hidden' }}>
          <label>
            Website (leave blank)
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={hp}
              onChange={(e) => setHp(e.target.value)}
            />
          </label>
        </div>

        {submitErr && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
            {submitErr}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center rounded-md bg-brand-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 w-full sm:w-auto"
        >
          {submitting ? 'Submitting…' : 'Submit event for review'}
        </button>

        <p className="text-xs text-gray-500 pt-2">
          Submitted events are reviewed before publishing. You&rsquo;ll hear
          back from your Realty News Now contact once it&rsquo;s live.
        </p>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-800 mb-1">
        {label}
        {required && <span className="text-red-600 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}
