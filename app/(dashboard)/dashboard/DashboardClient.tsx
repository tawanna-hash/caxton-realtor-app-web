'use client';

/* eslint-disable @typescript-eslint/no-explicit-any -- TODO(S18-lint-debt): retype dashboard properly. 34 `any` types remain pending a proper types pass. */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { trackEvent, identifyUser } from "../../posthog-provider";
import { useSwipeBack } from '@/hooks/use-swipe-back';
import NotifyMeModal from '@/components/dashboard/NotifyMeModal';
const Feed = dynamic(() => import('@/components/dashboard/FeedAndReader').then((m) => m.Feed));
const ArticleReader = dynamic(() => import('@/components/dashboard/FeedAndReader').then((m) => m.ArticleReader));
const ProfilePanel = dynamic(() => import('@/components/ProfilePanel'));
import { getApiBase } from '@/lib/api-base';
const NewsletterCTA = dynamic(() => import('@/components/NewsletterCTA'));
const SaborReportCard = dynamic(() => import('@/components/SaborReportCard'));
const DallasPreviewHome = dynamic(() => import('@/components/DallasPreviewHome'));
const RealtyLineReportCard = dynamic(() => import('@/components/RealtyLineReportCard'));
import { haptics } from '@/lib/native/haptics';
import { SW } from '@/lib/style-constants';
import { PUB_META, type PubKey, isPreLaunchPub, isPubKey } from '@/lib/pub-meta';
import { PreLaunchEmptyState } from '@/components/PreLaunchEmptyState';
import { COMING_SOON_PUBS, type ComingSoonPubId } from '@/lib/coming-soon-pubs';
const MarketSwitcherSheet = dynamic(() => import('@/components/MarketSwitcherSheet'));
import { normalizeArticleHtml } from '@/lib/article-html';
import { isNative } from '@/lib/native/runtime';
import { ARTICLE_CATEGORIES, articleCategoriesForPublication, canonicalArticleCategory } from '@/lib/article-categories';

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

const RL_NEWS = [
  { id: 1, cat: 'Austin Board of REALTORS (ABOR)', head: 'ABoR Announces 2026 Board Election Results', sum: 'New leadership elected with a focus on affordability and inventory.', time: '2 hours ago' },
  { id: 2, cat: 'Five Points Board of REALTORS (Five Points)', head: 'Five Points BoR Hosts CE Workshop on Settlement Changes', sum: 'New CE courses cover commission disclosure rules and best practices.', time: '5 hours ago' },
  { id: 3, cat: 'Featured Partner', head: 'Austin Title Marks 30 Years Serving Central Texas REALTORS', sum: 'Anniversary milestone celebrated with a new fast-close service tier.', time: '1 day ago' },
  { id: 4, cat: "Editor's Choice", head: 'Austin Home Sales Rise 12% in April', sum: 'The Austin-Round Rock metro saw a jump in closed sales last month.', time: '1 day ago' },
  { id: 5, cat: 'Faces of Real Estate', head: 'Faces of Real Estate: May Profile Edition Released', sum: 'Six Austin agents share their stories, strategies, and 2026 outlook.', time: '2 days ago' },
  { id: 6, cat: "Women's Council of REALTORS Austin", head: 'WCR Austin Announces Spring Networking Mixer', sum: 'Members and guests gather May 22 at the Driskill for an evening of connections.', time: '2 days ago' },
];

