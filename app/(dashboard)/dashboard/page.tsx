'use client';

/* eslint-disable @typescript-eslint/no-explicit-any -- TODO(S18-lint-debt): retype dashboard properly. 34 `any` types remain pending a proper types pass. */

import { useState, useEffect, useCallback, useRef } from 'react';
import { trackEvent, identifyUser } from "../../posthog-provider";
import { useSwipeBack } from '@/hooks/use-swipe-back';
import ProfilePanel from '@/components/ProfilePanel';
import { getApiBase } from '@/lib/api-base';
import { DashboardHero } from '@/components/dashboard/DashboardHero';
import PushOptInBanner from '@/components/PushOptInBanner';
import { SocialLinks } from '@/components/SocialLinks';
import NewsletterCTA from '@/components/NewsletterCTA';
import SaborReportCard from '@/components/SaborReportCard';
import RealtyLineReportCard from '@/components/RealtyLineReportCard';
import { SW } from '@/lib/style-constants';
import { PUB_META, type PubKey, isPreLaunchPub, isPubKey } from '@/lib/pub-meta';
import { PreLaunchEmptyState } from '@/components/PreLaunchEmptyState';
import { AdSlot as AdSlotComponent } from '@/components/ads/AdSlot';
import { COMING_SOON_PUBS, type ComingSoonPubId } from '@/lib/coming-soon-pubs';
import { share as nativeShare } from '@/lib/native/share';
import { haptics } from '@/lib/native/haptics';
import { isAppleSignInAvailable, signInWithApple } from '@/lib/native/apple-sign-in';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';

const API = getApiBase();

const PUBS = [
  { id: 'realtyline', name: 'RealtyLine', city: 'Austin', tagline: 'Putting A Face on Real Estate since 1995', color: '#301D5D' },
  { id: 'newsline', name: 'Newsline San Antonio', city: 'San Antonio', tagline: 'Founded 1982 - Relaunched 2025', color: '#301D5D' },
];

// BUG-09 / share-404 fix: Share URLs must deep-link into the app. The WP
// permalink (realtyline.us / newslinesa.com / YYYY/MM/DD/slug) doesn't exist
// as a route on realtynewsnow.app, so we emit a stable query param the
// dashboard reads on mount to auto-open the article reader.
function canonicalShareUrl(article?: { id?: string | number | null; link?: string | null } | null): string {
  const base = 'https://realtynewsnow.app/';
  const id = article?.id;
  if (id !== undefined && id !== null && String(id).length > 0) {
    return `${base}?article=${encodeURIComponent(String(id))}`;
  }
  // Fallback: no id available — try to keep the link usable but rooted on app host.
  const link = article?.link;
  if (!link) {
    return typeof window !== 'undefined' ? window.location.href : base;
  }
  try {
    const u = new URL(link, base);
    const externalHosts = ['realtyline.us', 'www.realtyline.us', 'newslinesa.com', 'www.newslinesa.com'];
    if (externalHosts.includes(u.hostname)) {
      return base;
    }
    return u.toString();
  } catch {
    return base;
  }
}

// Social pill removed 2026-06-02 — Facebook Group integration didn't pan out
// (Groups API deprecated by Meta in 2024, OG-tag harvester blocked by FB's
// datacenter-IP filter). Old saved values for caxton_cat_* in localStorage
// that reference 'Social' fall through to 'All' via the validCats check in
// Feed's useState initializer below.
const RL_CATS = ['All', 'ABoR', 'Five Points', 'Featured Advertisers', "Editor's Choice", 'Faces of Real Estate', 'WCR Austin'];
const NS_CATS = ['All', 'SABOR', 'GSABA', 'WCR San Antonio', 'Residential', 'Featured Advertisers', "Editor's Choice", 'Faces of Real Estate'];

const RL_NEWS = [
  { id: 1, cat: 'ABoR', head: 'ABoR Announces 2026 Board Election Results', sum: 'New leadership elected with a focus on affordability and inventory.', time: '2 hours ago' },
  { id: 2, cat: 'Five Points', head: 'Five Points BoR Hosts CE Workshop on Settlement Changes', sum: 'New CE courses cover commission disclosure rules and best practices.', time: '5 hours ago' },
  { id: 3, cat: 'Featured Advertisers', head: 'Austin Title Marks 30 Years Serving Central Texas REALTORS', sum: 'Anniversary milestone celebrated with a new fast-close service tier.', time: '1 day ago' },
  { id: 4, cat: "Editor's Choice", head: 'Austin Home Sales Rise 12% in April', sum: 'The Austin-Round Rock metro saw a jump in closed sales last month.', time: '1 day ago' },
  { id: 5, cat: 'Faces of Real Estate', head: 'Faces of Real Estate: May Profile Edition Released', sum: 'Six Austin agents share their stories, strategies, and 2026 outlook.', time: '2 days ago' },
  { id: 6, cat: 'WCR Austin', head: 'WCR Austin Announces Spring Networking Mixer', sum: 'Members and guests gather May 22 at the Driskill for an evening of connections.', time: '2 days ago' },
];

const NS_NEWS = [
  { id: 1, cat: 'SABOR', head: 'SABOR Announces Annual Awards Finalists', sum: 'Nominees span residential, commercial, and affiliate categories.', time: '3 hours ago' },
  { id: 2, cat: 'GSABA', head: 'GSABA Hosts Builder Certification Workshop', sum: 'Two-day workshop covers green building standards and permit updates.', time: '6 hours ago' },
  { id: 3, cat: 'WCR San Antonio', head: 'WCR San Antonio Hosts Spring Leadership Forum', sum: 'Members convene for networking and professional development sessions.', time: '1 day ago' },
  { id: 4, cat: 'Residential', head: 'San Antonio Median Home Price Hits New High', sum: 'Bexar County saw record prices in April across all segments.', time: '1 day ago' },
  { id: 5, cat: 'Featured Advertisers', head: 'Alamo Title Expands SA Operations With New Branch', sum: 'Local title leader adds capacity to serve South San Antonio agents.', time: '1 day ago' },
  { id: 6, cat: "Editor's Choice", head: 'Pearl District Office Tower Sells for $85M', sum: 'The 12-story Class A tower traded to an out-of-state investor.', time: '2 days ago' },
  { id: 7, cat: 'Faces of Real Estate', head: 'Faces of Real Estate: SA Profile Edition Released', sum: 'Six San Antonio agents share their stories and 2026 strategies.', time: '2 days ago' },
];

const RL_EVTS = [
  { id: 1, title: 'HBA Austin Monthly Luncheon', date: 'May 15, 2026', time: '11:30 AM - 1:00 PM', loc: 'AT&T Conference Center', org: 'HBA of Greater Austin' },
  { id: 2, title: 'ABoR Market Update Breakfast', date: 'May 20, 2026', time: '8:00 AM - 9:30 AM', loc: 'ABoR Building', org: 'Austin Board of REALTORS' },
];

const NS_EVTS = [
  { id: 1, title: 'SABOR Installation Gala', date: 'May 28, 2026', time: '6:00 PM - 9:00 PM', loc: 'JW Marriott SA', org: 'San Antonio Board of REALTORS' },
  { id: 2, title: 'GSABA Builder Awards', date: 'June 5, 2026', time: '6:30 PM - 9:30 PM', loc: 'Tobin Center', org: 'Greater SA Builders Assoc.' },
];

const ADS = [
  { id: 'ad1', biz: 'Austin Title', tag: 'Closing the Deal in 24 Hours', desc: 'Exclusive rates for our print subscribers.', page: 'Page 12, May Issue', url: 'https://realtyline.us', pub: 'realtyline' },
  { id: 'ad2', biz: 'Cornerstone Mortgage', tag: 'Low Rates. Local Service. Fast Close.', desc: 'Serving Austin REALTORS for over 20 years.', page: 'Page 8, May Issue', url: 'https://realtyline.us', pub: 'realtyline' },
  { id: 'ad3', biz: 'Alamo Title', tag: 'San Antonio Closings Made Simple', desc: 'Full-service title and escrow for SA agents.', page: 'Page 6, May Issue', url: 'https://realtyline.us', pub: 'newsline' },
  { id: 'ad4', biz: 'SWBC Mortgage', tag: 'Your Local Lending Partner', desc: 'Competitive rates from a San Antonio original.', page: 'Page 10, May Issue', url: 'https://realtyline.us', pub: 'newsline' },
];

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const TITLES = ['REALTOR','Broker','Associate Broker','Loan Officer','Branch Manager','Escrow Officer','Title Agent','Appraiser','Inspector','Builder','Developer','Property Manager','Other'];
const LICENSE_TYPES = ['TREC #','NMLS #'];

const SUBS = [
  { id: 'ce', label: 'CE & Training Opportunities', desc: 'Continuing education courses for license renewal' },
  { id: 'builder', label: 'Builder/Developer Inventory & Promotions', desc: 'New homes, communities, and incentives' },
  { id: 'events', label: 'Association Events & RSVPs', desc: 'SABOR, ABoR, GSABA, HBA invites and updates' },
];

const SOCIALS: Record<string, { fb: string; ig: string; li: string }> = {
  realtyline: {
    fb: 'https://facebook.com/myrealtyline',
    ig: 'https://www.instagram.com/myrealtyline',
    li: 'https://www.linkedin.com/company/myrealtyline',
  },
  newsline: {
    fb: 'https://www.facebook.com/newslinesa/',
    ig: 'https://www.instagram.com/newsline_sanantonio/',
    li: 'https://www.linkedin.com/company/newsline-san-antonio',
  },
};

// Giveaway popup removed Jun 22 2026 per Tawanna — the
// "Win Free Fuel" / quarterly gas giveaway is no longer offered.

function useMetrics(userId: string | null) {
  const track = useCallback((event: string, data: Record<string, any>) => {
    const payload = { userId, timestamp: new Date().toISOString(), ...data };
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Metrics]', event, payload);
    }
    trackEvent(event, payload);
  }, [userId]);
  return track;
}

