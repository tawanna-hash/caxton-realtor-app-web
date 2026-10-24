'use client';

import { useState, useEffect } from 'react';
import { trackEvent } from '@/app/posthog-provider';
import { SW } from '@/lib/style-constants';
import { haptics } from '@/lib/native/haptics';
import { getApiBase } from '@/lib/api-base';
import { type ComingSoonPubId } from '@/lib/coming-soon-pubs';

const API = getApiBase();
export default function NotifyMeModal({ market, onClose }: { market: { id: ComingSoonPubId; name: string }; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  // Honeypot: bots tend to fill every input. Real users won't see this.
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  // iOS HIG: lock body scroll while the sheet is open so the underlying
  // page doesn't bleed through when the keyboard lifts the layout.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Esc dismiss (Bluetooth keyboards / Stage Manager).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('submitting');
    setError(null);
    try {
      const res = await fetch(`${API}/market-interest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market: market.id, email: email.trim(), name: name.trim(), website }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.detail || j?.error || 'Something went wrong. Please try again.');
        setStatus('error');
        void haptics.notify('error');
        return;
      }
      setStatus('success');
      void haptics.notify('success');
      trackEvent('market_interest_signup', { market: market.id });
      // Dual-fire under the semantic name admin dashboards expect.
      trackEvent('newsletter_signup', { market: market.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setStatus('error');
      void haptics.notify('error');
    }
  }

  // iOS HIG: bottom sheet shell with grabber + safe-area-inset-bottom.
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Notify me when ${market.name} launches`}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <div
        className="relative w-full max-w-md bg-white rounded-t-2xl shadow-2xl pb-[env(safe-area-inset-bottom)] animate-[sheetUp_220ms_ease-out]"
        style={{ animationName: 'sheetUp' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <span className="w-9 h-1 rounded-full bg-gray-300" aria-hidden />
        </div>
        <div className="px-4 pt-2 pb-4">
        {status === 'success' ? (
          <div className="text-center py-6">
            <p className="text-xl font-semibold text-gray-900 mb-2">You&rsquo;re on the list</p>
            <p className="text-gray-600 mb-6">We&rsquo;ll email you the moment {market.name} launches.</p>
            <button
              onClick={onClose}
              className="w-full min-h-[48px] px-6 py-3 bg-gray-900 text-white rounded-md font-semibold"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-lg font-semibold text-gray-900">Notify me when {market.name} launches</h3>
              <button
                onClick={onClose}
                aria-label="Close"
                className="text-gray-500 hover:text-gray-600 text-2xl leading-none ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2"
              >
                &times;
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">No spam. One email at launch.</p>
            <form onSubmit={submit} className="space-y-3">
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-4 border border-gray-300 rounded-md text-base"
                autoFocus
              />
              <input
                type="text"
                placeholder="Your name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-4 border border-gray-300 rounded-md text-base"
              />
              {/* Honeypot: hidden from humans, present to bots. */}
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px' }}
                aria-hidden="true"
              />
              {error && <p className="text-sm text-[#661102]">{error}</p>}
              <button
                type="submit"
                disabled={status === 'submitting'}
                onClick={() => { void haptics.light(); }}
                className="w-full min-h-[48px] px-4 py-3 bg-gray-900 text-white rounded-md font-semibold disabled:opacity-60"
              >
                {status === 'submitting' ? 'Submitting...' : 'Notify me'}
              </button>
            </form>
          </>
        )}
        </div>
      </div>
      <style jsx>{`
        @keyframes sheetUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