const NS_NEWS = [
  { id: 1, cat: 'San Antonio Board of REALTORS (SABOR)', head: 'SABOR Announces Annual Awards Finalists', sum: 'Nominees span residential, commercial, and affiliate categories.', time: '3 hours ago' },
  { id: 2, cat: 'Greater San Antonio Builders Association (GSABA)', head: 'GSABA Hosts Builder Certification Workshop', sum: 'Two-day workshop covers green building standards and permit updates.', time: '6 hours ago' },
  { id: 3, cat: "Women's Council of REALTORS San Antonio", head: 'WCR San Antonio Hosts Spring Leadership Forum', sum: 'Members convene for networking and professional development sessions.', time: '1 day ago' },
  { id: 4, cat: "Editor's Choice", head: 'San Antonio Median Home Price Hits New High', sum: 'Bexar County saw record prices in April across all segments.', time: '1 day ago' },
  { id: 5, cat: 'Featured Partner', head: 'Alamo Title Expands SA Operations With New Branch', sum: 'Local title leader adds capacity to serve South San Antonio agents.', time: '1 day ago' },
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- pre-existing, unrelated to this change
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
    <div className="fixed inset-0 bg-brand-700 flex flex-col items-center justify-center z-50 transition-opacity duration-500" style={{ ...SW, opacity: fade ? 0 : 1 }}>
      <p className="text-3xl text-white font-semibold tracking-wide text-center px-8">Realty News Now</p>
      <div className="mt-4 flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" style={{ animationDelay: '0s' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" style={{ animationDelay: '0.3s' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" style={{ animationDelay: '0.6s' }} />
      </div>
    </div>
  );
}

// iOS HIG: bottom sheet (was a center modal). Grabber, safe-area-inset-bottom
// CTA, body scroll lock, Esc + backdrop dismiss. Matches the
// MarketSwitcherSheet pattern so the picker→sheet flow feels consistent.

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
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2 text-center">Realty News Now</p>
        <h2 className="text-2xl text-gray-900 font-semibold text-center mb-3">Select a Publication</h2>
        <p className="text-lg text-gray-500 font-light text-center mb-8">Welcome, we are happy you are here!</p>
        <div className="relative">
          <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-4 border border-gray-300 bg-white text-left rounded-md">
            <span className="text-lg text-gray-500 font-light">Choose your market...</span>
            <span className="text-gray-500 text-base">{open ? '\u25B2' : '\u25BC'}</span>
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
                <button key={pub.id} onClick={() => onSelect(pub.id)} className="w-full text-left px-4 py-4 border-b border-gray-100 bg-white hover:bg-gray-50">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: pub.color }}>
                      <span className="text-white text-base font-medium">{pub.id === 'realtyline' ? 'RL' : 'NS'}</span>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-gray-900">{pub.name}</p>
                      <p className="text-base text-gray-500 font-light">{pub.city} - {pub.tagline}</p>
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
                  className="w-full text-left px-4 py-4 border-b border-gray-100 bg-gray-50 hover:bg-gray-100"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-md flex items-center justify-center flex-shrink-0 opacity-60" style={{ backgroundColor: pub.color }}>
                      <span className="text-white text-base font-medium">{pub.monogram}</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-lg font-semibold text-gray-700">{pub.name}</p>
                        <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-[#FEF8CC] text-[#645600]">Coming Soon</span>
                      </div>
                      <p className="text-base text-gray-500 font-light">{pub.city} - {pub.tagline}</p>
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

function AuthGate({
  pub,
  onAuth,
  onNeedMarket,
  initialMode = 'login',
}: {
  pub: string;
  onAuth: (user: any) => void;
  onNeedMarket: () => void;
  initialMode?: 'login' | 'signup';
}) {
  // Honor /auth/sign-in and /auth/sign-up aliases via ?auth=login|signup so
  // visitors land directly on the right form instead of the 'choice' screen.
  const [mode, setMode] = useState<'choice' | 'signup' | 'login' | 'sent'>(initialMode);
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
  // Set when we arrive via the Apple "must sign up first" bounce
  // (lib/server/auth/authjs.ts signIn callback redirects new Apple emails
  // to /dashboard?auth=signup&apple_email=...). Drives the banner below.

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
      } catch {}
    });
  }, []);

  const info = PUBS.find((p) => p.id === pub) || PUBS[0];

  const ic = 'w-full px-4 py-4 border border-gray-300 text-base font-light bg-white focus:outline-none focus:border-brand-700 mb-3 placeholder:text-[#D9CFF0]';
  const sc = 'w-full px-4 py-4 border border-gray-300 text-base font-light bg-white focus:outline-none focus:border-brand-700 mb-3 appearance-none placeholder:text-[#D9CFF0]';

  async function handleSignup() {
    setLoading(true);
    setError('');
    try {
      // Trim everything so trailing whitespace from iOS autofill or paste
      // never trips zod's email() / non-empty validators.
      const trimmedFullName = fullName.trim();
      const trimmedEmail = email.trim().toLowerCase();
      const firstName = trimmedFullName.split(/\s+/)[0] || trimmedFullName;
      const lastName = trimmedFullName.split(/\s+/).slice(1).join(' ') || '';

      const res = await fetch(API + '/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          firstName,
          lastName,
          email: trimmedEmail,
          market: pub === 'realtyline' ? 'austin' : 'san_antonio',
          licenseType,
          licenseNumber: licenseNum.trim() || undefined,
          title: title || undefined,
          mobile: mobile.trim() || undefined,
          mailingAddress: addr1.trim() || undefined,
          mailingAddress2: addr2.trim() || undefined,
          city: city.trim() || undefined,
          state: 'TX',
          zip: zip.trim() || undefined,
          birthdayMonth: bdayMonth || undefined,
          birthdayDay: bdayDay || undefined,
          subscriptions: subs,
          fbHandle: fbHandle.trim() || undefined,
          igHandle: igHandle.trim() || undefined,
          liHandle: liHandle.trim() || undefined,
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
          trackEvent('signup_auto_signed_in', { mode: 'signup', email: trimmedEmail, pub });
          try {
            const meRes = await fetch(API + '/auth/me', { credentials: 'include' });
            if (meRes.ok) {
              const meData = await meRes.json().catch(() => ({}));
              const realtor = meData?.realtor || meData;
              try {
                if (realtor?.id && realtor?.email) {
                  window.localStorage.setItem(
                    'caxton_session_user',
                    JSON.stringify({ id: realtor.id, email: realtor.email }),
                  );
                }
              } catch {}
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
        trackEvent('magic_link_requested', { mode: 'signup', email: trimmedEmail, pub });
        void haptics.notify('success');
        setMode('sent');
      } else {
        const data: {
          message?: string;
          error?: string;
          details?: Record<string, string[] | undefined>;
        } = await res.json().catch(() => ({}));
        // Build the most specific error we can. The server returns errors
        // under `error` (top-level) and field-level zod errors under
        // `details` — the client was previously only reading `message`,
        // so every signup failure looked identical ("Something went wrong").
        let msg = '';
        if (data.details && typeof data.details === 'object') {
          const fields = Object.entries(data.details)
            .map(([field, errs]) => {
              const first = Array.isArray(errs) ? errs[0] : undefined;
              if (!first) return null;
              const pretty = field
                .replace(/([A-Z])/g, ' $1')
                .replace(/^./, (c) => c.toUpperCase());
              return `${pretty}: ${first}`;
            })
            .filter(Boolean) as string[];
          if (fields.length) msg = fields.join('. ');
        }
        if (!msg) msg = data.error || data.message || '';
        if (!msg) {
          msg =
            res.status === 429
              ? 'Too many signup attempts. Wait a minute and try again.'
              : res.status >= 500
                ? 'Our server hit a snag. Please try again in a moment.'
                : 'Something went wrong. Please try again.';
        }
        console.error('[signup] error', { status: res.status, data });
        setError(msg);
        void haptics.notify('error');
      }
    } catch (netErr) {
      console.error('[signup] network error', netErr);
      setError('Cannot reach server. Check your connection and try again.');
      void haptics.notify('error');
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
      // /auth/password-login now returns the realtor payload — no need for
      // a second /auth/me round-trip (BUG-C in the sign-in audit).
      const data = await res.json().catch(() => ({}));
      const realtor = data.realtor;
      if (!realtor) throw new Error('Signed in but could not load your account');
      trackEvent('password_signin_succeeded', { pub });
      void haptics.notify('success');
      // Persist to localStorage FIRST so AppShell + NavDrawer see the user
      // synchronously (before /auth/me round-trip). Fixes drawer showing
      // LOGIN after sign-in.
      try {
        window.localStorage.setItem(
          'caxton_session_user',
          JSON.stringify({ id: realtor.id, email: realtor.email }),
        );
      } catch {}
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
      <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-50" style={SW}>
        <div className="w-full max-w-md px-8 text-center">
          <div className="text-5xl mb-4">{'\u2709'}</div>
          <h2 className="text-2xl text-gray-900 font-semibold mb-3">Check Your Email</h2>
          <p className="text-lg text-gray-500 font-light mb-2">We sent a magic link to</p>
          <p className="text-lg text-brand-700 font-semibold mb-6">{email}</p>
          <p className="text-base text-gray-500 font-light mb-8">Click the link in your email to sign in. It expires in 15 minutes.</p>
          <p className="text-sm text-gray-300 font-light">Check your spam folder if you do not see it.</p>
        </div>
      </div>
    );
  }

  if (mode === 'signup') {
    return (
      <div
        className="fixed inset-0 bg-white z-50 overflow-y-auto"
        style={{
          ...SW,
          // Reserve room for iOS notch (top) + home indicator (bottom) +
          // any active soft keyboard. Without this padding the final
          // "Continue" button can sit behind the home strip / keyboard
          // toolbar and be unreachable.
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom:
            'calc(env(safe-area-inset-bottom) + var(--kb-inset-bottom, 0px) + 40px)',
        }}
      >
        <div className="min-h-full flex flex-col items-center py-8">
          <div className="w-full max-w-md px-8">
            <p className="text-sm uppercase tracking-[0.2em] font-medium mb-2 text-center" style={{ color: info.color }}>Realty News Now</p>
            <h2 className="text-2xl text-gray-900 font-semibold text-center mb-8">Create Your Account</h2>

            {/* Step indicators */}
            <div className="flex items-center justify-center gap-2 mb-6">
              <div className={step >= 1 ? 'w-3 h-3 rounded-full bg-brand-700' : 'w-3 h-3 rounded-full bg-gray-200'} />
              <div className="w-8 h-px bg-gray-200" />
              <div className={step >= 2 ? 'w-3 h-3 rounded-full bg-brand-700' : 'w-3 h-3 rounded-full bg-gray-200'} />
              <div className="w-8 h-px bg-gray-200" />
              <div className={step >= 3 ? 'w-3 h-3 rounded-full bg-brand-700' : 'w-3 h-3 rounded-full bg-gray-200'} />
            </div>

            {error && <p className="text-base text-[#661102] text-center mb-4 font-light">{error}</p>}

            {/* Step 1: License + Identity */}
            {step === 1 && (
              <div>
                <div className="flex items-center my-3" aria-hidden="true">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="px-3 text-xs uppercase tracking-wider text-gray-500">or</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
                <p className="text-sm uppercase tracking-wider text-gray-500 font-medium mb-3">License Number <span className="text-gray-300 normal-case tracking-normal">(optional)</span></p>
                <div className="flex gap-2 mb-3">
                  {LICENSE_TYPES.map((lt) => (
                    <button key={lt} onClick={() => setLicenseType(lt)} className={licenseType === lt ? 'flex-1 py-3 text-base font-medium text-center border-2 border-brand-700 text-brand-700' : 'flex-1 py-3 text-base font-light text-center border border-gray-300 text-gray-500'}>{lt}</button>
                  ))}
                </div>
                <input type="text" placeholder={licenseType === 'TREC #' ? 'TREC License Number (optional)' : 'NMLS ID Number (optional)'} value={licenseNum} onChange={(e) => setLicenseNum(e.target.value)} className={ic} autoComplete="off" autoCapitalize="characters" inputMode={licenseType === 'TREC #' ? 'numeric' : 'text'} />
<p className="text-sm uppercase tracking-wider text-gray-500 font-medium mb-3 mt-6">Your Information</p>
                <input type="text" placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} className={ic} autoComplete="name" autoCapitalize="words" />
                <select value={title} onChange={(e) => setTitle(e.target.value)} className={sc + (!title ? ' text-[#D9CFF0]' : ' text-gray-900')}>
                  <option value="">Select Title / Role</option>
                  {TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>

                <button onClick={() => { void haptics.light(); setStep(2); }} disabled={!fullName} className="w-full text-center py-4 text-base font-medium uppercase tracking-wider text-white mt-4 disabled:opacity-40" style={{ backgroundColor: info.color }}>Continue</button>
                <button onClick={() => setMode('login')} className="w-full text-center py-2 text-base text-gray-500 font-light mt-2">Back to sign in</button>
              </div>
            )}

            {/* Step 2: Contact Info */}
            {step === 2 && (
              <div>
                <p className="text-sm uppercase tracking-wider text-gray-500 font-medium mb-3">Contact Information</p>
                <input type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} className={ic} />
                <input type="tel" placeholder="Mobile Phone" value={mobile} onChange={(e) => setMobile(e.target.value)} className={ic} />

                <p className="text-sm uppercase tracking-wider text-gray-500 font-medium mb-3 mt-4">Create a Password</p>
                <div className="relative mb-3">
                  <input type={showPassword ? 'text' : 'password'} placeholder="Password (at least 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} className={ic + ' pr-16'} autoComplete="new-password" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3.5 text-xs uppercase tracking-wider text-gray-500">{showPassword ? 'Hide' : 'Show'}</button>
                </div>
                <input type={showPassword ? 'text' : 'password'} placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={ic} autoComplete="new-password" />
                <p className="text-xs text-gray-500 font-light mb-2">Used for sign-in.</p>

                <p className="text-sm uppercase tracking-wider text-gray-500 font-medium mb-3 mt-4">Mailing Address</p>
                <input type="text" placeholder="Street Address" value={addr1} onChange={(e) => setAddr1(e.target.value)} className={ic} autoComplete="address-line1" />
                <input type="text" placeholder="Suite / Unit (optional)" value={addr2} onChange={(e) => setAddr2(e.target.value)} className={ic} autoComplete="address-line2" />
                <div className="flex gap-2">
                  <input type="text" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} className={ic + ' flex-1'} autoComplete="address-level2" />
                  <input type="text" value="TX" disabled className="w-16 px-4 py-4 border border-gray-200 text-base font-light bg-gray-50 text-gray-500 mb-3 text-center rounded-md" />
                  <input type="text" placeholder="Zip" value={zip} onChange={(e) => setZip(e.target.value)} className="w-24 px-4 py-4 border border-gray-300 text-base font-light bg-white focus:outline-none focus:border-brand-700 mb-3" autoComplete="postal-code" inputMode="numeric" />
                </div>

                <div className="flex gap-2 mt-2">
                  <button onClick={() => { void haptics.light(); setStep(1); }} className="flex-1 text-center py-4 text-base font-medium uppercase tracking-wider border border-gray-300 text-gray-500 rounded-md">Back</button>
                  <button onClick={() => {
                    const trimmedEmail = email.trim();
                    if (!trimmedEmail || !trimmedEmail.includes('@') || !trimmedEmail.includes('.')) { setError('Enter a valid email address'); void haptics.notify('error'); return; }
                    if (!password || password.length < 8) { setError('Password must be at least 8 characters'); void haptics.notify('error'); return; }
                    if (password !== confirmPassword) { setError('Passwords do not match'); void haptics.notify('error'); return; }
                    setError('');
                    void haptics.light();
                    setStep(3);
                  }} disabled={!email || !password || !confirmPassword} className="flex-1 text-center py-4 text-base font-medium uppercase tracking-wider text-white disabled:opacity-40" style={{ backgroundColor: info.color }}>Continue</button>
                </div>
              </div>
            )}

            {/* Step 3: Subscriptions + Birthday + Review */}
            {step === 3 && (
              <div>
                <p className="text-sm uppercase tracking-wider text-gray-500 font-medium mb-3">Email Subscriptions</p>
                <p className="text-sm text-gray-500 font-light mb-3">Choose which lists you want to receive. You can change these anytime.</p>
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
                        <p className="text-sm text-gray-500 font-light">{s.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>

                <p className="text-sm uppercase tracking-wider text-gray-500 font-medium mb-3">Birthday (optional)</p>
                <p className="text-sm text-gray-500 font-light mb-3">So we can wish you a happy birthday!</p>
                <div className="flex gap-2 mb-6 items-stretch">
                  <select
                    value={bdayMonth}
                    onChange={(e) => setBdayMonth(e.target.value)}
                    className={'px-4 py-4 border border-gray-300 text-base font-light bg-white focus:outline-none focus:border-brand-700 appearance-none placeholder:text-[#D9CFF0] flex-1 min-w-0' + (!bdayMonth ? ' text-[#D9CFF0]' : ' text-gray-900')}
                  >
                    <option value="">Month</option>
                    {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select
                    value={bdayDay}
                    onChange={(e) => setBdayDay(e.target.value)}
                    className={'px-3 py-4 border border-gray-300 text-base font-light bg-white focus:outline-none focus:border-brand-700 appearance-none placeholder:text-[#D9CFF0] w-20 shrink-0' + (!bdayDay ? ' text-[#D9CFF0]' : ' text-gray-900')}
                  >
                    <option value="">Day</option>
                    {DAYS.map((d) => <option key={d} value={String(d)}>{d}</option>)}
                  </select>
                </div>

                <p className="text-sm uppercase tracking-wider text-gray-500 font-medium mb-3">Social Handles (optional)</p>
                <div className="space-y-2 mb-6">
                  <input type="text" placeholder="Facebook handle (e.g. @yourname)" value={fbHandle} onChange={(e) => setFbHandle(e.target.value)} className={ic + ' mb-0'} />
                  <input type="text" placeholder="Instagram handle (e.g. @yourname)" value={igHandle} onChange={(e) => setIgHandle(e.target.value)} className={ic + ' mb-0'} />
                  <input type="text" placeholder="LinkedIn name or profile URL" value={liHandle} onChange={(e) => setLiHandle(e.target.value)} className={ic + ' mb-0'} />
                </div>

                <p className="text-sm uppercase tracking-wider text-gray-500 font-medium mb-3">Review Your Info</p>
                <div className="bg-gray-50 border border-gray-200 p-4 mb-4 space-y-2 rounded-md">
                  <p className="text-base text-gray-900 font-medium">{fullName}</p>
                  <p className="text-sm text-gray-500 font-light">{title || 'No title selected'}</p>
                  <p className="text-sm text-gray-500 font-light">{licenseNum ? `${licenseType} ${licenseNum}` : 'No license provided'}</p>
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

                <p className="text-xs text-gray-500 font-light mb-3">Your license number is used only to avoid duplicate records and for RealtyLine&apos;s use only. It is never shared, sold or displayed publicly. Providing a license number is optional.</p>
                <p className="text-xs text-gray-500 font-light mb-4">By creating an account, you agree to receive communications from Caxton Publications, Inc. Your password lets you sign in anytime — no email link needed.</p>

                <div className="flex gap-2">
                  <button onClick={() => { void haptics.light(); setStep(2); }} className="flex-1 text-center py-4 text-base font-medium uppercase tracking-wider border border-gray-300 text-gray-500 rounded-md">Back</button>
                  <button onClick={() => { void haptics.medium(); void handleSignup(); }} disabled={loading} className="flex-1 text-center py-4 text-base font-medium uppercase tracking-wider text-white disabled:opacity-40" style={{ backgroundColor: info.color }}>{loading ? 'Sending...' : 'Create Account'}</button>
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
      <div
        className="fixed inset-0 z-50 overflow-y-auto bg-[#f7f5fa]"
        style={{
          ...SW,
          paddingTop: 'calc(env(safe-area-inset-top) + 32px)',
          paddingBottom:
            'calc(env(safe-area-inset-bottom) + var(--kb-inset-bottom, 0px) + 32px)',
        }}
      >
        <div className="min-h-full flex flex-col items-center justify-center">
          <div className="w-full max-w-md px-4">
            <div className="rounded-2xl border border-[#e5dfec] bg-white px-6 py-8 shadow-[0_18px_55px_rgba(48,29,93,0.10)] sm:px-8">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#301D5D] text-sm font-bold tracking-wide text-white">
                RNN
              </div>
              <p className="mb-2 text-center text-xs font-semibold uppercase tracking-[0.24em]" style={{ color: info.color }}>
                Realty News Now
              </p>
              <h2 className="text-center text-3xl font-semibold tracking-tight text-gray-900">
                Welcome Back
              </h2>
              <p className="mb-6 mt-2 text-center text-sm font-light leading-relaxed text-gray-500">
                Sign in for your saved profile, preferences, and subscriptions.
              </p>

              {error && (
                <div role="alert" className="mb-4 rounded-lg border border-[#FF2A04]/30 bg-[#FFEAE6] px-4 py-3 text-sm text-[#661102]">
                  {error}
                </div>
              )}

              <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="dashboard-login-email">
                Email address
              </label>
              <input
                id="dashboard-login-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mb-4 w-full rounded-lg border border-gray-300 bg-white px-4 py-4 text-base text-gray-900 outline-none transition focus:border-[#301D5D] focus:ring-2 focus:ring-[#301D5D]/10"
                autoComplete="username"
              />

              <div className="mb-2 flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700" htmlFor="dashboard-login-password">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== 'undefined') window.location.href = '/auth/forgot-password';
                  }}
                  className="py-2 text-xs font-medium text-[#301D5D] hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative mb-4">
                <input
                  id="dashboard-login-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-4 pr-16 text-base text-gray-900 outline-none transition focus:border-[#301D5D] focus:ring-2 focus:ring-[#301D5D]/10"
                  autoComplete="current-password"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handlePasswordLogin();
                  }}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-pressed={showPassword} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-2 top-2 inline-flex min-h-[32px] min-w-[44px] items-center justify-center text-xs font-semibold uppercase tracking-wider text-gray-600">
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>

              <button
                onClick={() => {
                  void haptics.medium();
                  void handlePasswordLogin();
                }}
                disabled={loading || !email || !password}
                className="mb-3 w-full rounded-lg bg-[#301D5D] py-4 text-base font-semibold text-white transition hover:bg-[#241646] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>

              <button
                onClick={() => {
                  if (isPubKey(pub)) setMode('signup');
                  else onNeedMarket();
                }}
                className="w-full rounded-lg border border-[#301D5D] py-4 text-base font-semibold text-[#301D5D] transition hover:bg-[#f7f5fa]"
              >
                Create an account
              </button>

              <div className="my-4 flex items-center" aria-hidden="true">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="px-3 text-xs uppercase tracking-[0.18em] text-gray-500">or</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              <button
                onClick={() => {
                  void haptics.light();
                  onAuth({ guest: true });
                }}
                className="w-full py-2 text-center text-sm font-semibold text-gray-600 hover:text-[#301D5D]"
              >
                Continue as a guest
              </button>
              <p className="mt-2 text-center text-xs font-light text-gray-500">
                No account is required to browse news, events, builders, partners, and resources.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-white z-50 overflow-y-auto"
      style={{
        ...SW,
        paddingTop: 'calc(env(safe-area-inset-top) + 24px)',
        paddingBottom:
          'calc(env(safe-area-inset-bottom) + var(--kb-inset-bottom, 0px) + 40px)',
      }}
    >
      <div className="min-h-full flex flex-col items-center justify-center">
      <div className="w-full max-w-md px-8">
        <p className="text-sm uppercase tracking-[0.2em] font-medium mb-2 text-center" style={{ color: info.color }}>Realty News Now</p>
        <h2 className="text-2xl text-gray-900 font-semibold text-center mb-2">Sign in to Continue</h2>
        <button
          onClick={() => {
            if (isPubKey(pub)) setMode('signup');
            else onNeedMarket();
          }}
          className="w-full text-center py-4 text-base font-medium uppercase tracking-wider text-white mb-3"
          style={{ backgroundColor: info.color }}
        >
          Create Your Account
        </button>
        <button onClick={() => setMode('login')} className="w-full text-center py-4 text-base font-medium uppercase tracking-wider border border-gray-300 text-gray-700 mb-3 rounded-md">I Already Have an Account</button>
        <div className="flex items-center my-4" aria-hidden="true">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="px-3 text-xs uppercase tracking-wider text-gray-500">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>
        <button
          onClick={() => {
            void haptics.light();
            onAuth({ guest: true });
          }}
          className="w-full text-center py-4 text-base font-medium uppercase tracking-wider text-gray-700 border border-gray-300 rounded-md"
        >
          Continue as a Guest
        </button>
      </div>
      </div>
    </div>
  );
}

