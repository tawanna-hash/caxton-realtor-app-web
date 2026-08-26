'use client';

import { useEffect, useState } from 'react';
import { AudioLines, Check, FileText, Quote, Star, Video } from 'lucide-react';
import { getApiBase } from '@/lib/api-base';

type Preview = {
  display_name: string;
  professional_title: string | null;
  company: string | null;
  headshot_url: string | null;
  website_url: string | null;
};

const API_BASE = getApiBase();

export default function TestimonialSubmissionClient({ token }: { token: string }) {
  const [profile, setProfile] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [format, setFormat] = useState<'text' | 'audio' | 'video'>('text');
  const [rating, setRating] = useState<number | null>(5);

  useEffect(() => {
    fetch(`${API_BASE}/testimonial-hub/submit/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'This collection link is not available.');
        setProfile(data.profile);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to open this form.'))
      .finally(() => setLoading(false));
  }, [token]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const body = {
      quote: String(form.get('quote') || ''),
      clientName: String(form.get('clientName') || ''),
      clientTitle: String(form.get('clientTitle') || ''),
      clientCompany: String(form.get('clientCompany') || ''),
      email: String(form.get('email') || ''),
      rating,
      format,
      videoUrl: String(form.get('videoUrl') || ''),
      imageUrl: String(form.get('imageUrl') || ''),
      transcript: String(form.get('transcript') || ''),
      sourceUrl: String(form.get('sourceUrl') || ''),
      tags: [],
      consent: form.get('consent') === 'on',
      hp: String(form.get('website') || ''),
    };
    try {
      const response = await fetch(`${API_BASE}/testimonial-hub/submit/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to submit your testimonial.');
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit your testimonial.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="min-h-screen bg-[#f7f4ee] px-4 py-16"><div className="mx-auto h-96 max-w-2xl animate-pulse rounded-2xl bg-white" /></main>;
  }

  if (error && !profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f4ee] px-5">
        <div className="max-w-md rounded-xl border border-red-100 bg-white p-8 text-center shadow-sm">
          <Quote className="mx-auto text-gray-300" size={34} />
          <h1 className="mt-4 text-xl font-semibold text-gray-950">Link unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-gray-600">{error}</p>
        </div>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f4ee] px-5">
        <div className="max-w-lg rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm sm:p-10">
          <Check className="mx-auto text-emerald-600" size={38} />
          <h1 className="mt-5 text-2xl font-semibold text-gray-950">Thank you for sharing</h1>
          <p className="mt-3 text-base leading-7 text-gray-600">Your testimonial has been sent to {profile?.display_name} for review.</p>
          {profile?.website_url && <a href={profile.website_url} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-md bg-[#301D5D] px-5 text-sm font-semibold text-white">Return to {profile.display_name}&apos;s website</a>}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-4 py-8 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 text-center">
          {profile?.headshot_url && (
            // Profile images are owner-supplied Blob URLs with dynamic hosts.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.headshot_url} alt={profile.display_name} className="mx-auto h-20 w-20 rounded-full object-cover" />
          )}
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#301D5D]">Client testimonial</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-950">Share your experience with {profile?.display_name}</h1>
          {(profile?.professional_title || profile?.company) && <p className="mt-2 text-sm text-gray-600">{[profile.professional_title, profile.company].filter(Boolean).join(' · ')}</p>}
          {profile?.website_url && <a href={profile.website_url} className="mt-3 inline-block text-sm font-semibold text-[#301D5D] underline underline-offset-4">Visit {profile.display_name}&apos;s website</a>}
        </header>

        <form onSubmit={submit} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-8">
          {error && <div role="alert" className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          <label className="block text-sm font-semibold text-gray-800">
            Your testimonial
            <textarea required minLength={10} name="quote" rows={6} className="mt-2 w-full rounded-md border border-gray-300 px-3 py-3 text-base leading-7" placeholder="What stood out about working together?" />
          </label>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">Your name<input required name="clientName" className="mt-1.5 min-h-11 w-full rounded-md border border-gray-300 px-3" /></label>
            <label className="text-sm font-medium text-gray-700">Email, not published<input type="email" name="email" className="mt-1.5 min-h-11 w-full rounded-md border border-gray-300 px-3" /></label>
            <label className="text-sm font-medium text-gray-700">Title or role<input name="clientTitle" className="mt-1.5 min-h-11 w-full rounded-md border border-gray-300 px-3" /></label>
            <label className="text-sm font-medium text-gray-700">Company<input name="clientCompany" className="mt-1.5 min-h-11 w-full rounded-md border border-gray-300 px-3" /></label>
          </div>

          <fieldset className="mt-6">
            <legend className="text-sm font-semibold text-gray-800">Rating</legend>
            <div className="mt-2 flex gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${value} stars`} className="flex min-h-11 min-w-11 items-center justify-center rounded-md hover:bg-amber-50">
                  <Star size={24} className={rating && value <= rating ? 'text-amber-500' : 'text-gray-300'} fill={rating && value <= rating ? 'currentColor' : 'none'} />
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-6">
            <legend className="text-sm font-semibold text-gray-800">Testimonial format</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(['text', 'audio', 'video'] as const).map((value) => (
                <button key={value} type="button" onClick={() => setFormat(value)} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium capitalize ${format === value ? 'border-[#301D5D] bg-[#301D5D]/5 text-[#301D5D]' : 'border-gray-300 text-gray-600'}`}>
                  {value === 'video' ? <Video size={16} /> : value === 'audio' ? <AudioLines size={16} /> : <FileText size={16} />}{value}
                </button>
              ))}
            </div>
          </fieldset>

          {format !== 'text' && (
            <div className="mt-5 space-y-4">
              <label className="block text-sm font-medium text-gray-700">{format === 'audio' ? 'Audio URL' : 'Video URL'}<input required type="url" name="videoUrl" className="mt-1.5 min-h-11 w-full rounded-md border border-gray-300 px-3" placeholder={format === 'audio' ? 'Hosted audio or podcast URL' : 'YouTube, Vimeo, or hosted video URL'} /></label>
              <label className="block text-sm font-medium text-gray-700">Transcript or summary<textarea name="transcript" rows={3} className="mt-1.5 w-full rounded-md border border-gray-300 px-3 py-2" /></label>
            </div>
          )}

          <label className="mt-5 block text-sm font-medium text-gray-700">Photo URL, optional<input type="url" name="imageUrl" className="mt-1.5 min-h-11 w-full rounded-md border border-gray-300 px-3" /></label>
          <label className="mt-5 block text-sm font-medium text-gray-700">Original review URL, optional<input type="url" name="sourceUrl" className="mt-1.5 min-h-11 w-full rounded-md border border-gray-300 px-3" /></label>

          <label className="mt-6 flex items-start gap-3 text-sm leading-6 text-gray-600">
            <input required name="consent" type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[#301D5D]" />
            I confirm this testimonial reflects my experience and may be displayed publicly after review.
          </label>
          <input name="website" tabIndex={-1} autoComplete="off" className="sr-only" aria-hidden="true" />

          <button disabled={saving} className="mt-7 min-h-12 w-full rounded-md bg-[#301D5D] px-5 text-sm font-semibold text-white hover:bg-[#241547] disabled:opacity-50">
            {saving ? 'Submitting…' : 'Submit testimonial'}
          </button>
          <p className="mt-4 text-center text-xs leading-5 text-gray-500">Your submission is reviewed before it appears publicly.</p>
        </form>
      </div>
    </main>
  );
}
