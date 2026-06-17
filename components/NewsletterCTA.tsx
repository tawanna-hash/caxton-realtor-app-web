'use client';

import { type PubKey } from '@/lib/pub-meta';

// components/NewsletterCTA.tsx
//
// Shared inline newsletter signup form. Posts to /api/newsletter/subscribe
// and shows submitting / success / already-subscribed / error states.
//
// Extracted from the dashboard feed so the same CTA can be embedded on the
// public AppShell footer, dedicated /newsletter page, and any future page.

import { useEffect, useState } from 'react';

type Publication = PubKey;

// Brand color per publication. Falls back to neutral if unknown.
// Houston/Dallas inherit RealtyLine navy.
const PUB_COLORS: Record<Publication, string> = {
  realtyline: '#021D40',
  newsline: '#7f1d1d',
  'realtyline-houston': '#021D40',
  'realtyline-dallas': '#021D40',
};

type Props = {
  /** Identifier for analytics — e.g. 'dashboard_feed', 'public_footer', 'page_about'. */
  source?: string;
  /** Override the publication. If omitted, reads localStorage.caxton_pub. */
  publication?: Publication;
  /** Override the headline. */
  headline?: string;
  /** Override the deck. */
  deck?: string;
  /** Override the button color. */
  buttonColor?: string;
  /** Visual variant. 'card' = bordered box on white, 'flush' = matches dashboard feed (gray band). */
  variant?: 'card' | 'flush';
};

export default function NewsletterCTA({
  source = 'public_footer',
  publication,
  headline = 'Get All Our Content in One Weekly Email',
  deck = 'It\u2019s free. It\u2019s weekly. And it\u2019s full of great resources.',
  buttonColor,
  variant = 'flush',
}: Props) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [already, setAlready] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedPub, setResolvedPub] = useState<Publication>(publication ?? 'realtyline');

  // Read publication preference from localStorage on mount (browser only).
  useEffect(() => {
    if (publication) return;
    try {
      const v = localStorage.getItem('caxton_pub');
      if (v === 'realtyline' || v === 'newsline') {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setResolvedPub(v);
      }
    } catch {
      // ignore
    }
  }, [publication]);

  async function handleSubmit() {
    if (!email || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          publication: resolvedPub,
          source,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok: boolean; already?: boolean; error?: string }
        | null;
      if (!res.ok || !body?.ok) {
        setError(body?.error || 'Sorry, something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }
      setAlready(Boolean(body.already));
      setSubmitted(true);
      setSubmitting(false);
    } catch {
      setError('Network error. Please try again.');
      setSubmitting(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  }

  const color = buttonColor ?? PUB_COLORS[resolvedPub];
  const wrapperClass =
    variant === 'card'
      ? 'bg-white border border-gray-200 rounded-md px-5 py-8 max-w-2xl mx-auto'
      : 'bg-gray-100 border-y border-gray-200 px-5 py-8';

  return (
    <div className={wrapperClass}>
      <p className="text-center text-2xl font-bold text-gray-900 leading-tight mb-2">{headline}</p>
      <p className="text-center text-base text-gray-500 font-light mb-6">{deck}</p>
      {submitted ? (
        <p className="text-center text-base text-gray-700 font-medium py-4">
          {'\u2713'}{' '}
          {already
            ? 'You\u2019re already subscribed. Welcome back.'
            : 'You\u2019re subscribed. Watch your inbox.'}
        </p>
      ) : (
        <>
          <div className="flex max-w-md mx-auto">
            <input
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={submitting}
              // BUG-19: relied on focus:outline-none with no visible :focus-visible fallback.
              // Add an explicit focus-visible ring so keyboard users see focus.
              className="flex-1 px-4 py-3.5 border border-gray-300 text-base font-light bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#021D40]/40 focus:border-[#021D40] placeholder:text-[#d1d5db] disabled:opacity-60"
            />
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-3.5 text-base font-medium uppercase tracking-wider text-white whitespace-nowrap disabled:opacity-60"
              style={{ backgroundColor: color }}
            >
              {submitting ? 'Signing\u2026' : 'Sign Up'}
            </button>
          </div>
          {error && <p className="text-center text-sm text-red-600 mt-3">{error}</p>}
          <div className="flex items-center justify-center gap-6 mt-4 text-xs uppercase tracking-wider text-gray-600 font-medium">
            <a href="/newsletter" className="border-b border-gray-400 pb-0.5">
              All Newsletters
            </a>
            <a href="/privacy" className="border-b border-gray-400 pb-0.5">
              Privacy Policy
            </a>
          </div>
        </>
      )}
    </div>
  );
}
