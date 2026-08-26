'use client';

import { useState } from 'react';
import { Check, Crown, Loader2 } from 'lucide-react';
import { getApiBase } from '@/lib/api-base';

export default function RnnPlatinumPaywall({
  checkoutAvailable,
  trialAvailable,
}: {
  checkoutAvailable: boolean;
  trialAvailable: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function begin(path: 'trial' | 'checkout') {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${getApiBase()}/rnn-platinum/${path}`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to activate access.');
      if (path === 'trial') {
        window.location.assign('/testimonial-hub?trial=started');
      } else if (data.url) {
        window.location.assign(data.url);
      } else {
        throw new Error('Unable to start checkout.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start checkout.');
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-16">
      <section className="overflow-hidden rounded-2xl border border-[#301D5D]/15 bg-white shadow-sm">
        <div className="bg-[#301D5D] px-6 py-10 text-white sm:px-10">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15">
            <Crown size={24} />
          </div>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Platinum Tools</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Turn client praise into proof that travels.</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/80">
            Collect testimonials without requiring client accounts, publish a polished proof page, and embed your reviews on any website.
          </p>
        </div>
        <div className="grid gap-8 px-6 py-8 sm:grid-cols-[1fr_auto] sm:items-center sm:px-10">
          <ul className="space-y-3 text-sm text-gray-700">
            {[
              'Your own no-login testimonial collection link',
              'Text, audio, and video testimonial library',
              'Public profile with your website and social links',
              'One-line embed for any website',
              'Review and publish controls',
            ].map((feature) => (
              <li key={feature} className="flex items-start gap-3">
                <Check className="mt-0.5 shrink-0 text-emerald-600" size={17} />
                {feature}
              </li>
            ))}
          </ul>
          <div className="sm:w-64">
            <button
              type="button"
              disabled={(!trialAvailable && !checkoutAvailable) || loading}
              onClick={() => void begin(trialAvailable ? 'trial' : 'checkout')}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#301D5D] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-55"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {trialAvailable
                ? 'Start your free 30-day trial'
                : checkoutAvailable
                  ? 'Unlock Platinum Tools'
                  : 'Enrollment coming soon'}
            </button>
            <p className="mt-3 text-center text-xs leading-5 text-gray-500">
              {trialAvailable
                ? 'No credit card required. Your trial begins immediately.'
                : 'Complimentary access can also be granted by Realty News Now.'}
            </p>
            {error && <p role="alert" className="mt-3 text-center text-sm text-red-700">{error}</p>}
          </div>
        </div>
      </section>
    </main>
  );
}