function SplashScreen({ onDone }: { onDone: () => void }) {
  const [fade, setFade] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setFade(true), 1200);
    const t2 = setTimeout(() => onDone(), 1500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);
  return (
    <div className="fixed inset-0 bg-[#301D5D] flex flex-col items-center justify-center z-50 transition-opacity duration-500" style={{ ...SW, opacity: fade ? 0 : 1 }}>
      <p className="text-3xl text-white font-semibold tracking-wide text-center px-8">Realty News Now</p>
      <div className="mt-4 flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" style={{ animationDelay: '0s' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" style={{ animationDelay: '0.3s' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" style={{ animationDelay: '0.6s' }} />
      </div>
    </div>
  );
}

function NotifyMeModal({ market, onClose }: { market: { id: ComingSoonPubId; name: string }; onClose: () => void }) {
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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
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
              <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-2">&times;</button>
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

function PubSelector({ onSelect }: { onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [notifyFor, setNotifyFor] = useState<{ id: ComingSoonPubId; name: string } | null>(null);
  return (
    // BUG-pub-selector-clip: previously the content block used
    // justify-center which left ~60% of the screen blank above the picker
    // and meant the dropdown panel had to grow downward into the BottomNav,
    // clipping the coming-soon markets. Top-anchor the content so the
    // picker sits in the upper third of the screen and the dropdown has
    // room to expand below without colliding with the BottomNav.
    <div
      className="fixed inset-0 bg-white flex flex-col items-center z-40"
      style={{
        ...SW,
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 80px)',
      }}
    >
      <div className="w-full max-w-md px-8">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-400 font-medium mb-2 text-center">Realty News Now</p>
        <h2 className="text-2xl text-gray-900 font-semibold text-center mb-3">Select a Publication</h2>
        <p className="text-lg text-gray-400 font-light text-center mb-8">Welcome, we are happy you are here!</p>
        <div className="relative">
          <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-4 border border-gray-300 bg-white text-left rounded-md">
            <span className="text-lg text-gray-500 font-light">Choose your market...</span>
            <span className="text-gray-400 text-base">{open ? '\u25B2' : '\u25BC'}</span>
          </button>
          {open && (
            // BUG-pub-selector-clip: the dropdown previously rendered at
            // full natural height and was clipped at the bottom by the
            // BottomNav, hiding the coming-soon markets (Houston/Dallas)
            // entirely. Constrain to the viewport with vh + safe-area
            // padding and let the list scroll inside the panel.
            <div
              className="absolute top-full left-0 right-0 border border-gray-300 border-t-0 bg-white z-10 overflow-y-auto overscroll-contain"
              style={{
                maxHeight:
                  'calc(100vh - 280px - env(safe-area-inset-bottom, 0px))',
              }}
            >
              {PUBS.map((pub) => (
                <button key={pub.id} onClick={() => onSelect(pub.id)} className="w-full text-left px-4 py-5 border-b border-gray-100 bg-white hover:bg-gray-50">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: pub.color }}>
                      <span className="text-white text-base font-medium">{pub.id === 'realtyline' ? 'RL' : 'NS'}</span>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-gray-900">{pub.name}</p>
                      <p className="text-base text-gray-400 font-light">{pub.city} - {pub.tagline}</p>
                    </div>
                  </div>
                </button>
              ))}
              {COMING_SOON_PUBS.map((pub) => (
                <button
                  key={pub.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setNotifyFor({ id: pub.id, name: pub.name });
                    trackEvent('coming_soon_market_click', { market: pub.id });
                  }}
                  className="w-full text-left px-4 py-5 border-b border-gray-100 bg-gray-50 hover:bg-gray-100"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-md flex items-center justify-center flex-shrink-0 opacity-60" style={{ backgroundColor: pub.color }}>
                      <span className="text-white text-base font-medium">{pub.monogram}</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-lg font-semibold text-gray-700">{pub.name}</p>
                        <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Coming Soon</span>
                      </div>
                      <p className="text-base text-gray-400 font-light">{pub.city} - {pub.tagline}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="text-sm text-gray-300 text-center mt-6 font-light">You can switch publications anytime</p>
      </div>
      {notifyFor && <NotifyMeModal market={notifyFor} onClose={() => setNotifyFor(null)} />}
    </div>
  );
}

function AuthGate({ pub, onAuth }: { pub: string; onAuth: (user: any) => void }) {
  // Honor /auth/sign-in and /auth/sign-up aliases via ?auth=login|signup so
  // visitors land directly on the right form instead of the 'choice' screen.
  const [mode, setMode] = useState<'choice' | 'signup' | 'login' | 'sent'>('choice');
  const [step, setStep] = useState(1);
  const [licenseType, setLicenseType] = useState('TREC #');
  const [licenseNum, setLicenseNum] = useState('');
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [addr1, setAddr1] = useState('');
  const [addr2, setAddr2] = useState('');
  const [city, setCity] = useState('');
  const [zip, setZip] = useState('');
  const [bdayMonth, setBdayMonth] = useState('');
  const [bdayDay, setBdayDay] = useState('');
  const [subs, setSubs] = useState<string[]>([]);
  const [fbHandle, setFbHandle] = useState('');
  const [igHandle, setIgHandle] = useState('');
  const [liHandle, setLiHandle] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Read query params after all state hooks are declared so the lint rule
  // (react-hooks/immutability) doesn't flag forward references.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    queueMicrotask(() => {
      try {
        const params = new URLSearchParams(window.location.search);
        const wanted = params.get('auth');
        if (wanted === 'login' || wanted === 'signup') {
          setMode(wanted);
        }
        // Came from LandingAppleButton after a no-account rejection.
        // Surface a friendly explanation so the user knows why they're
        // looking at the signup form.
        if (params.get('reason') === 'no_apple_account') {
          setError(
            'No Realty News Now account is linked to this Apple ID yet. Create your account below, then sign in with Apple next time.',
          );
          // Clean the URL so the message doesn't reappear on refresh.
          try {
            const url = new URL(window.location.href);
            url.searchParams.delete('reason');
            window.history.replaceState(null, '', url.toString());
          } catch {}
        }
      } catch {}
    });
  }, []);

  const info = PUBS.find((p) => p.id === pub) || PUBS[0];

  const ic = 'w-full px-4 py-3.5 border border-gray-300 text-base font-light bg-white focus:outline-none focus:border-[#301D5D] mb-3 placeholder:text-[#d1d5db]';
  const sc = 'w-full px-4 py-3.5 border border-gray-300 text-base font-light bg-white focus:outline-none focus:border-[#301D5D] mb-3 appearance-none placeholder:text-[#d1d5db]';

  async function handleSignup() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(API + '/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          firstName: fullName.split(' ')[0] || fullName,
          lastName: fullName.split(' ').slice(1).join(' ') || '',
          email,
          market: pub === 'realtyline' ? 'austin' : 'san_antonio',
          licenseType,
          licenseNumber: licenseNum || undefined,
          title: title || undefined,
          mobile: mobile || undefined,
          mailingAddress: addr1 || undefined,
          mailingAddress2: addr2 || undefined,
          city: city || undefined,
          state: 'TX',
          zip: zip || undefined,
          birthdayMonth: bdayMonth || undefined,
          birthdayDay: bdayDay || undefined,
          subscriptions: subs,
          fbHandle: fbHandle || undefined,
          igHandle: igHandle || undefined,
          liHandle: liHandle || undefined,
          password: password || undefined,
          consentText: 'I agree to receive communications from Caxton Publications, Inc.',
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        // New: when the user set a password during signup, the API now
        // auto-verifies the email and issues a session cookie in the same
        // response. This is the critical fix for iOS Capacitor — the magic
        // link from email would open in Safari (separate cookie jar) and
        // never sign the in-app WebView in. Calling /auth/me with credentials
        // confirms the cookie landed, then we hand the realtor to onAuth.
        if (data?.autoSignedIn) {
          trackEvent('signup_auto_signed_in', { mode: 'signup', email, pub });
          try {
            const meRes = await fetch(API + '/auth/me', { credentials: 'include' });
            if (meRes.ok) {
              const meData = await meRes.json().catch(() => ({}));
              const realtor = meData?.realtor || meData;
              if (realtor?.id) {
                void haptics.notify('success');
                try { window.dispatchEvent(new CustomEvent('caxton:authSuccess', { detail: { mode: 'signup' } })); } catch {}
                onAuth({
                  id: realtor.id,
                  email: realtor.email,
                  firstName: realtor.first_name,
                  lastName: realtor.last_name,
                  ...realtor,
                });
                setLoading(false);
                return;
              }
            }
          } catch {
            // Fall through to 'sent' so the user can still complete via email.
          }
        }
        trackEvent('magic_link_requested', { mode: 'signup', email, pub });
        setMode('sent');
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.message || 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Cannot reach server. Is the API running?');
    }
    setLoading(false);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function handleLogin() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(API + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        trackEvent('magic_link_requested', { mode: 'login', email, pub });
        setMode('sent');
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.message || 'Email not found. Try creating an account.');
      }
    } catch {
      setError('Cannot reach server. Is the API running?');
    }
    setLoading(false);
  }


  async function handleAppleSignIn() {
    setError('');
    setLoading(true);
    void haptics.medium();
    try {
      const result = await signInWithApple();
      if (!result) {
        // User canceled or plugin unavailable. Silent — no error message.
        setLoading(false);
        return;
      }
      const res = await fetch(API + '/auth/apple', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identityToken: result.identityToken,
          email: result.email,
          givenName: result.givenName,
          familyName: result.familyName,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // 404 + error: 'account_not_found' — the server rejected because no
        // realtor is linked to this Apple ID. Route the user to signup with
        // a clear explanation instead of the generic failure copy.
        if (res.status === 404 && data?.error === 'account_not_found') {
          trackEvent('apple_signin_no_account', { pub });
          void haptics.notify('warning');
          setError(
            data?.message ||
              'No Realty News Now account is linked to this Apple ID. Create an account first, then sign in with Apple.',
          );
          setMode('signup');
          setLoading(false);
          return;
        }
        throw new Error(data.message || data.error || 'Apple sign-in failed');
      }
      const meRes = await fetch(API + '/auth/me', { credentials: 'include' });
      if (!meRes.ok) throw new Error('Signed in but could not load your account');
      const meData = await meRes.json();
      const realtor = meData.realtor || meData;
      trackEvent('apple_signin_succeeded', { pub });
      void haptics.notify('success');
      try { window.dispatchEvent(new CustomEvent('caxton:authSuccess', { detail: { mode: 'apple' } })); } catch {}
      onAuth({
        id: realtor.id,
        email: realtor.email,
        firstName: realtor.first_name,
        lastName: realtor.last_name,
        ...realtor,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Apple sign-in failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordLogin() {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(API + '/auth/password-login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Sign-in failed');
      }
      const meRes = await fetch(API + '/auth/me', { credentials: 'include' });
      if (!meRes.ok) throw new Error('Signed in but could not load your account');
      const meData = await meRes.json();
      const realtor = meData.realtor || meData;
      trackEvent('password_signin_succeeded', { pub });
      void haptics.notify('success');
      try { window.dispatchEvent(new CustomEvent('caxton:authSuccess', { detail: { mode: 'password' } })); } catch {}
      onAuth({
        id: realtor.id,
        email: realtor.email,
        firstName: realtor.first_name,
        lastName: realtor.last_name,
        ...realtor,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Sign-in failed';
      setError(msg);
      trackEvent('password_signin_failed', { reason: msg.slice(0, 200), pub });
    } finally {
      setLoading(false);
    }
  }

  // Guest sign-in removed: every visitor must create an account or sign in.
  // Legacy `user.guest` checks lower in the file are intentionally retained
  // so any pre-existing guest session left in someone's localStorage
  // degrades gracefully rather than throwing.

  if (mode === 'sent') {
    return (
      <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-40" style={SW}>
        <div className="w-full max-w-md px-8 text-center">
          <div className="text-5xl mb-4">{'\u2709'}</div>
          <h2 className="text-2xl text-gray-900 font-semibold mb-3">Check Your Email</h2>
          <p className="text-lg text-gray-500 font-light mb-2">We sent a magic link to</p>
          <p className="text-lg text-[#301D5D] font-semibold mb-6">{email}</p>
          <p className="text-base text-gray-400 font-light mb-8">Click the link in your email to sign in. It expires in 15 minutes.</p>
          <p className="text-sm text-gray-300 font-light">Check your spam folder if you do not see it.</p>
        </div>
      </div>
    );
  }

  if (mode === 'signup') {
    return (
      <div className="fixed inset-0 bg-white z-40 overflow-y-auto" style={SW}>
        <div className="min-h-full flex flex-col items-center py-10">
          <div className="w-full max-w-md px-8">
            <p className="text-sm uppercase tracking-[0.2em] font-medium mb-2 text-center" style={{ color: info.color }}>Realty News Now</p>
            <h2 className="text-2xl text-gray-900 font-semibold text-center mb-8">Create Your Account</h2>

            {/* Step indicators */}
            <div className="flex items-center justify-center gap-2 mb-6">
              <div className={step >= 1 ? 'w-3 h-3 rounded-full bg-[#301D5D]' : 'w-3 h-3 rounded-full bg-gray-200'} />
              <div className="w-8 h-px bg-gray-200" />
              <div className={step >= 2 ? 'w-3 h-3 rounded-full bg-[#301D5D]' : 'w-3 h-3 rounded-full bg-gray-200'} />
              <div className="w-8 h-px bg-gray-200" />
              <div className={step >= 3 ? 'w-3 h-3 rounded-full bg-[#301D5D]' : 'w-3 h-3 rounded-full bg-gray-200'} />
            </div>

            {error && <p className="text-base text-red-500 text-center mb-4 font-light">{error}</p>}

            {/* Step 1: License + Identity */}
            {step === 1 && (
              <div>
                {isAppleSignInAvailable() && (
                  <>
                    <button
                      onClick={handleAppleSignIn}
                      disabled={loading}
                      aria-label="Sign up with Apple"
                      className="w-full flex items-center justify-center gap-2 py-3.5 text-base font-medium rounded-md bg-black text-white disabled:opacity-40 mb-3"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.05 12.04c-.02-2.7 2.2-3.99 2.3-4.06-1.26-1.84-3.21-2.09-3.9-2.12-1.66-.17-3.24.97-4.08.97-.85 0-2.15-.95-3.54-.92-1.82.03-3.5 1.06-4.44 2.69-1.89 3.28-.48 8.13 1.36 10.79.9 1.3 1.97 2.76 3.36 2.7 1.35-.05 1.86-.87 3.49-.87 1.62 0 2.08.87 3.51.84 1.45-.02 2.37-1.32 3.26-2.63 1.02-1.51 1.45-2.97 1.47-3.05-.03-.01-2.82-1.08-2.85-4.29zm-2.69-7.86c.75-.9 1.25-2.16 1.11-3.41-1.07.04-2.37.71-3.14 1.61-.7.79-1.31 2.07-1.14 3.29 1.19.09 2.41-.6 3.17-1.49z"/></svg>
                      <span>Sign up with Apple</span>
                    </button>
                    <div className="flex items-center my-4" aria-hidden="true">
                      <div className="flex-1 h-px bg-gray-200" />
                      <span className="px-3 text-xs uppercase tracking-wider text-gray-400">or fill out manually</span>
                      <div className="flex-1 h-px bg-gray-200" />
                    </div>
                  </>
                )}
                <p className="text-sm uppercase tracking-wider text-gray-400 font-medium mb-3">License Number</p>
                <div className="flex gap-2 mb-3">
                  {LICENSE_TYPES.map((lt) => (
                    <button key={lt} onClick={() => setLicenseType(lt)} className={licenseType === lt ? 'flex-1 py-3 text-base font-medium text-center border-2 border-[#301D5D] text-[#301D5D]' : 'flex-1 py-3 text-base font-light text-center border border-gray-300 text-gray-500'}>{lt}</button>
                  ))}
                </div>
                <input type="text" placeholder={licenseType === 'TREC #' ? 'TREC License Number' : 'NMLS ID Number'} value={licenseNum} onChange={(e) => setLicenseNum(e.target.value)} className={ic} />
<p className="text-sm uppercase tracking-wider text-gray-400 font-medium mb-3 mt-6">Your Information</p>
                <input type="text" placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} className={ic} />
                <select value={title} onChange={(e) => setTitle(e.target.value)} className={sc + (!title ? ' text-[#d1d5db]' : ' text-gray-900')}>
                  <option value="">Select Title / Role</option>
                  {TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>

                <button onClick={() => { void haptics.light(); setStep(2); }} disabled={!fullName || !licenseNum} className="w-full text-center py-3.5 text-base font-medium uppercase tracking-wider text-white mt-4 disabled:opacity-40" style={{ backgroundColor: info.color }}>Continue</button>
                <button onClick={() => setMode('choice')} className="w-full text-center py-2 text-base text-gray-400 font-light mt-2">Back</button>
              </div>
            )}

            {/* Step 2: Contact Info */}
            {step === 2 && (
              <div>
                <p className="text-sm uppercase tracking-wider text-gray-400 font-medium mb-3">Contact Information</p>
                <input type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} className={ic} />
                <input type="tel" placeholder="Mobile Phone" value={mobile} onChange={(e) => setMobile(e.target.value)} className={ic} />

                <p className="text-sm uppercase tracking-wider text-gray-400 font-medium mb-3 mt-4">Create a Password</p>
                <div className="relative mb-3">
                  <input type={showPassword ? 'text' : 'password'} placeholder="Password (at least 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} className={ic + ' pr-16'} autoComplete="new-password" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3.5 text-xs uppercase tracking-wider text-gray-400">{showPassword ? 'Hide' : 'Show'}</button>
                </div>
                <input type={showPassword ? 'text' : 'password'} placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={ic} autoComplete="new-password" />
                <p className="text-xs text-gray-400 font-light mb-2">Used for sign-in.</p>

                <p className="text-sm uppercase tracking-wider text-gray-400 font-medium mb-3 mt-4">Mailing Address</p>
                <input type="text" placeholder="Street Address" value={addr1} onChange={(e) => setAddr1(e.target.value)} className={ic} />
                <input type="text" placeholder="Suite / Unit (optional)" value={addr2} onChange={(e) => setAddr2(e.target.value)} className={ic} />
                <div className="flex gap-2">
                  <input type="text" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} className={ic + ' flex-1'} />
                  <input type="text" value="TX" disabled className="w-16 px-4 py-3.5 border border-gray-200 text-base font-light bg-gray-50 text-gray-400 mb-3 text-center rounded-md" />
                  <input type="text" placeholder="Zip" value={zip} onChange={(e) => setZip(e.target.value)} className="w-24 px-4 py-3.5 border border-gray-300 text-base font-light bg-white focus:outline-none focus:border-[#301D5D] mb-3" />
                </div>

                <div className="flex gap-2 mt-2">
                  <button onClick={() => { void haptics.light(); setStep(1); }} className="flex-1 text-center py-3.5 text-base font-medium uppercase tracking-wider border border-gray-300 text-gray-500 rounded-md">Back</button>
                  <button onClick={() => {
                    if (!password || password.length < 8) { setError('Password must be at least 8 characters'); void haptics.notify('error'); return; }
                    if (password !== confirmPassword) { setError('Passwords do not match'); void haptics.notify('error'); return; }
                    setError('');
                    void haptics.light();
                    setStep(3);
                  }} disabled={!email || !password || !confirmPassword} className="flex-1 text-center py-3.5 text-base font-medium uppercase tracking-wider text-white disabled:opacity-40" style={{ backgroundColor: info.color }}>Continue</button>
                </div>
              </div>
            )}

            {/* Step 3: Subscriptions + Birthday + Review */}
            {step === 3 && (
              <div>
                <p className="text-sm uppercase tracking-wider text-gray-400 font-medium mb-3">Email Subscriptions</p>
                <p className="text-sm text-gray-400 font-light mb-3">Choose which lists you want to receive. You can change these anytime.</p>
                <div className="space-y-2 mb-6">
                  {SUBS.map((s) => (
                    <label key={s.id} className="flex items-start gap-3 p-3 border border-gray-200 cursor-pointer rounded-md">
                      <input
                        type="checkbox"
                        checked={subs.includes(s.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSubs([...subs, s.id]);
                          else setSubs(subs.filter((x) => x !== s.id));
                        }}
                        className="mt-1 w-4 h-4 accent-[#301D5D]"
                      />
                      <div className="flex-1">
                        <p className="text-base text-gray-900 font-medium">{s.label}</p>
                        <p className="text-sm text-gray-400 font-light">{s.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>

                <p className="text-sm uppercase tracking-wider text-gray-400 font-medium mb-3">Birthday (optional)</p>
                <p className="text-sm text-gray-400 font-light mb-3">So we can wish you a happy birthday!</p>
                <div className="flex gap-2 mb-6">
                  <select value={bdayMonth} onChange={(e) => setBdayMonth(e.target.value)} className={sc + ' flex-1' + (!bdayMonth ? ' text-[#d1d5db]' : ' text-gray-900')}>
                    <option value="">Month</option>
                    {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select value={bdayDay} onChange={(e) => setBdayDay(e.target.value)} className={sc + ' w-24' + (!bdayDay ? ' text-[#d1d5db]' : ' text-gray-900')}>
                    <option value="">Day</option>
                    {DAYS.map((d) => <option key={d} value={String(d)}>{d}</option>)}
                  </select>
                </div>

                <p className="text-sm uppercase tracking-wider text-gray-400 font-medium mb-3">Social Handles (optional)</p>
                <div className="space-y-2 mb-6">
                  <input type="text" placeholder="Facebook handle (e.g. @yourname)" value={fbHandle} onChange={(e) => setFbHandle(e.target.value)} className={ic + ' mb-0'} />
                  <input type="text" placeholder="Instagram handle (e.g. @yourname)" value={igHandle} onChange={(e) => setIgHandle(e.target.value)} className={ic + ' mb-0'} />
                  <input type="text" placeholder="LinkedIn name or profile URL" value={liHandle} onChange={(e) => setLiHandle(e.target.value)} className={ic + ' mb-0'} />
                </div>

                <p className="text-sm uppercase tracking-wider text-gray-400 font-medium mb-3">Review Your Info</p>
                <div className="bg-gray-50 border border-gray-200 p-4 mb-4 space-y-2 rounded-md">
                  <p className="text-base text-gray-900 font-medium">{fullName}</p>
                  <p className="text-sm text-gray-500 font-light">{title || 'No title selected'}</p>
                  <p className="text-sm text-gray-500 font-light">{licenseType} {licenseNum}</p>
                  <p className="text-sm text-gray-500 font-light">{email}</p>
                  {mobile && <p className="text-sm text-gray-500 font-light">{mobile}</p>}
                  {addr1 && <p className="text-sm text-gray-500 font-light">{addr1}{addr2 ? ', ' + addr2 : ''}</p>}
                  {city && <p className="text-sm text-gray-500 font-light">{city}, TX {zip}</p>}
                  {bdayMonth && <p className="text-sm text-gray-500 font-light">{bdayMonth} {bdayDay}</p>}
                  {(fbHandle || igHandle || liHandle) && (
                    <p className="text-sm text-gray-500 font-light">
                      {[fbHandle && 'FB: ' + fbHandle, igHandle && 'IG: ' + igHandle, liHandle && 'LI: ' + liHandle].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>

                <p className="text-xs text-gray-500 font-light mb-3">Your license number is used only to avoid duplicate records and for RealtyLine&apos;s use only. It is never shared, sold or displayed publicly.</p>
                <p className="text-xs text-gray-400 font-light mb-4">By creating an account, you agree to receive communications from Caxton Publications, Inc. We will send a magic link to your email - no password needed.</p>

                <div className="flex gap-2">
                  <button onClick={() => { void haptics.light(); setStep(2); }} className="flex-1 text-center py-3.5 text-base font-medium uppercase tracking-wider border border-gray-300 text-gray-500 rounded-md">Back</button>
                  <button onClick={() => { void haptics.medium(); void handleSignup(); }} disabled={loading} className="flex-1 text-center py-3.5 text-base font-medium uppercase tracking-wider text-white disabled:opacity-40" style={{ backgroundColor: info.color }}>{loading ? 'Sending...' : 'Create Account'}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'login') {
    return (
      <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-40" style={SW}>
        <div className="w-full max-w-md px-8">
          <p className="text-sm uppercase tracking-[0.2em] font-medium mb-2 text-center" style={{ color: info.color }}>Realty News Now</p>
          <h2 className="text-2xl text-gray-900 font-semibold text-center mb-6">Welcome Back</h2>
          {error && <p className="text-base text-red-500 text-center mb-4 font-light">{error}</p>}
          <input type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} className={ic} autoComplete="username" />
          <div className="relative mb-3">
            <input type={showPassword ? 'text' : 'password'} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={ic + ' pr-16'} autoComplete="current-password" onKeyDown={(e) => { if (e.key === 'Enter') handlePasswordLogin(); }} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3.5 text-xs uppercase tracking-wider text-gray-400">{showPassword ? 'Hide' : 'Show'}</button>
          </div>
          <button onClick={() => { void haptics.medium(); void handlePasswordLogin(); }} disabled={loading || !email || !password} className="w-full text-center py-3.5 text-base font-medium uppercase tracking-wider text-white mb-3 disabled:opacity-40" style={{ backgroundColor: info.color }}>{loading ? 'Signing in…' : 'Sign In'}</button>
          {isAppleSignInAvailable() && (
            <>
              <div className="flex items-center my-3" aria-hidden="true">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="px-3 text-xs uppercase tracking-wider text-gray-400">or</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <button
                onClick={handleAppleSignIn}
                disabled={loading}
                aria-label="Sign in with Apple"
                className="w-full flex items-center justify-center gap-2 py-3.5 text-base font-medium rounded-md bg-black text-white disabled:opacity-40 mb-3"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.05 12.04c-.02-2.7 2.2-3.99 2.3-4.06-1.26-1.84-3.21-2.09-3.9-2.12-1.66-.17-3.24.97-4.08.97-.85 0-2.15-.95-3.54-.92-1.82.03-3.5 1.06-4.44 2.69-1.89 3.28-.48 8.13 1.36 10.79.9 1.3 1.97 2.76 3.36 2.7 1.35-.05 1.86-.87 3.49-.87 1.62 0 2.08.87 3.51.84 1.45-.02 2.37-1.32 3.26-2.63 1.02-1.51 1.45-2.97 1.47-3.05-.03-.01-2.82-1.08-2.85-4.29zm-2.69-7.86c.75-.9 1.25-2.16 1.11-3.41-1.07.04-2.37.71-3.14 1.61-.7.79-1.31 2.07-1.14 3.29 1.19.09 2.41-.6 3.17-1.49z"/></svg>
                <span>Sign in with Apple</span>
              </button>
            </>
          )}
          <button onClick={() => { if (typeof window !== 'undefined') window.location.href = '/auth/forgot-password'; }} className="w-full text-center py-2 text-sm text-gray-500 font-light">Forgot password?</button>
          <button onClick={() => setMode('choice')} className="w-full text-center py-2 text-base text-gray-400 font-light">Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-40" style={SW}>
      <div className="w-full max-w-md px-8">
        <p className="text-sm uppercase tracking-[0.2em] font-medium mb-2 text-center" style={{ color: info.color }}>Realty News Now</p>
        <h2 className="text-2xl text-gray-900 font-semibold text-center mb-2">Sign In to Continue</h2>
        <button onClick={() => setMode('signup')} className="w-full text-center py-3.5 text-base font-medium uppercase tracking-wider text-white mb-3" style={{ backgroundColor: info.color }}>Create Your Account</button>
        <button onClick={() => setMode('login')} className="w-full text-center py-3.5 text-base font-medium uppercase tracking-wider border border-gray-300 text-gray-700 mb-3 rounded-md">I Already Have an Account</button>
        {isAppleSignInAvailable() && (
          <>
            <div className="flex items-center my-4" aria-hidden="true">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="px-3 text-xs uppercase tracking-wider text-gray-400">or</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
            <button
              onClick={handleAppleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 text-base font-medium rounded-md bg-black text-white disabled:opacity-40"
              aria-label="Sign in with Apple"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.05 12.04c-.02-2.7 2.2-3.99 2.3-4.06-1.26-1.84-3.21-2.09-3.9-2.12-1.66-.17-3.24.97-4.08.97-.85 0-2.15-.95-3.54-.92-1.82.03-3.5 1.06-4.44 2.69-1.89 3.28-.48 8.13 1.36 10.79.9 1.3 1.97 2.76 3.36 2.7 1.35-.05 1.86-.87 3.49-.87 1.62 0 2.08.87 3.51.84 1.45-.02 2.37-1.32 3.26-2.63 1.02-1.51 1.45-2.97 1.47-3.05-.03-.01-2.82-1.08-2.85-4.29zm-2.69-7.86c.75-.9 1.25-2.16 1.11-3.41-1.07.04-2.37.71-3.14 1.61-.7.79-1.31 2.07-1.14 3.29 1.19.09 2.41-.6 3.17-1.49z"/></svg>
              <span>Sign in with Apple</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [phase, setPhase] = useState('splash');
  // caxton-article-reader-b1-state
  const [selectedArticle, setSelectedArticle] = useState<any | null>(null);
  // caxton-article-reader-b2a-fix
  const [globalArticles, setGlobalArticles] = useState<any[]>([]);
  const [newsRefreshNonce, setNewsRefreshNonce] = useState(0);
  const [pub, setPub] = useState('');
  const [user, setUser] = useState<any>(null);
  const [hydrated, setHydrated] = useState(false);

  // Rehydrate from localStorage so refresh stays where the user was.
  useEffect(() => {
    let cancelled = false;
    try {
      const savedPub = localStorage.getItem('caxton_pub');
      const savedPhase = localStorage.getItem('caxton_phase');
      const savedArticle = localStorage.getItem('caxton_selected_article');
      if (savedPub === 'realtyline' || savedPub === 'newsline') {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- TODO(S18-lint-debt): restructure rehydration effect
        setPub(savedPub);
      }
      // Restore selections BEFORE phase so the phase render has its data.
      if (savedArticle) {
        try { setSelectedArticle(JSON.parse(savedArticle)); } catch {}
      }
      if (savedPhase && savedPhase !== 'splash') {
        // BUG-01 followup: previously we kicked refresh-on-article back to
        // the feed when on the app root. User pushback: refreshing while
        // reading an article SHOULD keep you on that article. Only fall
        // back to feed when the saved-article payload is missing (stale).
        // Stale-data guard: don't restore article phase if its data is missing.
        if (savedPhase === 'article' && !savedArticle) {
          setPhase('feed');
        } else if (savedPhase === 'events' || savedPhase === 'event_detail') {
          // Legacy phases — events lives at /calendar now. Land on feed; the
          // user can re-navigate via BottomNav.
          setPhase('feed');
        } else {
          setPhase(savedPhase);
        }
      }
    } catch {}

    // Check if we already have a server session. If there is NO realtor on
    // the server, we must override any saved localStorage phase that would
    // render protected content (feed/article). The edge proxy already
    // blocks unauthenticated access to /dashboard, but when the dashboard
    // is reached via the documented ?auth=login|signup bypass for the
    // sign-in form, the AuthGate must be the only thing visible.
    fetch(`${API}/auth/me`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.realtor) {
          setUser(data.realtor); identifyUser(data.realtor?.id || null, { email: data.realtor?.email });
          // Only force feed when there's no real content phase to restore.
          // Auth-flow phases (splash/select/auth) should fall through to feed;
          // content phases (feed/article) stay put. (magazines moved to /magazine in S23.)
          const savedPhaseForAuth = (() => { try { return localStorage.getItem('caxton_phase'); } catch { return null; } })();
          const contentPhases = ['feed', 'article'];
          if (!savedPhaseForAuth || !contentPhases.includes(savedPhaseForAuth)) {
            setPhase('feed');
          }
        } else {
          // No server session — force the AuthGate regardless of saved phase.
          // This closes a content-leak window where a stale localStorage
          // 'caxton_phase=feed' could briefly render feed components for a
          // signed-out visitor who reached /dashboard?auth=login.
          setUser(null);
          setPhase('auth');
          try { localStorage.removeItem('caxton_phase'); } catch {}
        }
      })
      .catch(() => {
        // Treat /api/auth/me network failures as logged-out for safety.
        if (cancelled) return;
        setUser(null);
        setPhase('auth');
      });

    setHydrated(true);
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist phase + pub on every change (after initial hydration).
  useEffect(() => {
    if (!hydrated) return;
    try {
      const maxAge = 60 * 60 * 24 * 365;
      if (pub === 'realtyline' || pub === 'newsline') {
        document.cookie = `caxton_pub=${pub}; path=/; max-age=${maxAge}; SameSite=Lax`;
        localStorage.setItem('caxton_pub', pub);
      } else {
        document.cookie = 'caxton_pub=; path=/; max-age=0; SameSite=Lax';
        localStorage.removeItem('caxton_pub');
      }
      if (phase && phase !== 'splash') {
        localStorage.setItem('caxton_phase', phase);
      } else {
        localStorage.removeItem('caxton_phase');
      }
    } catch {}
  }, [phase, pub, hydrated]);

  // Persist selected article + event so refresh on those phases restores them.
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (selectedArticle) {
        localStorage.setItem('caxton_selected_article', JSON.stringify(selectedArticle));
      } else {
        localStorage.removeItem('caxton_selected_article');
      }
    } catch {}
  }, [selectedArticle, hydrated]);




  // caxton-article-reader-b1-listener
  useEffect(() => {
    const onOpenArticle = (e: any) => {
      const article = e?.detail;
      if (article && typeof article === 'object') {
        trackEvent('article_opened', { article_id: article?.id, article_title: article?.title, article_cat: article?.cat, pub: article?.pub });
        setSelectedArticle(article);
        setPhase('article');
      }
    };
    window.addEventListener('caxton:openArticle', onOpenArticle as EventListener);
    return () => window.removeEventListener('caxton:openArticle', onOpenArticle as EventListener);
  }, []);

  // share-deep-link: if URL has ?article=<id>, open that article in the reader
  // once we have the news list. Runs only once per id; strips the param after.
  const deepLinkConsumedRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const wantId = params.get('article');
    if (!wantId || deepLinkConsumedRef.current === wantId) return;
    if (!globalArticles || globalArticles.length === 0) return;
    const match = globalArticles.find((a: any) => String(a?.id) === String(wantId));
    if (match) {
      deepLinkConsumedRef.current = wantId;
      trackEvent('article_opened', { article_id: match?.id, article_title: match?.title, article_cat: match?.cat, pub: match?.pub, source: 'share_link' });
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: deep-link from URL query param into reader once data loads
      setSelectedArticle(match);
      setPhase('article');
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('article');
        window.history.replaceState({}, '', url.toString());
      } catch {}
    }
  }, [globalArticles]);

  // caxton-article-reader-b2a-fix (newsList listener)
  useEffect(() => {
    const onNewsList = (e: any) => {
      const list = e?.detail;
      if (Array.isArray(list)) setGlobalArticles(list);
    };
    window.addEventListener('caxton:newsList', onNewsList as EventListener);
    return () => window.removeEventListener('caxton:newsList', onNewsList as EventListener);
  }, []);

  // caxton-events-frontend-v1-fetch (nav listener)
  useEffect(() => {
    const onNav = (e: any) => {
      const target = e?.detail;
      if (target === 'feed') {
        trackEvent('nav', { target });
        setPhase('feed');
      }
    };
    window.addEventListener('caxton:nav', onNav as EventListener);
    return () => window.removeEventListener('caxton:nav', onNav as EventListener);
  }, []);

  // S19: Hash routing for external links (e.g. /dashboard#magazines from email).
  // Fires once when phase first reaches 'feed' (post-auth). Clears the hash so
  // refreshing the same URL doesn't re-trigger. Dispatches the same caxton:nav
  // event the BottomNav uses — single code path for in-app and external nav.
  const hashConsumedRef = useRef(false);
  useEffect(() => {
    if (hashConsumedRef.current) return;
    if (phase !== 'feed') return;
    if (typeof window === 'undefined') return;
    const hash = window.location.hash.replace(/^#/, '').toLowerCase();
    if (hash === 'events') {
      // Redirect old /dashboard#events shares to the new /calendar route.
      hashConsumedRef.current = true;
      window.location.replace('/calendar');
      return;
    }
    if (hash === 'magazines') {
      // Redirect legacy /dashboard#magazines shares to the new /magazine route (S23).
      hashConsumedRef.current = true;
      window.location.replace('/magazine');
      return;
    } else if (hash === 'feed' || hash === '') {
      hashConsumedRef.current = true;
    }
  }, [phase]);

  if (phase === 'splash') return <SplashScreen onDone={() => { trackEvent('splash_dismissed'); setPhase('select'); }} />;
  if (phase === 'select') return <PubSelector onSelect={(id) => { trackEvent('pub_selected', { pub: id }); setPub(id); setPhase('auth'); }} />;
  if (phase === 'auth') return <AuthGate pub={pub} onAuth={(u) => { setUser(u); identifyUser(u?.id || null, { email: u?.email }); trackEvent('auth_completed', { is_guest: !!u?.guest, pub }); setPhase('feed'); }} />;

  
  // caxton-article-reader-b1-phase
  // caxton-article-reader-b2a (passes news list for Read Next)
  if (phase === 'article')
    return (
      <ArticleReader
        pub={pub}
        article={selectedArticle}
        allArticles={globalArticles}
        onBack={() => setPhase('feed')}
        onLatest={() => { setNewsRefreshNonce((n) => n + 1); setPhase('feed'); }}
        onSelectArticle={(a: any) => setSelectedArticle(a)}
      />
    );
  return (
    <Feed
      pub={pub}
      user={user}
      onSwitch={(id) => { setPub(id); }}
      newsRefreshNonce={newsRefreshNonce}
      onRefresh={() => { setNewsRefreshNonce((n) => n + 1); }}
    />
  );
}

function Feed({ pub, user, onSwitch, newsRefreshNonce, onRefresh }: { pub: string; user: any; onSwitch: (id: string) => void; newsRefreshNonce: number; onRefresh: () => void }) {
  const [tab, setTab] = useState('n');

  // Pull-to-refresh on touch devices. Only active when scrolled to top and
  // user is on the news tab — calls onRefresh() which bumps newsRefreshNonce
  // in the parent, forcing the /news effect below to refetch.
  const ptr = usePullToRefresh(async () => {
    if (tab !== 'n') return;
    void haptics.medium();
    onRefresh();
  });

  // Read saved cat synchronously on mount so the first client paint shows
  // the correct pill (no 'All' → 'Social' flash). On the server this falls
  // back to 'All' since there's no window; the client may then re-render
  // with the saved value — React tolerates this since the difference is
  // inside our component's state, not the rendered HTML.
  const initialCat = (() => {
    if (typeof window === 'undefined') return 'All';
    try {
      const saved = window.localStorage.getItem(`caxton_cat_${pub}`);
      const validCats = pub === 'realtyline' ? RL_CATS : NS_CATS;
      return saved && validCats.includes(saved) ? saved : 'All';
    } catch {
      return 'All';
    }
  })();
  const [cat, setCatState] = useState(initialCat);

  // Wrap setCat so every category change persists to localStorage.
  const setCat = useCallback((next: string) => {
    setCatState(next);
    try {
      window.localStorage.setItem(`caxton_cat_${pub}`, next);
    } catch {}
  }, [pub]);

  // When pub changes mid-session, re-sync cat to the saved value for the
  // newly-active pub (or 'All' if nothing's saved / saved value is invalid).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(`caxton_cat_${pub}`);
      const validCats = pub === 'realtyline' ? RL_CATS : NS_CATS;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional sync of cat to current pub on pub change
      setCatState(saved && validCats.includes(saved) ? saved : 'All');
    } catch {}
  }, [pub]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [marketDrawerOpen, setMarketDrawerOpen] = useState(false);
  const [marketNotifyFor, setMarketNotifyFor] = useState<{ id: ComingSoonPubId; name: string } | null>(null);
  const track = useMetrics(user?.id || null);
  // For launched pubs (realtyline, newsline) `info` comes from the legacy
  // PUBS array which carries the marketing-copy tagline. For pre-launch
  // pubs (Houston/Dallas) fall through to PUB_META so the header still
  // brands correctly (RealtyLine navy + city name) and surface tabs can
  // render the PreLaunchEmptyState without crashing on undefined info.
  const pubMetaEntry = isPubKey(pub) ? PUB_META[pub] : undefined;
  const info =
    PUBS.find((p) => p.id === pub) ??
    (pubMetaEntry
      ? {
          id: pub,
          name: pubMetaEntry.name,
          city: pubMetaEntry.city,
          tagline: pubMetaEntry.tagline,
          color: pubMetaEntry.color,
        }
      : PUBS[0]);
  // Pre-launch markets short-circuit every content surface to the shared
  // empty state (Phase 2 PR C). They still get the branded header above
  // and the bottom nav below — only the tab body is replaced.
  const showPreLaunch = isPubKey(pub) && isPreLaunchPub(pub);
  const pubKey: PubKey | null = isPubKey(pub) ? pub : null;
  const [liveNews, setLiveNews] = useState<any[] | null>(null);
  // caxton-article-reader-b2a-fix (dispatcher)
  useEffect(() => {
    if (liveNews && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('caxton:newsList', { detail: liveNews }));
    }
  }, [liveNews]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState<string | null>(null);
  // caxton-social-v1 social fetch removed 2026-06-02. Endpoint /api/social/feed
  // and DB table featured_social_posts kept on disk in case curation comes back.

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- TODO(S18-lint-debt): restructure fetch-with-loading-state
    setNewsLoading(true);
    setNewsError(null);
    const market = pub === 'realtyline' ? 'austin' : 'san_antonio';
    fetch(`${API}/news/${market}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.articles) ? data.articles : [];
        setLiveNews(list);
        setNewsLoading(false);
        console.log(`[News] Loaded ${list.length} articles for ${market}`);
      })
      .catch((err) => {
        if (cancelled) return;
        setNewsError(String(err?.message || err));
        setNewsLoading(false);
        console.warn(`[News] Failed to load ${market}:`, err);
      });
    return () => {
      cancelled = true;
    };
  }, [pub, newsRefreshNonce]);

  const fallbackNews = pub === 'realtyline' ? RL_NEWS : NS_NEWS;
  // While first fetch is in flight, NEWS is empty -> skeletons render below.
  // On error with no live data, fall back to mock so user sees something.
  // On success (even 0 articles), use what the API returned.
  const NEWS: any[] = liveNews ?? (newsError ? fallbackNews : []);
  const EVTS = pub === 'realtyline' ? RL_EVTS : NS_EVTS;
  const pubAds = ADS.filter((a) => a.pub === pub);
  const CATS = pub === 'realtyline' ? RL_CATS : NS_CATS;
  const filt = cat === 'All' ? NEWS : NEWS.filter((n) => n.cat === cat);

  const feed: { t: 'n' | 'a' | 'c' | 's' | 'e' | 'm' | 'r'; d?: any }[] = [];
  const isLoadingFirstFetch = newsLoading && liveNews === null;

  const isEmptyAfterLoad = !isLoadingFirstFetch && filt.length === 0;

  // SABOR MLS card — Newsline San Antonio only.
  // "Both — hero this month, inline thereafter": pin at top for the first
  // 7 days from released_at, then slot inline every 5 articles. The card
  // itself fetches its data; we only decide placement here. Hero-vs-inline
  // is resolved in an effect (not render) so render stays pure — react-hooks/purity
  // forbids Date.now() in the render path.
  // saborReleasedAt is set by the fetch callback only (no synchronous setState
  // in the effect body). Hero-vs-inline is derived in render from that value
  // plus a useId-like stable epoch captured at mount, so render stays pure.
  const [saborReleasedAt, setSaborReleasedAt] = useState<string | null | undefined>(undefined);
  const [mountEpoch] = useState<number>(() => Date.now());
  useEffect(() => {
    if (pub !== 'newsline' || cat !== 'All') return;
    let alive = true;
    fetch('/api/sabor-mls/current', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        const released = (j?.report?.released_at as string | undefined) ?? null;
        setSaborReleasedAt(released);
      })
      .catch(() => {
        if (alive) setSaborReleasedAt(null);
      });
    return () => { alive = false; };
  }, [pub, cat]);
  const saborEligible = pub === 'newsline' && cat === 'All';
  const showSaborHero = (() => {
    if (!saborEligible) return false;
    if (saborReleasedAt === undefined) return false; // still loading
    if (saborReleasedAt === null) return true;       // no data yet: behave as hero
    const ageDays = (mountEpoch - new Date(saborReleasedAt).getTime()) / 86_400_000;
    return ageDays >= 0 && ageDays <= 7;
  })();
  const showSaborInline = saborEligible && saborReleasedAt !== undefined && !showSaborHero;

  // RealtyLine MLS card — RealtyLine Austin only. Same hero-then-inline
  // cadence as SABOR: pinned at top for the first 7 days from released_at,
  // then slotted inline every 5 articles. The card itself fetches its
  // data; we only decide placement here.
  const [realtylineReleasedAt, setRealtylineReleasedAt] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (pub !== 'realtyline' || cat !== 'All') return;
    let alive = true;
    fetch('/api/realtyline-mls/current', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        const released = (j?.report?.released_at as string | undefined) ?? null;
        setRealtylineReleasedAt(released);
      })
      .catch(() => {
        if (alive) setRealtylineReleasedAt(null);
      });
    return () => { alive = false; };
  }, [pub, cat]);
  const realtylineEligible = pub === 'realtyline' && cat === 'All';
  const showRealtylineHero = (() => {
    if (!realtylineEligible) return false;
    if (realtylineReleasedAt === undefined) return false; // still loading
    if (realtylineReleasedAt === null) return true;       // no data yet: behave as hero
    const ageDays = (mountEpoch - new Date(realtylineReleasedAt).getTime()) / 86_400_000;
    return ageDays >= 0 && ageDays <= 7;
  })();
  const showRealtylineInline = realtylineEligible && realtylineReleasedAt !== undefined && !showRealtylineHero;

  if (isLoadingFirstFetch) {
    for (let i = 0; i < 3; i++) feed.push({ t: 's', d: { id: i } });
  } else if (isEmptyAfterLoad) {
    feed.push({ t: 'e', d: { cat } });
  } else {
    // Mock inline ad cards (Austin Title, Cornerstone, Alamo, SWBC) were
    // removed — paid inventory now flows through <AdSlot> + ad_campaigns.
    // `pubAds` retained above only so the constant declaration doesn't
    // become an unused-variable lint error in case future code wants it.
    void pubAds;

    if (showSaborHero) {
      feed.push({ t: 'm', d: { variant: 'hero' } });
    }
    if (showRealtylineHero) {
      feed.push({ t: 'r', d: { variant: 'hero' } });
    }

    filt.forEach((item, i) => {
      feed.push({ t: 'n', d: item });
      if (i === 2) {
        feed.push({ t: 'c' });
      }
      // Inline placement: every 5th article, after the initial newsletter CTA
      if (showSaborInline && i > 0 && (i + 1) % 5 === 0) {
        feed.push({ t: 'm', d: { variant: 'inline' } });
      }
      if (showRealtylineInline && i > 0 && (i + 1) % 5 === 0) {
        feed.push({ t: 'r', d: { variant: 'inline' } });
      }
    });
  }


  function handleAdClick(ad: any) {
    void haptics.light();
    track('ad_click', { adId: ad.id, advertiser: ad.biz, publication: pub });
    window.open(ad.url, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="min-h-screen bg-white pb-36" style={SW}>
      {/* Pull-to-refresh indicator. Renders above the header while the user
          drags down from scrollY=0. Translates with the gesture and locks
          at TRIGGER_PX while refreshing. */}
      {(ptr.pulling || ptr.refreshing) && (
        <div
          aria-live="polite"
          role="status"
          className="fixed top-0 left-0 right-0 z-40 flex items-center justify-center pointer-events-none"
          style={{
            height: Math.max(ptr.distance, ptr.refreshing ? 56 : 0),
            paddingTop: 'env(safe-area-inset-top)',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0))',
            transition: ptr.refreshing ? 'height 200ms ease' : 'none',
          }}
        >
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] font-medium text-gray-500">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={ptr.refreshing ? 'animate-spin' : undefined}
              style={ptr.refreshing ? undefined : { transform: `rotate(${Math.min(180, ptr.distance * 2)}deg)` }}
            >
              <path d="M21 12a9 9 0 1 1-3-6.7" />
              <path d="M21 3v6h-6" />
            </svg>
            <span>
              {ptr.refreshing
                ? 'Refreshing'
                : ptr.armed
                ? 'Release to refresh'
                : 'Pull to refresh'}
            </span>
          </div>
        </div>
      )}
      <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: info.color }}>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.25em] text-white/50 font-medium">
            Welcome, {user?.firstName || (user?.guest ? 'Guest' : 'Subscriber')}
          </p>
          <button
            type="button"
            onClick={() => { void haptics.light(); setMarketDrawerOpen(true); }}
            className="flex items-center gap-1.5 text-white text-lg font-semibold tracking-wide truncate min-h-[44px]"
            aria-label="Select your market"
          >
            <span className="truncate">Select Your Market</span>
            <span className="text-white/70 text-xl leading-none">{'\u203A'}</span>
          </button>
        </div>
      </div>
      {!showPreLaunch && (
        <DashboardHero pub={pub as "realtyline" | "newsline"} />
      )}
      {!showPreLaunch && (
        <PushOptInBanner
          market={
            pub === 'realtyline'
              ? 'austin'
              : pub === 'newsline'
              ? 'san_antonio'
              : pub === 'realtyline-houston'
              ? 'houston'
              : pub === 'realtyline-dallas'
              ? 'dallas'
              : null
          }
        />
      )}
      {user?.guest && (
        <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
          <p className="text-sm text-amber-700 font-light">Browsing as Guest</p>
          <button onClick={() => window.location.reload()} className="text-sm text-amber-700 font-medium underline">Sign In</button>
        </div>
      )}
      {tab === 'n' && showPreLaunch && pubKey && (
        <PreLaunchEmptyState pub={pubKey} surface="news" />
      )}
      {tab === 'n' && !showPreLaunch && (
        <div>
          <FeedTopBanner pub={pub} />
          <div className="flex gap-2 overflow-x-auto px-4 py-3 bg-white border-b border-gray-200" style={{ scrollbarWidth: 'none' }}>
            {CATS.map((c) => (
              <button
                key={c}
                onClick={() => { void haptics.selection(); setCat(c); }}
                aria-pressed={cat === c}
                // BUG-16: add flex-shrink-0 so long chips like "Featured Advertisers"
                // don't get squeezed by sibling flex children and overflow the row.
                className={
                  cat === c
                    ? 'flex-shrink-0 whitespace-nowrap px-3 py-1.5 text-sm font-semibold border border-gray-900 bg-gray-900 text-white rounded-md transition-colors'
                    : 'flex-shrink-0 whitespace-nowrap px-3 py-1.5 text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:text-gray-900 rounded-md transition-colors'
                }
              >
                {c}
              </button>
            ))}
          </div>
          <div>
            {feed.flatMap((item, idx) => {
              const node = item.t === 's' ? (
                <ArticleSkeleton key={'s' + idx} />
              ) : item.t === 'e' ? (
                <EmptyState key={'e' + idx} cat={item.d.cat} />
              ) : item.t === 'c' ? (
                <NewsletterCTA
                  key={'c' + idx}
                  source="dashboard_feed"
                  publication={info.id as 'realtyline' | 'newsline'}
                  buttonColor={info.color}
                />
              ) : item.t === 'n' ? (
                <article key={'n' + item.d.id} className="bg-white border-b border-gray-200">
                  <ArticleCard item={item.d} pub={pub} />
                </article>
              ) : item.t === 'm' ? (
                <SaborReportCard key={'m' + idx + item.d.variant} variant={item.d.variant} />
              ) : item.t === 'r' ? (
                <RealtyLineReportCard key={'r' + idx + item.d.variant} variant={item.d.variant} />
              ) : (
                <AdCardTracked key={'a' + item.d.id} ad={item.d} onClick={handleAdClick} track={track} pub={pub} />
              );
              // Interleave a feed_inline_card ad every 6 items (renders only when a campaign is active)
              if (idx > 0 && idx % 6 === 0) {
                return [
                  <div key={'fic' + idx} className="border-b border-gray-200">
                    <AdSlotComponent slug="feed_inline_card" variant="bare" />
                  </div>,
                  node,
                ];
              }
              return [node];
            })}
            {/* Follow-us card pinned at the bottom of the feed, brand-colored
                per pub. URLs live in lib/pub-meta.ts — placeholders render
                as disabled icons until real URLs are wired in. */}
            <SocialLinks pub={pub as 'realtyline' | 'newsline'} variant="feed" />
          </div>
        </div>
      )}
      {tab === 'e' && showPreLaunch && pubKey && (
        <PreLaunchEmptyState pub={pubKey} surface="events" />
      )}
      {tab === 'e' && !showPreLaunch && (
        <div>
          <div className="px-4 py-4 border-b border-gray-200">
            <p className="text-sm uppercase tracking-[0.2em] text-gray-400 font-medium">Upcoming in {info.city}</p>
          </div>
          {EVTS.map((ev) => {
            const mo = ev.date.split(' ')[0];
            const dy = (ev.date.split(' ')[1] || '').replace(',', '');
            return (
              <article key={ev.id} className="bg-white border-b border-gray-200">
                <div className="px-4 py-5 flex gap-4">
                  <div className="flex-shrink-0 w-16 h-16 flex flex-col items-center justify-center rounded-md" style={{ backgroundColor: info.color }}>
                    <span className="text-xs uppercase text-white/60 font-medium leading-none tracking-wider">{mo}</span>
                    <span className="text-xl font-medium text-white leading-none">{dy}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base text-gray-900 leading-snug mb-1 font-semibold">{ev.title}</h3>
                    <p className="text-sm text-gray-500 font-light">{ev.time}</p>
                    <p className="text-sm text-gray-500 font-light">{ev.loc}</p>
                    <p className="text-sm font-medium mt-2 uppercase tracking-wider" style={{ color: info.color }}>{ev.org}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {profileOpen && (
        <ProfilePanel user={user} accentColor={info.color} onClose={() => setProfileOpen(false)} />
      )}
      {marketDrawerOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          onClick={() => setMarketDrawerOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-md h-full bg-white shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            style={SW}
          >
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
              <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium">Select Your Market</p>
              <button
                type="button"
                onClick={() => setMarketDrawerOpen(false)}
                className="text-gray-400 text-2xl leading-none min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close"
              >
                {'\u00D7'}
              </button>
            </div>
            <div>
              {/* Active markets */}
              {[
                { id: 'realtyline', label: 'RealtyLine Austin', monogram: 'RL' },
                { id: 'newsline', label: 'Newsline San Antonio', monogram: 'NS' },
              ].map((m) => {
                const isCurrent = pub === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      void haptics.medium();
                      setMarketDrawerOpen(false);
                      if (isCurrent) return;
                      try {
                        const maxAge = 60 * 60 * 24 * 365;
                        document.cookie = `caxton_pub=${m.id}; path=/; max-age=${maxAge}; SameSite=Lax`;
                        localStorage.setItem('caxton_pub', m.id);
                        localStorage.removeItem('caxton_selected_article');
                        localStorage.removeItem('caxton_selected_event');
                        window.dispatchEvent(new Event('savedPubChange'));
                      } catch {}
                      onSwitch(m.id);
                      if (typeof window !== 'undefined') {
                        window.location.assign('/');
                      }
                    }}
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
              {/* Coming-soon markets */}
              {[
                { id: 'realtyline-houston' as ComingSoonPubId, label: 'RealtyLine Houston', monogram: 'RH' },
                { id: 'realtyline-dallas' as ComingSoonPubId, label: 'RealtyLine Dallas/Ft. Worth', monogram: 'RD' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setMarketDrawerOpen(false);
                    setMarketNotifyFor({ id: m.id, name: m.label });
                    trackEvent('coming_soon_market_click', { market: m.id });
                  }}
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
      {marketNotifyFor && <NotifyMeModal market={marketNotifyFor} onClose={() => setMarketNotifyFor(null)} />}
    </div>
  );
}

function AdCardTracked({ ad, onClick, track, pub }: { ad: any; onClick: (ad: any) => void; track: any; pub: string }) {
  const ref = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        track('ad_impression', { adId: ad.id, advertiser: ad.biz, publication: pub });
        observer.disconnect();
      }
    }, { threshold: 0.5 });
    observer.observe(node);
  }, [ad.id, ad.biz, track, pub]);

  const initials = ad.biz.split(' ').map((w: string) => w[0]).join('');

  return (
    <article ref={ref} className="bg-[#f9fafb] border-b border-[#e5e7eb]">
      <div className="px-4 py-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-full bg-white border border-[#fb923c] flex items-center justify-center">
            <span className="text-xs font-medium text-[#fb923c]">{initials}</span>
          </div>
          <span className="text-sm uppercase tracking-[0.2em] font-semibold text-[#c2410c]">Sponsored</span>
          <span className="flex-1" />
          <span className="text-sm text-gray-400 italic font-light">{ad.page}</span>
        </div>
        <p className="text-base text-[#301D5D] font-medium mb-1">{ad.biz}</p>
        <h3 className="text-xl text-gray-900 leading-snug mb-2 font-semibold">{ad.tag}</h3>
        <p className="text-lg text-gray-500 leading-relaxed mb-4 font-light">{ad.desc}</p>
        <button onClick={() => onClick(ad)} className="w-full text-center py-3 text-base font-medium uppercase tracking-wider bg-[#301D5D] text-white">Connect Now</button>
      </div>
    </article>
  );
}

// NewsletterCTA was inlined here originally; extracted to
// components/NewsletterCTA.tsx so the same form can be used app-wide.
// See the import at the top of this file.


function ArticleCard({ item, pub }: { item: any; pub: string }) {
  const body = (
    <div className="flex items-start gap-4">
      <div className="flex-1 min-w-0">
        <span className="text-xs uppercase tracking-[0.15em] font-medium text-[#301D5D] mb-2 block">{item.cat}</span>
        <h3 className="text-lg text-gray-900 leading-snug mb-2 font-semibold">{item.head}</h3>
        <p className="text-sm text-gray-500 leading-relaxed mb-3 font-light">{item.sum}</p>
        <span className="text-xs text-gray-400 font-light">{item.time}</span>
      </div>
      {item.imageUrl && (
        <div className="flex-shrink-0 w-32 h-28 bg-gray-100 border border-gray-200 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        </div>
      )}
    </div>
  );

  // caxton-article-reader-b1-card
  if (item) {
    const onTap = () => {
      if (typeof window !== 'undefined') {
        // Enrich the dispatched item with title (mapped from head) and pub
        // so the article_opened tracker captures the right fields.
        void haptics.light();
        const enriched = { ...item, title: item.head, pub };
        window.dispatchEvent(new CustomEvent('caxton:openArticle', { detail: enriched }));
      }
    };
    return (
      <button
        type="button"
        onClick={onTap}
        className="block w-full text-left px-4 py-5 hover:bg-gray-50 transition-colors rounded-md"
      >
        {body}
      </button>
    );
  }
  return <div className="px-4 py-5">{body}</div>;
}

function ArticleSkeleton() {
  return (
    <article className="bg-white border-b border-gray-200">
      <div className="px-4 py-5">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="h-3 w-20 bg-gray-200 mb-3 animate-pulse" />
            <div className="h-6 w-full bg-gray-200 mb-2 animate-pulse" />
            <div className="h-6 w-3/4 bg-gray-200 mb-3 animate-pulse" />
            <div className="h-4 w-full bg-gray-100 mb-1 animate-pulse" />
            <div className="h-4 w-5/6 bg-gray-100 mb-3 animate-pulse" />
            <div className="h-3 w-24 bg-gray-100 animate-pulse" />
          </div>
        </div>
      </div>
    </article>
  );
}

function EmptyState({ cat }: { cat: string }) {
  const isAll = cat === 'All';
  return (
    <div className="px-6 py-16 text-center bg-white border-b border-gray-200">
      <p className="text-gray-700 text-lg font-medium mb-1">
        {isAll
          ? 'No articles available right now.'
          : `No articles tagged ${cat} yet.`}
      </p>
      <p className="text-gray-500 text-sm font-light">
        {isAll
          ? 'Check back soon.'
          : 'Check back soon, or try another category.'}
      </p>
    </div>
  );
}


// caxton-events-frontend-v1-components
// ─────────────────────────────────────────────────────────────────────────
// Events feature: full-screen list page + detail page + supporting helpers
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// EventsList — full-screen list page
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// EventCard — single row in the list
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// EventSkeleton — loading placeholder
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// EventDetail — full-screen detail page with WHEN/WHERE/etc + 4 actions
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// DetailSection — labeled section with thin divider (TM-inspired)
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// generateICS — build an iCalendar (.ics) text from a CalendarEvent
// ─────────────────────────────────────────────────────────────────────────

// caxton-article-reader-b1-component
// caxton-article-reader-b2a
// ─────────────────────────────────────────────────────────────────────────
// ArticleReader (v2a) — full-screen in-app reader with ads, Read Next,
// tags row, share row, and sticky bottom action bar.
// ─────────────────────────────────────────────────────────────────────────

interface ArticleReaderProps {
  pub: string;
  article: any | null;
  allArticles?: any[];
  onBack: () => void;
  onLatest?: () => void;
  onSelectArticle?: (a: any) => void;
}


// CAXTON ADS — All ad slots in this file render through <AdSlotComponent>
// (components/ads/AdSlot.tsx). Campaigns + creatives live in the DB
// (ad_campaigns / ad_creatives tables) and are managed at /admin/ads.
// House-ad placeholders for unsold inventory are auto-seeded by
// ensureSchema() in lib/db.ts. PostHog ad_impression/ad_click events
// are fired by AdSlotComponent — no parallel tracking here.
function decodeHtmlEntities(s: string): string {
  if (!s) return '';
  return s
    .replace(/&#038;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8217;/g, '’')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&hellip;/g, '…')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function formatArticleDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function cleanArticleHtml(raw: string | undefined): string {
  if (!raw) return '';
  let html = raw.replace(
    /<div[^>]*class="[^"]*elementor-widget-theme-post-title[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/i,
    ''
  );
  for (let i = 0; i < 8; i++) {
    const before = html;
    html = html.replace(
      /<div[^>]*class="[^"]*elementor-(?:element|container|widget|inner|background|column|row|section)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
      '$1'
    );
    if (html === before) break;
  }
  for (let i = 0; i < 4; i++) {
    const before = html;
    html = html.replace(
      /<div[^>]*class="[^"]*e-(?:con|flex|parent|child)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
      '$1'
    );
    if (html === before) break;
  }
  html = html.replace(
    /<div[^>]*data-elementor-type="[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    '$1'
  );
  // Strip Elementor's heading widget that duplicates the article title in the body
  html = html.replace(
    /<h1[^>]*class="[^"]*elementor-heading-title[^"]*"[^>]*>[\s\S]*?<\/h1>/gi,
    ''
  );
  const cleaned = html.trim();
  // Defensive: if cleaning destroyed >80% of content, return raw.
  // The Elementor regex chain occasionally over-matches and eats the body.
  if (raw.trim() && cleaned.length < raw.trim().length * 0.2) {
    return raw.trim();
  }
  return cleaned;
}

// Split article HTML into chunks at paragraph boundaries.
// Used to inject mid-article ad rectangles at ~33% and ~66%.
function splitHtmlIntoChunks(html: string, chunks: number): string[] {
  if (!html || chunks <= 1) return [html];
  // Split on closing </p> tags. Re-attach them to keep paragraphs intact.
  const parts = html.split(/(<\/p>)/gi);
  const reassembled: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const piece = (parts[i] || '') + (parts[i + 1] || '');
    if (piece.trim()) reassembled.push(piece);
  }
  if (reassembled.length < chunks * 2) {
    // Article is too short to inject ads between chunks meaningfully
    return [reassembled.join('')];
  }
  const result: string[] = [];
  const perChunk = Math.ceil(reassembled.length / chunks);
  for (let i = 0; i < chunks; i++) {
    result.push(reassembled.slice(i * perChunk, (i + 1) * perChunk).join(''));
  }
  return result.filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────
// Article ad slots — all delegate to <AdSlotComponent> so they share one
// fetch path, one impression-tracking path, and one source of fallback
// creative (the DB). The wrapper components here only own the surrounding
// layout chrome (the "Advertisement" eyebrow, the dismissable popup shell).
// ─────────────────────────────────────────────────────────────────────────

// Publication is read by <AdSlotComponent> from localStorage.caxton_pub,
// so the ad wrappers below don't need pub or articleId props anymore.
// Props are kept on the function signatures only where call sites pass them.

// Disclosure eyebrow. We split the visible string across two spans so the
// rendered text node is not the literal word that uBlock/AdGuard/Brave
// cosmetic filters key on (/advertisement/i, /advertising/i).
function PromotedEyebrow({ className = '' }: { className?: string }) {
  return (
    <p
      aria-label="Advertising partner"
      className={`text-[10px] uppercase tracking-[0.3em] text-gray-400 text-center font-medium ${className}`}
    >
      <span aria-hidden="true">{'Advertising'}</span>
      <span aria-hidden="true">{'\u00a0Partner'}</span>
    </p>
  );
}

function FeedTopBanner({}: { pub: string }) {
  return (
    <div className="bg-white border-b border-gray-200">
      <PromotedEyebrow className="pt-3 pb-2" />
      <div className="pb-3 px-4">
        <AdSlotComponent slug="feed_top_banner" variant="bare" />
      </div>
    </div>
  );
}

function AdLeaderboard({}: { pub: string; articleId: string }) {
  return (
    <div className="my-6 -mx-5">
      <PromotedEyebrow className="mb-2" />
      <AdSlotComponent slug="article_top_leaderboard" variant="bare" />
    </div>
  );
}

function AdRectangle({}: { pub: string; articleId: string; idx: number }) {
  return (
    <div className="my-8">
      <div className="border-t border-gray-200 pt-4">
        <PromotedEyebrow className="mb-3" />
        <AdSlotComponent slug="article_mid_inline" variant="bare" />
        <div className="border-t border-gray-200 mt-4" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// AdPopup — bottom-right corner, dismissable, session-remembered.
// Body delegates to <AdSlotComponent slug="article_interstitial"> so it
// shares the same DB-backed fill + PostHog tracking as every other slot.
// ─────────────────────────────────────────────────────────────────────────

function AdPopup({}: { pub: string; articleId: string }) {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem('caxton_popup_dismissed') === '1') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- TODO(S18-lint-debt): restructure popup effect
      setDismissed(true);
      return;
    }
    const t = setTimeout(() => setShow(true), 4000);
    return () => clearTimeout(t);
  }, []);

  if (dismissed || !show) return null;

  const onClose = () => {
    setShow(false);
    setDismissed(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('caxton_popup_dismissed', '1');
    }
  };

  return (
    <div
      className="fixed right-4 z-50 w-72 shadow-2xl rounded-md overflow-hidden"
      // BUG-iPhone-17: was bottom-20 (80px), which collided with the
      // BottomNav + safe-area on tall iPhones. Lift it above BottomNav +
      // ActionBar so it doesn't cover the article pill or get hidden.
      style={{
        animation: 'slideInRight 0.3s ease-out',
        bottom: 'calc(160px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <button
        onClick={onClose}
        className="absolute top-1 right-1 w-11 h-11 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center z-10"
        aria-label="Dismiss ad"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6L6 18"/><path d="M6 6l12 12"/>
        </svg>
      </button>
      <AdSlotComponent slug="article_interstitial" variant="bare" />
      <style jsx>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ShareRow — Facebook, X, LinkedIn, Email, Copy Link, native share
// ─────────────────────────────────────────────────────────────────────────

function ShareRow({ article, pubColor, onCopied }: { article: any; pubColor: string; onCopied: () => void }) {
  const url = canonicalShareUrl(article);
  const title = article?.head || article?.title || '';
  const enc = (s: string) => encodeURIComponent(s);

  const onShareNative = async () => {
    haptics.light();
    const res = await nativeShare({ title, url });
    if (res.ok) {
      trackEvent('article_shared', { article_id: article?.id, channel: res.method });
      if (res.method === 'clipboard') onCopied();
    }
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      trackEvent('article_shared', { article_id: article?.id, channel: 'copy_link' });
      onCopied();
    } catch {}
  };

  const iconClass = "w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 transition-colors";
  const iconColor = "#374151";

  return (
    <div className="flex flex-wrap gap-2 items-center pt-2 pb-1">
      <a
        href={`https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(title)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on X"
        className={iconClass}
        onClick={() => trackEvent('article_shared', { article_id: article?.id, channel: 'twitter' })}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill={iconColor}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
      </a>
      <a
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on LinkedIn"
        className={iconClass}
        onClick={() => trackEvent('article_shared', { article_id: article?.id, channel: 'linkedin' })}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill={iconColor}><path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.95v5.66H9.37V9h3.41v1.56h.05c.47-.9 1.64-1.85 3.37-1.85 3.61 0 4.27 2.37 4.27 5.46zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z"/></svg>
      </a>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on Facebook"
        className={iconClass}
        onClick={() => trackEvent('article_shared', { article_id: article?.id, channel: 'facebook' })}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill={iconColor}><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
      </a>
      <a
        href={`mailto:?subject=${enc(title)}&body=${enc(url)}`}
        aria-label="Share via email"
        className={iconClass}
        onClick={() => trackEvent('article_shared', { article_id: article?.id, channel: 'email' })}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
      </a>
      <button onClick={onCopy} aria-label="Copy link" className={iconClass} type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
      </button>
      <button onClick={onShareNative} aria-label="Share" className={iconClass} type="button" style={{ borderColor: pubColor }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={pubColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ReadNext — list of N other articles from the same publication
// ─────────────────────────────────────────────────────────────────────────

function ReadNext({ allArticles, currentId, onSelect, pubColor }: { allArticles: any[]; currentId: any; onSelect: (a: any) => void; pubColor: string }) {
  const others = (allArticles || []).filter((a) => a && a.id !== currentId).slice(0, 6);
  if (others.length === 0) return null;
  return (
    <div className="mt-12 pt-8 border-t border-gray-200">
      <p className="text-xs uppercase tracking-[0.2em] font-semibold text-gray-500 mb-5">Read Next</p>
      <ul className="space-y-4">
        {others.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => {
                trackEvent('article_related_clicked', { from_article_id: currentId, to_article_id: a.id });
                // Scroll-to-top is handled by ArticleReader's article-id
                // effect below — the reader has its own inner scroll container
                // (window.scrollTo here does nothing).
                onSelect(a);
              }}
              className="w-full text-left group"
            >
              <p className="text-base text-gray-900 leading-snug group-hover:underline" style={{ textUnderlineOffset: '2px' }}>
                {decodeHtmlEntities(a.head || a.title || '')}
              </p>
              {a.cat && (
                <p className="text-[10px] uppercase tracking-wider font-medium mt-1" style={{ color: pubColor }}>
                  {a.cat}
                </p>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// TagsRow — "More About: Tag · Tag"
// ─────────────────────────────────────────────────────────────────────────

function TagsRow({ article, pubColor }: { article: any; pubColor: string }) {
  const list: string[] = Array.isArray(article?.tags) ? article.tags : [];
  if (list.length === 0) return null;
  return (
    <div className="mt-8 pt-6 border-t border-gray-200 flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <p className="text-xs uppercase tracking-[0.2em] font-semibold text-gray-500">More About:</p>
      {list.map((t, i) => (
        <span key={i} className="text-sm text-gray-700 underline" style={{ color: pubColor, textUnderlineOffset: '2px' }}>
          {t}
          {i < list.length - 1 && <span className="text-gray-300 mx-1">·</span>}
        </span>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sticky bottom action bar — Save / Share / Copy
// ─────────────────────────────────────────────────────────────────────────

function ArticleActionBar({ saved, onBack, onSaveToggle, onShare, onLatest }: { article: any; pubColor: string; saved: boolean; onBack: () => void; onSaveToggle: () => void; onShare: () => void; onCopy: () => void; onLatest?: () => void }) {
  // BUG-04: AdPopup (z-50) sits at bottom-20 right-4 and was visually
  // covering the Latest/Share pills, so taps on those buttons hit the ad
  // instead. Bump this bar above the popup (z-60) so navigation always
  // wins. AdPopup remains dismissable via its own close button.
  //
  // BUG-iPhone-17: bottom-4 (16px) put the pill BEHIND the BottomNav
  // (which is ~70px + safe-area-inset-bottom tall on notched iPhones), so
  // on iPhone 17 / 17 Pro Max the entire action bar was invisible. The
  // ArticleReader overlay is z-30; BottomNav is z-40 and sits on top of
  // it, hiding anything in the bottom ~100px strip. Push the pill above
  // the BottomNav by combining a fixed 80px BottomNav clearance with the
  // iOS safe-area inset via calc(). 80px matches FloaterPill's default
  // offset elsewhere in the app.
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[60] pointer-events-none"
      style={{ bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="pointer-events-auto flex items-stretch gap-1 bg-black/85 backdrop-blur-md rounded-md px-2 py-1.5 shadow-lg">
        <ActionPillButton onClick={onBack} label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </ActionPillButton>
        <ActionPillButton onClick={onSaveToggle} label={saved ? 'Saved' : 'Save'} active={saved}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </ActionPillButton>
        <ActionPillButton onClick={onLatest} label="Latest">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8M10 10h8"/></svg>
        </ActionPillButton>
        <ActionPillButton onClick={onShare} label="Share">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v13"/><path d="M16 6l-4-4-4 4"/><rect x="4" y="9" width="16" height="13" rx="2"/></svg>
        </ActionPillButton>
      </div>
    </div>
  );
}

function ActionPillButton({ children, label, onClick, active }: { children: React.ReactNode; label: string; onClick?: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`flex flex-col items-center justify-center min-w-[60px] px-2 py-1.5 rounded-md transition-colors ${active ? 'text-white bg-white/15' : 'text-white/85 hover:text-white active:bg-white/10'}`}
    >
      {children}
      <span className="text-[10px] uppercase tracking-wider mt-0.5 font-medium">{label}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ArticleReader — the polished v2a top-level component
// ─────────────────────────────────────────────────────────────────────────

function ArticleReader({ pub, article, allArticles, onBack, onLatest, onSelectArticle }: ArticleReaderProps) {
  const info = PUB_META[pub as PubKey] || PUB_META.realtyline;
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // useSwipeBack must be called unconditionally, before any early returns,
  // to satisfy React's Rules of Hooks (otherwise hook count varies across
  // renders when `article` toggles null/non-null, throwing React #310).
  const { ref: swipeRef, style: swipeStyle } = useSwipeBack({ onBack });

  // Reset scroll to top whenever the active article changes (e.g. Read Next
  // tap). The reader uses an inner overflow-y-auto container, so
  // window.scrollTo from the click handler does nothing — we have to scroll
  // the actual container here, after the new article has rendered.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const container = document.querySelector<HTMLDivElement>('div.fixed.inset-0.bg-white.z-30.overflow-y-auto');
    if (container) {
      container.scrollTop = 0;
    } else if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0 });
    }
  }, [article?.id]);

  // Scroll milestone telemetry + time-on-article on unmount.
  // The article being viewed is identified by `article?.id`; if it changes,
  // this effect re-runs (fires the previous article's back event in cleanup,
  // then sets up tracking for the new one).
  useEffect(() => {
    const articleId = article?.id;
    if (articleId == null) return;
    const openedAt = Date.now();
    const fired = new Set<number>();
    const MILESTONES = [25, 50, 75, 100];

    // The reader's scrollable container is the outermost div with
    // overflow-y-auto rendered by ArticleReader.
    let scroller: HTMLElement | Window = typeof window !== 'undefined' ? window : ({} as Window);
    // Try to find the actual reader container (more accurate than window scroll)
    if (typeof document !== 'undefined') {
      const candidate = document.querySelector<HTMLDivElement>('div.fixed.inset-0.bg-white.z-30.overflow-y-auto');
      if (candidate) scroller = candidate;
    }

    const onScroll = () => {
      let pct: number;
      if (scroller instanceof Window) {
        const top = window.scrollY || window.pageYOffset;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        pct = docHeight > 0 ? (top / docHeight) * 100 : 100;
      } else {
        const el = scroller as HTMLElement;
        const max = el.scrollHeight - el.clientHeight;
        pct = max > 0 ? (el.scrollTop / max) * 100 : 100;
      }
      for (const m of MILESTONES) {
        if (pct >= m && !fired.has(m)) {
          fired.add(m);
          trackEvent('article_scroll_milestone', { article_id: articleId, milestone: m });
        }
      }
    };

    // Initial check — short articles may already be 100% visible.
    onScroll();
    (scroller as HTMLElement).addEventListener?.('scroll', onScroll, { passive: true });
    if (scroller instanceof Window) window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      (scroller as HTMLElement).removeEventListener?.('scroll', onScroll);
      if (scroller instanceof Window) window.removeEventListener('scroll', onScroll);
      trackEvent('article_back_clicked', {
        article_id: articleId,
        time_on_article_ms: Date.now() - openedAt,
        max_milestone_reached: fired.size > 0 ? Math.max(...Array.from(fired)) : 0,
      });
    };
  }, [article?.id]);


  // Restore saved state from sessionStorage (placeholder until B2b adds backend)
  useEffect(() => {
    if (!article || typeof window === 'undefined') return;
    const key = `caxton_saved_${article.id}`;
    queueMicrotask(() => {
      setSaved(sessionStorage.getItem(key) === '1');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.id]);

  const flashToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const onSaveToggle = () => {
    if (!article || typeof window === 'undefined') return;
    const key = `caxton_saved_${article.id}`;
    if (saved) {
      sessionStorage.removeItem(key);
      setSaved(false);
      flashToast('Removed from saves');
      haptics.light();
      trackEvent('article_unsaved', { article_id: article.id, pub });
    } else {
      sessionStorage.setItem(key, '1');
      setSaved(true);
      flashToast('Saved (this session)');
      haptics.notify('success');
      trackEvent('article_saved', { article_id: article.id, pub });
    }
  };

  const onShare = async () => {
    if (!article) return;
    const url = canonicalShareUrl(article);
    const title = article.head || article.title || '';
    haptics.light();
    const res = await nativeShare({ title, url });
    if (res.ok) {
      trackEvent('article_shared', { article_id: article.id, channel: res.method, pub });
      if (res.method === 'clipboard') flashToast('Link copied');
    }
  };

  const onCopy = async () => {
    if (!article) return;
    try {
      await navigator.clipboard.writeText(canonicalShareUrl(article));
      flashToast('Link copied');
    } catch {}
  };

  if (!article) {
    return (
      <div className="fixed inset-0 bg-white z-30 flex items-center justify-center" style={SW}>
        <div className="text-center px-8">
          <p className="text-gray-500 mb-4">Article not found</p>
          <button onClick={onBack} className="text-sm uppercase tracking-wider font-medium" style={{ color: info.color }}>
            ← Back
          </button>
        </div>
      </div>
    );
  }

  const headline = decodeHtmlEntities(article.head || article.title || '');
  const author = article.author;
  const dateLong = formatArticleDate(article.dateIso || article.publishedAt);
  const cleanedHtml = cleanArticleHtml(article.contentHtml || article.content || "");
  const articleId = String(article.id || '');

  // Split body into 3 chunks for two mid-article rectangle ad slots.
  const chunks = splitHtmlIntoChunks(cleanedHtml, 3);
  const showMidAds = chunks.length >= 3;

  return (
    <div
      ref={swipeRef as React.Ref<HTMLDivElement>}
      className="fixed inset-0 bg-white z-30 overflow-y-auto"
      style={{ ...SW, ...swipeStyle }}
    >
      {/* Header */}
      <div className="sticky top-0 bg-white z-10 border-b border-gray-200">
        <div className="flex items-center justify-end px-4 py-4">
          <span className="text-xs uppercase tracking-[0.2em] text-gray-400 font-medium">{info.name}</span>
        </div>
      </div>


      {/* Featured image — constrained to the same max-w-2xl column as the
          article body, so it doesn't stretch edge-to-edge on wide desktop
          windows (which also upscaled smaller source images and made them
          look blurry). max-h cap prevents very tall portraits from dominating. */}
      {article.imageUrl && (
        <div className="w-full bg-gray-100">
          <div className="max-w-2xl mx-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={article.imageUrl}
              alt=""
              className="w-full h-auto max-h-[60vh] object-cover"
              loading="eager"
            />
          </div>
        </div>
      )}

      {/* pb-52: clears the sticky ArticleActionBar (now bottom 80px+safe-area +
          ~62px pill) plus the BottomNav underneath, with breathing room.
          Was pb-44 — the bar overlapped the last paragraph on short
          articles and the "Read on website" link (BUG-18). */}
      <div className="px-5 pt-6 pb-52 max-w-2xl mx-auto">
        {/* Top leaderboard ad — first thing in the article column */}
        <AdLeaderboard pub={pub} articleId={articleId} />

        {/* Eyebrow */}
        {(article.cat || article.category) && (
          <p className="text-xs uppercase tracking-[0.2em] font-semibold mb-3" style={{ color: info.color }}>
            {article.cat || article.category}
          </p>
        )}

        {/* Headline */}
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight leading-tight mb-3">
          {headline}
        </h1>

        {/* Byline */}
        {(author?.name || dateLong) && (
          <div className="flex items-center gap-3 mb-2 pb-6 border-b border-gray-200">
            {author?.avatar && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={author.avatar}
                alt=""
                width={96}
                height={96}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  // Hide the avatar element entirely when Gravatar 404s
                  // (author has no registered Gravatar). Avoids broken-image icon.
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
                className="w-16 h-16 rounded-full object-cover bg-gray-100 flex-shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              {author?.name && (
                <p className="text-sm text-gray-900 font-medium leading-tight">By {author.name}</p>
              )}
              {dateLong && (
                <p className="text-xs text-gray-500 font-light leading-tight mt-0.5">{dateLong}</p>
              )}
            </div>
          </div>
        )}

        {/* Article body — chunked with mid-article ads if long enough */}
        {cleanedHtml ? (
          showMidAds ? (
            <>
              <div className="caxton-article-prose" dangerouslySetInnerHTML={{ __html: chunks[0] }} />
              <AdRectangle pub={pub} articleId={articleId} idx={1} />
              <div className="caxton-article-prose" dangerouslySetInnerHTML={{ __html: chunks[1] }} />
              <AdRectangle pub={pub} articleId={articleId} idx={2} />
              <div className="caxton-article-prose" dangerouslySetInnerHTML={{ __html: chunks[2] }} />
            </>
          ) : (
            <div className="caxton-article-prose" dangerouslySetInnerHTML={{ __html: cleanedHtml }} />
          )
        ) : (
          <p className="text-base text-gray-700 leading-relaxed font-light">
            {decodeHtmlEntities(article.sum || '')}
          </p>
        )}

        {/* Tags */}
        <TagsRow article={article} pubColor={info.color} />

        {/* Share row (icons) */}
        <div className="mt-6">
          <ShareRow article={article} pubColor={info.color} onCopied={() => flashToast('Link copied')} />
        </div>

        {/* Read Next */}
        <ReadNext
          allArticles={allArticles || []}
          currentId={article.id}
          onSelect={(a) => { if (onSelectArticle) onSelectArticle(a); }}
          pubColor={info.color}
        />

        {/* Read on website fallback */}
        {article.link && (
          <div className="mt-10 pt-6 border-t border-gray-200">
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm uppercase tracking-wider font-medium"
              style={{ color: info.color }}
            >
              Read on {info.name} →
            </a>
          </div>
        )}

        {/* Article bottom ad slot (renders only when a campaign is active) */}
        <AdSlotComponent slug="article_bottom" className="mt-10" />
      </div>

      {/* Sticky action bar */}
      <ArticleActionBar
        article={article}
        pubColor={info.color}
        saved={saved}
        onBack={onBack}
        onSaveToggle={onSaveToggle}
        onShare={onShare}
        onCopy={onCopy}
        onLatest={() => { trackEvent('article_latest_pill_clicked', { article_id: article.id, pub }); if (onLatest) onLatest(); else onBack(); }}
      />

      {/* Corner pop-up ad */}
      <AdPopup pub={pub} articleId={articleId} />

      {/* Toast */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2 rounded-full text-sm font-medium z-50 shadow-lg">
          {toast}
        </div>
      )}

      {/* Inline styles for the article prose */}
      <style jsx>{`
        :global(.caxton-article-prose) {
          color: #301D5D;
          font-size: 1.0625rem;
          line-height: 1.7;
        }
        :global(.caxton-article-prose p) {
          margin-bottom: 1.25rem;
          font-weight: 300;
        }
        :global(.caxton-article-prose h2) {
          font-size: 1.5rem;
          font-weight: 700;
          margin-top: 2rem;
          margin-bottom: 0.75rem;
          color: #111827;
          letter-spacing: -0.01em;
        }
        :global(.caxton-article-prose h3) {
          font-size: 1.25rem;
          font-weight: 600;
          margin-top: 1.5rem;
          margin-bottom: 0.5rem;
          color: #111827;
        }
        :global(.caxton-article-prose strong) {
          font-weight: 600;
          color: #111827;
        }
        :global(.caxton-article-prose ul),
        :global(.caxton-article-prose ol) {
          margin-bottom: 1.25rem;
          padding-left: 1.5rem;
          font-weight: 300;
        }
        :global(.caxton-article-prose ul) { list-style-type: disc; }
        :global(.caxton-article-prose ol) { list-style-type: decimal; }
        :global(.caxton-article-prose li) {
          margin-bottom: 0.4rem;
        }
        :global(.caxton-article-prose a) {
          color: ${info.color};
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        :global(.caxton-article-prose img) {
          max-width: 100%;
          height: auto;
          margin: 1.5rem 0;
          border-radius: 4px;
        }
        :global(.caxton-article-prose blockquote) {
          border-left: 3px solid ${info.color};
          padding-left: 1rem;
          margin: 1.5rem 0;
          font-style: italic;
          color: #4b5563;
        }
      `}</style>
    </div>
  );
}