// Send a freshly signed-in (non-guest) user back to the page that asked them
// to create an account, e.g. /contracts. Stored by the guest prompts.
function returnToPendingPage(u: { guest?: boolean } | null | undefined) {
  if (typeof window === 'undefined' || !u || u.guest) return;
  try {
    const to = localStorage.getItem('caxton_return_to');
    if (to && to.startsWith('/') && !to.startsWith('//')) {
      localStorage.removeItem('caxton_return_to');
      window.location.assign(to);
    }
  } catch {}
}

export default function DashboardClient({ signedOut = false }: { signedOut?: boolean }) {
  const router = useRouter();
  // Visitors with no session cookie get the sign-in screen in the server-rendered
  // HTML (instead of waiting for JS + /auth/me before it can paint).
  const [phase, setPhase] = useState(signedOut ? 'auth' : 'splash');
  // caxton-article-reader-b1-state
  const [selectedArticle, setSelectedArticle] = useState<any | null>(null);
  // caxton-article-reader-b2a-fix
  const [globalArticles, setGlobalArticles] = useState<any[]>([]);
  const [newsRefreshNonce, setNewsRefreshNonce] = useState(0);
  const [pub, setPub] = useState('');
  const [user, setUser] = useState<any>(null);
  const [authEntry, setAuthEntry] = useState<'login' | 'signup'>('login');
  const [hydrated, setHydrated] = useState(false);

  // Rehydrate from localStorage so refresh stays where the user was.
  useEffect(() => {
    let cancelled = false;
    try {
      const savedPub = localStorage.getItem('caxton_pub');
      const savedPhase = localStorage.getItem('caxton_phase');
      const savedArticle = localStorage.getItem('caxton_selected_article');
      if (isPubKey(savedPub)) {
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

    // The downloaded iOS/Android app keeps its account gate. The browser
    // website is public and sends signed-out visitors straight to the feed.
    fetch(`${API}/auth/me`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.realtor) {
          setUser(data.realtor); identifyUser(data.realtor?.id || null, { email: data.realtor?.email });
          returnToPendingPage(data.realtor);
          // Only force feed when there's no real content phase to restore.
          // Auth-flow phases (splash/select/auth) should fall through to feed;
          // content phases (feed/article) stay put. (magazines moved to /magazine in S23.)
          const savedPhaseForAuth = (() => { try { return localStorage.getItem('caxton_phase'); } catch { return null; } })();
          const contentPhases = ['feed', 'article'];
          if (!savedPhaseForAuth || !contentPhases.includes(savedPhaseForAuth)) {
            setPhase('feed');
          }
        } else {
          setUser(null);
          setAuthEntry('login');
          setPhase('auth');
          if (isNative()) {
            try { localStorage.removeItem('caxton_phase'); } catch {}
          }
        }
      })
      .catch(() => {
        if (cancelled) return;
        setUser(null);
        setAuthEntry('login');
        setPhase('auth');
      });

    setHydrated(true);
    return () => {
      cancelled = true;
    };
  }, []);

  // Listen for cross-component pub changes (MarketSwitcherSheet /
  // AppShell NavDrawer call persistPub() which dispatches this event).
  // Updating pub state here triggers the Feed's useEffect to re-fetch
  // data for the new market — no hard reload needed (which was causing
  // re-auth via the Edge proxy).
  useEffect(() => {
    function onPubChange() {
      try {
        const saved = localStorage.getItem('caxton_pub');
        if (isPubKey(saved)) {
          setPub(saved);
          // The existing useEffect [pub] already resets the category.
          // Clear any saved article from the old market.
          setSelectedArticle(null);
          try { localStorage.removeItem('caxton_selected_article'); } catch {}
          try { localStorage.removeItem('caxton_selected_event'); } catch {}
        }
      } catch {}
    }
    window.addEventListener('savedPubChange', onPubChange);
    return () => window.removeEventListener('savedPubChange', onPubChange);
  }, []);

  // Persist phase + pub on every change (after initial hydration).
  useEffect(() => {
    if (!hydrated) return;
    try {
      const maxAge = 60 * 60 * 24 * 365;
      if (isPubKey(pub)) {
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

  // A refreshed reader is initially restored from localStorage so users keep
  // their place. That saved object can predate an admin edit (for example, a
  // newly uploaded featured image), so replace it with the latest merged API
  // record every time an article reader opens or is restored.
  useEffect(() => {
    if (!hydrated || phase !== 'article' || !selectedArticle?.id) return;

    let cancelled = false;
    const articleId = String(selectedArticle.id);
    const market = articleId.startsWith('san_antonio-') ? 'san_antonio' : 'austin';

    fetch(`${API}/news/${market}`, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        const articles = Array.isArray(data?.articles) ? data.articles : [];
        const freshArticle = articles.find((item: any) => String(item?.id) === articleId);
        if (!freshArticle) return;

        setSelectedArticle(freshArticle);
        setGlobalArticles(articles);
      })
      .catch((error) => {
        // Keep the saved article readable during a transient network failure.
        console.warn(`[Article] Fresh lookup failed for ${articleId}:`, error);
      });

    return () => {
      cancelled = true;
    };
  }, [hydrated, phase, selectedArticle?.id]);




  // caxton-article-reader-b1-listener
  useEffect(() => {
    const onOpenArticle = (e: any) => {
      const article = e?.detail;
      if (article && typeof article === 'object') {
        trackEvent('article_opened', { article_id: article?.id, article_title: article?.title, article_cat: article?.cat, pub: article?.pub });
        // Articles are full pages (/news/<id>) like Builders and Calendar.
        if (article?.id) {
          // Keep the clicked card so the article page can still open it if the news list
          // it fetches (cached separately) no longer includes it, e.g. a pinned Featured item.
          try { sessionStorage.setItem('caxton_nav_article', JSON.stringify(article)); } catch { /* storage unavailable */ }
          router.push(`/news/${encodeURIComponent(String(article.id))}`);
        } else {
          setSelectedArticle(article);
          setPhase('article');
        }
      }
    };
    window.addEventListener('caxton:openArticle', onOpenArticle as EventListener);
    return () => window.removeEventListener('caxton:openArticle', onOpenArticle as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // Old share links (?article=<id>) land on the full article page.
      router.replace(`/news/${encodeURIComponent(String(match.id))}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalArticles]);

  // Returning from an article always lands at the top of the feed. The feed
  // scrolls the window, which otherwise keeps a stale offset (often the
  // bottom) from before the reader opened.
  const prevPhaseRef = useRef(phase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    if (prev !== 'article' || phase !== 'feed' || typeof window === 'undefined') return;
    const toTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    toTop();
    const raf = requestAnimationFrame(toTop);
    const t1 = setTimeout(toTop, 120);
    const t2 = setTimeout(toTop, 400);
    return () => { cancelAnimationFrame(raf); clearTimeout(t1); clearTimeout(t2); };
  }, [phase]);

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

  if (phase === 'splash') return <SplashScreen onDone={() => { trackEvent('splash_dismissed'); setPhase('auth'); }} />;
  if (phase === 'select') return <PubSelector onSelect={(id) => {
    trackEvent('pub_selected', { pub: id });
    setPub(id);
    setPhase(authEntry === 'signup' ? 'auth' : 'feed');
  }} />;
  if (phase === 'auth') return (
    <AuthGate
      pub={pub}
      initialMode={authEntry}
      onNeedMarket={() => {
        setAuthEntry('signup');
        setPhase('select');
      }}
      onAuth={(u) => {
        setUser(u);
        identifyUser(u?.id || null, { email: u?.email });
        trackEvent('auth_completed', { is_guest: !!u?.guest, pub });
        returnToPendingPage(u);
        if (isPubKey(pub)) {
          setPhase('feed');
        } else {
          setAuthEntry('login');
          setPhase('select');
        }
      }}
    />
  );

  
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

// onSwitch is still passed by the parent (legacy contract) but is no
// longer invoked from Feed — MarketSwitcherSheet calls persistPub() and
// hard-reloads to '/' directly. Keep the prop so parent typings remain
// stable.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- legacy prop kept for parent typing stability