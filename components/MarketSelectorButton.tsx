'use client';

// MarketSelectorButton
// --------------------
// Tappable "Select Your Market >" button + right-side drawer for surfaces
// outside the dashboard SPA (e.g. /magazine) that still need a way to
// switch between RealtyLine Austin and Newsline San Antonio and surface
// the Coming Soon markets. Mirrors the drawer that lives inside the
// dashboard hero so the two surfaces feel like the same control.
//
// Active markets persist via the same caxton_pub cookie + localStorage
// the dashboard uses, then reload to / so every pub-scoped fetch re-runs.
// Coming-soon markets open an inline notify-me modal that POSTs to the
// same /market-interest endpoint as the dashboard NotifyMeModal.

import { useState } from 'react';
import { getApiBase } from '@/lib/api-base';
import { trackEvent } from '../app/posthog-provider';
import type { ComingSoonPubId } from '@/lib/coming-soon-pubs';

const API = getApiBase();

type ActiveId = 'realtyline' | 'newsline';
type AnyMarketId = ActiveId | ComingSoonPubId;

interface MarketSelectorButtonProps {
  /** Current pub id, used to badge the "Current" market in the drawer. */
  currentPub: string;
  /** Tailwind/colour classes for the button label + chevron. Pass dark
   *  classes on light headers, light classes on dark headers. */
  labelClassName?: string;
  /** Optional path to reload to after switching an active market.
   *  Defaults to "/" which lands the user on the dashboard for the newly
   *  selected pub. Pass "/magazine" if you want them to stay on magazines. */
  reloadTo?: string;
}

const ACTIVE_MARKETS: Array<{ id: ActiveId; label: string; monogram: string }> = [
  { id: 'realtyline', label: 'RealtyLine Austin', monogram: 'RL' },
  { id: 'newsline', label: 'Newsline San Antonio', monogram: 'NS' },
];

const COMING_SOON_MARKETS: Array<{ id: ComingSoonPubId; label: string; monogram: string }> = [
  { id: 'realtyline-houston', label: 'RealtyLine Houston', monogram: 'RH' },
  { id: 'realtyline-dallas', label: 'RealtyLine Dallas/Ft. Worth', monogram: 'RD' },
];

export default function MarketSelectorButton({
  currentPub,
  labelClassName = 'text-gray-900',
  reloadTo = '/',
}: MarketSelectorButtonProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notifyFor, setNotifyFor] = useState<{ id: ComingSoonPubId; name: string } | null>(null);

  function selectActive(id: ActiveId) {
    setDrawerOpen(false);
    if (id === currentPub) return;
    try {
      const maxAge = 60 * 60 * 24 * 365;
      document.cookie = `caxton_pub=${id}; path=/; max-age=${maxAge}; SameSite=Lax`;
      localStorage.setItem('caxton_pub', id);
      localStorage.removeItem('caxton_selected_article');
      localStorage.removeItem('caxton_selected_event');
      window.dispatchEvent(new Event('savedPubChange'));
    } catch {}
    if (typeof window !== 'undefined') {
      window.location.assign(reloadTo);
    }
  }

  function selectComingSoon(id: ComingSoonPubId, label: string) {
    setDrawerOpen(false);
    setNotifyFor({ id, name: label });
    trackEvent('coming_soon_market_click', { market: id });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className={`flex items-center gap-1 text-xs uppercase tracking-[0.2em] font-medium min-h-[44px] ${labelClassName}`}
        aria-label="Select your market"
      >
        <span>Select Your Market</span>
        <span className="text-base leading-none">{'\u203A'}</span>
      </button>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          onClick={() => setDrawerOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-md h-full bg-white shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
              <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium">Select Your Market</p>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="text-gray-400 text-2xl leading-none min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close"
              >
                {'\u00D7'}
              </button>
            </div>
            <div>
              {ACTIVE_MARKETS.map((m) => {
                const isCurrent = currentPub === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => selectActive(m.id)}
                    className="w-full text-left px-4 py-5 border-b border-gray-100 bg-white hover:bg-gray-50 flex items-center gap-4"
                  >
                    <div
                      className="w-12 h-12 rounded-md flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: '#301D5D' }}
                    >
                      <span className="text-white text-sm font-medium">{m.monogram}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-semibold text-gray-900">{m.label}</p>
                    </div>
                    {isCurrent && (
                      <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Current</span>
                    )}
                  </button>
                );
              })}
              {COMING_SOON_MARKETS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => selectComingSoon(m.id, m.label)}
                  className="w-full text-left px-4 py-5 border-b border-gray-100 bg-gray-50 hover:bg-gray-100 flex items-center gap-4"
                >
                  <div
                    className="w-12 h-12 rounded-md flex items-center justify-center flex-shrink-0 opacity-60"
                    style={{ backgroundColor: '#301D5D' }}
                  >
                    <span className="text-white text-sm font-medium">{m.monogram}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-gray-700">{m.label}</p>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 flex-shrink-0">Coming Soon</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {notifyFor && <NotifyMeModal market={notifyFor} onClose={() => setNotifyFor(null)} />}
    </>
  );
}

function NotifyMeModal({
  market,
  onClose,
}: {
  market: { id: ComingSoonPubId; name: string };
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  // Honeypot: bots tend to fill every input. Real users won't see this.
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

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
        return;
      }
      setStatus('success');
      trackEvent('market_interest_signup', { market: market.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setStatus('error');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-md w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        {status === 'success' ? (
          <div className="text-center py-6">
            <p className="text-xl font-semibold text-gray-900 mb-2">You&rsquo;re on the list</p>
            <p className="text-gray-600 mb-6">We&rsquo;ll email you the moment {market.name} launches.</p>
            <button onClick={onClose} className="px-6 py-2 bg-gray-900 text-white rounded-md">Close</button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-xl font-semibold text-gray-900">Notify me when {market.name} launches</h3>
              <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-2">{'\u00D7'}</button>
            </div>
            <p className="text-sm text-gray-500 mb-5">No spam. One email at launch.</p>
            <form onSubmit={submit} className="space-y-3">
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-3 border border-gray-300 rounded-md text-base"
                autoFocus
              />
              <input
                type="text"
                placeholder="Your name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-3 border border-gray-300 rounded-md text-base"
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
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={status === 'submitting'}
                className="w-full px-4 py-3 bg-gray-900 text-white rounded-md font-semibold disabled:opacity-60"
              >
                {status === 'submitting' ? 'Submitting...' : 'Notify me'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
