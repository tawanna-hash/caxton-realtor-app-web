'use client';

import { useState, useEffect, useCallback } from 'react';
import { trackEvent, identifyUser } from "../../posthog-provider";
import { useRouter } from 'next/navigation';
import { useSwipeBack } from '@/hooks/use-swipe-back';
import MagazineCarousel from '@/components/MagazineCarousel';
import MagazineReader from '@/components/MagazineReader';
import MagazineFeatured from '@/components/MagazineFeatured';
import { useState as useStateForMag, useEffect as useEffectForMag } from 'react';
import type { Magazine } from '@/lib/magazines';

const SW = { fontFamily: 'Switzer, system-ui, sans-serif' };
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

const PUBS = [
  { id: 'realtyline', name: 'RealtyLine', city: 'Austin', tagline: 'Putting A Face on Real Estate since 1995', color: '#1a2a44' },
  { id: 'newsline', name: 'Newsline San Antonio', city: 'San Antonio', tagline: 'Founded 1982 - Relaunched 2025', color: '#2d1a44' },
];

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

type Giveaway = {
  headline: string;
  intro: string;
  ctaIntro: string;
  outro: string;
  fbHandle: string;
  igHandle: string;
  liHandle: string;
};

const GIVEAWAY: Record<string, Giveaway> = {
  realtyline: {
    headline: "WHO DOESN\u2019T LOVE FREE GAS?!",
    intro: "Sign up today and you\u2019re automatically entered in our Quarterly Gas Giveaway \u2014 no purchase, no catch.",
    ctaIntro: "Want to DOUBLE your chances? Follow us on all three:",
    outro: "Then tag us in a Facebook shoutout. Three clicks. One tank closer to free.",
    fbHandle: '@myrealtyline',
    igHandle: '@myrealtyline',
    liHandle: 'RealtyLine',
  },
  newsline: {
    headline: "WHO DOESN\u2019T LOVE FREE GAS?!",
    intro: "Sign up today and you\u2019re automatically entered in our Quarterly Gas Giveaway \u2014 no purchase, no catch.",
    ctaIntro: "Want to DOUBLE your chances? Follow us on all three:",
    outro: "Then tag us in a Facebook shoutout. Three clicks. One tank closer to free.",
    fbHandle: '@newslinesa',
    igHandle: '@newsline_sanantonio',
    liHandle: 'Newsline San Antonio',
  },
};

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
    <div className="fixed inset-0 bg-[#1a2a44] flex flex-col items-center justify-center z-50 transition-opacity duration-500" style={{ ...SW, opacity: fade ? 0 : 1 }}>
      <p className="text-3xl text-white font-semibold tracking-wide text-center px-8">Caxton Publications, Inc.</p>
      <div className="mt-4 flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" style={{ animationDelay: '0s' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" style={{ animationDelay: '0.3s' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" style={{ animationDelay: '0.6s' }} />
      </div>
    </div>
  );
}

function PubSelector({ onSelect }: { onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-40" style={SW}>
      <div className="w-full max-w-md px-8">
        <p className="text-sm uppercase tracking-[0.25em] text-gray-400 font-medium mb-2 text-center">Caxton Publications, Inc.</p>
        <h2 className="text-2xl text-gray-900 font-semibold text-center mb-3">Select a Publication</h2>
        <p className="text-lg text-gray-400 font-light text-center mb-8">Welcome, we are happy you are here!</p>
        <div className="relative">
          <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-4 border border-gray-300 bg-white text-left rounded-lg">
            <span className="text-lg text-gray-500 font-light">Choose your market...</span>
            <span className="text-gray-400 text-base">{open ? '\u25B2' : '\u25BC'}</span>
          </button>
          {open && (
            <div className="absolute top-full left-0 right-0 border border-gray-300 border-t-0 bg-white z-10">
              {PUBS.map((pub) => (
                <button key={pub.id} onClick={() => onSelect(pub.id)} className="w-full text-left px-4 py-5 border-b border-gray-100 bg-white hover:bg-gray-50">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: pub.color }}>
                      <span className="text-white text-base font-medium">{pub.id === 'realtyline' ? 'RL' : 'NS'}</span>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-gray-900">{pub.name}</p>
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
    </div>
  );
}

function AuthGate({ pub, onAuth }: { pub: string; onAuth: (user: any) => void }) {
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
  const [showGiveaway, setShowGiveaway] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const info = PUBS.find((p) => p.id === pub) || PUBS[0];

  useEffect(() => {
    if (typeof window !== 'undefined' && !window.localStorage.getItem('caxton_giveaway_seen')) {
      setShowGiveaway(true);
      trackEvent('giveaway_popup_shown', { pub });
    }
  }, []);
  const ic = 'w-full px-4 py-3.5 border border-gray-300 text-base font-light bg-white focus:outline-none focus:border-[#1a2a44] mb-3 placeholder:text-[#C7C7CD]';
  const sc = 'w-full px-4 py-3.5 border border-gray-300 text-base font-light bg-white focus:outline-none focus:border-[#1a2a44] mb-3 appearance-none placeholder:text-[#C7C7CD]';

  function dismissGiveaway() {
    setShowGiveaway(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('caxton_giveaway_seen', '1');
    }
  }

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
          consentText: 'I agree to receive communications from Caxton Publications, Inc.',
        }),
      });
      if (res.ok) {
        trackEvent('magic_link_requested', { mode: 'signup', email, pub });
        setMode('sent');
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.message || 'Something went wrong. Please try again.');
      }
    } catch (e) {
      setError('Cannot reach server. Is the API running?');
    }
    setLoading(false);
  }

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
    } catch (e) {
      setError('Cannot reach server. Is the API running?');
    }
    setLoading(false);
  }

  function handleSkip() {
    trackEvent('auth_guest_skip', { pub });
    onAuth({ id: 'guest', firstName: 'Guest', email: '', guest: true });
  }

  if (mode === 'sent') {
    return (
      <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-40" style={SW}>
        <div className="w-full max-w-md px-8 text-center">
          <div className="text-5xl mb-4">{'\u2709'}</div>
          <h2 className="text-2xl text-gray-900 font-semibold mb-3">Check Your Email</h2>
          <p className="text-lg text-gray-500 font-light mb-2">We sent a magic link to</p>
          <p className="text-lg text-[#1a2a44] font-semibold mb-6">{email}</p>
          <p className="text-base text-gray-400 font-light mb-8">Click the link in your email to sign in. It expires in 15 minutes.</p>
          <p className="text-sm text-gray-300 font-light">Check your spam folder if you do not see it.</p>
        </div>
      </div>
    );
  }

  if (mode === 'signup') {
    return (
      <div className="fixed inset-0 bg-white z-40 overflow-y-auto" style={SW}>
        {showGiveaway && step === 1 && GIVEAWAY[pub] && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center px-4 py-8 overflow-y-auto" style={SW}>
            <div className="bg-white max-w-sm w-full p-7 relative my-auto">
              <button onClick={dismissGiveaway} aria-label="Close" className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 p-1">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
              <div className="text-center mt-2 mb-6">
                <span className="inline-block px-4 py-2 text-white text-xs uppercase tracking-[0.25em] font-medium" style={{ backgroundColor: info.color }}>{info.name}</span>
              </div>
              <p className="text-center text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Subscribe and you could</p>
              <h2 className="text-center text-4xl font-bold uppercase tracking-tight leading-none mb-5" style={{ color: info.color }}>Win Free Fuel</h2>
              <p className="text-base text-gray-600 font-light text-center leading-relaxed mb-5">Sign up now and you{"\u2019"}ll automatically be entered in our Fuel Giveaway.</p>
              <p className="text-base text-gray-800 font-medium text-center mb-3">Triple Your Chances By Connecting With Us</p>
              <div className="space-y-2 mb-5">
                <a href={SOCIALS[pub]?.fb || '#'} target="_blank" rel="noopener noreferrer" className="block text-center py-2.5 border border-gray-300 text-base text-gray-700 font-light rounded-md">Facebook · <span className="text-gray-900 font-medium">{GIVEAWAY[pub]?.fbHandle}</span></a>
                <a href={SOCIALS[pub]?.ig || '#'} target="_blank" rel="noopener noreferrer" className="block text-center py-2.5 border border-gray-300 text-base text-gray-700 font-light rounded-md">Instagram · <span className="text-gray-900 font-medium">{GIVEAWAY[pub]?.igHandle}</span></a>
                <a href={SOCIALS[pub]?.li || '#'} target="_blank" rel="noopener noreferrer" className="block text-center py-2.5 border border-gray-300 text-base text-gray-700 font-light rounded-md">LinkedIn · <span className="text-gray-900 font-medium">{GIVEAWAY[pub]?.liHandle}</span></a>
              </div>
              <button onClick={() => { trackEvent('giveaway_continue_signup', { pub }); dismissGiveaway(); }} className="w-full py-3.5 text-base font-medium uppercase tracking-[0.15em] text-white" style={{ backgroundColor: info.color }}>Continue Signup</button>
              <p className="text-center text-[11px] text-gray-400 mt-4 font-light leading-relaxed px-2">Winner will be notified via email. By entering, winner agrees to be photographed and featured in an upcoming issue.</p>
            </div>
          </div>
        )}
        <div className="min-h-full flex flex-col items-center py-10">
          <div className="w-full max-w-md px-8">
            <p className="text-sm uppercase tracking-[0.25em] font-medium mb-2 text-center" style={{ color: info.color }}>{info.name}</p>
            <h2 className="text-2xl text-gray-900 font-semibold text-center mb-8">Create Your Account</h2>

            {/* Step indicators */}
            <div className="flex items-center justify-center gap-2 mb-6">
              <div className={step >= 1 ? 'w-3 h-3 rounded-full bg-[#1a2a44]' : 'w-3 h-3 rounded-full bg-gray-200'} />
              <div className="w-8 h-px bg-gray-200" />
              <div className={step >= 2 ? 'w-3 h-3 rounded-full bg-[#1a2a44]' : 'w-3 h-3 rounded-full bg-gray-200'} />
              <div className="w-8 h-px bg-gray-200" />
              <div className={step >= 3 ? 'w-3 h-3 rounded-full bg-[#1a2a44]' : 'w-3 h-3 rounded-full bg-gray-200'} />
            </div>

            {error && <p className="text-base text-red-500 text-center mb-4 font-light">{error}</p>}

            {/* Step 1: License + Identity */}
            {step === 1 && (
              <div>
                <p className="text-sm uppercase tracking-wider text-gray-400 font-medium mb-3">License Number</p>
                <div className="flex gap-2 mb-3">
                  {LICENSE_TYPES.map((lt) => (
                    <button key={lt} onClick={() => setLicenseType(lt)} className={licenseType === lt ? 'flex-1 py-3 text-base font-medium text-center border-2 border-[#1a2a44] text-[#1a2a44]' : 'flex-1 py-3 text-base font-light text-center border border-gray-300 text-gray-500'}>{lt}</button>
                  ))}
                </div>
                <input type="text" placeholder={licenseType === 'TREC #' ? 'TREC License Number' : 'NMLS ID Number'} value={licenseNum} onChange={(e) => setLicenseNum(e.target.value)} className={ic} />
<p className="text-sm uppercase tracking-wider text-gray-400 font-medium mb-3 mt-6">Your Information</p>
                <input type="text" placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} className={ic} />
                <select value={title} onChange={(e) => setTitle(e.target.value)} className={sc + (!title ? ' text-[#C7C7CD]' : ' text-gray-900')}>
                  <option value="">Select Title / Role</option>
                  {TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>

                <button onClick={() => setStep(2)} disabled={!fullName || !licenseNum} className="w-full text-center py-3.5 text-base font-medium uppercase tracking-wider text-white mt-4 disabled:opacity-40" style={{ backgroundColor: info.color }}>Continue</button>
                <button onClick={() => setMode('choice')} className="w-full text-center py-2 text-base text-gray-400 font-light mt-2">Back</button>
              </div>
            )}

            {/* Step 2: Contact Info */}
            {step === 2 && (
              <div>
                <p className="text-sm uppercase tracking-wider text-gray-400 font-medium mb-3">Contact Information</p>
                <input type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} className={ic} />
                <input type="tel" placeholder="Mobile Phone" value={mobile} onChange={(e) => setMobile(e.target.value)} className={ic} />

                <p className="text-sm uppercase tracking-wider text-gray-400 font-medium mb-3 mt-4">Mailing Address</p>
                <input type="text" placeholder="Street Address" value={addr1} onChange={(e) => setAddr1(e.target.value)} className={ic} />
                <input type="text" placeholder="Suite / Unit (optional)" value={addr2} onChange={(e) => setAddr2(e.target.value)} className={ic} />
                <div className="flex gap-2">
                  <input type="text" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} className={ic + ' flex-1'} />
                  <input type="text" value="TX" disabled className="w-16 px-4 py-3.5 border border-gray-200 text-base font-light bg-gray-50 text-gray-400 mb-3 text-center" />
                  <input type="text" placeholder="Zip" value={zip} onChange={(e) => setZip(e.target.value)} className="w-24 px-4 py-3.5 border border-gray-300 text-base font-light bg-white focus:outline-none focus:border-[#1a2a44] mb-3" />
                </div>

                <div className="flex gap-2 mt-2">
                  <button onClick={() => setStep(1)} className="flex-1 text-center py-3.5 text-base font-medium uppercase tracking-wider border border-gray-300 text-gray-500 rounded-md">Back</button>
                  <button onClick={() => setStep(3)} disabled={!email} className="flex-1 text-center py-3.5 text-base font-medium uppercase tracking-wider text-white disabled:opacity-40" style={{ backgroundColor: info.color }}>Continue</button>
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
                    <label key={s.id} className="flex items-start gap-3 p-3 border border-gray-200 cursor-pointer rounded-lg">
                      <input
                        type="checkbox"
                        checked={subs.includes(s.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSubs([...subs, s.id]);
                          else setSubs(subs.filter((x) => x !== s.id));
                        }}
                        className="mt-1 w-4 h-4 accent-[#1a2a44]"
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
                  <select value={bdayMonth} onChange={(e) => setBdayMonth(e.target.value)} className={sc + ' flex-1' + (!bdayMonth ? ' text-[#C7C7CD]' : ' text-gray-900')}>
                    <option value="">Month</option>
                    {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select value={bdayDay} onChange={(e) => setBdayDay(e.target.value)} className={sc + ' w-24' + (!bdayDay ? ' text-[#C7C7CD]' : ' text-gray-900')}>
                    <option value="">Day</option>
                    {DAYS.map((d) => <option key={d} value={String(d)}>{d}</option>)}
                  </select>
                </div>

                <p className="text-sm uppercase tracking-wider text-gray-400 font-medium mb-3">Social Handles (optional)</p>
                <p className="text-sm text-gray-400 font-light mb-3">For our giveaways: tell us your social handles so we can verify your follow when picking winners. We never message or tag you here.</p>
                <div className="space-y-2 mb-6">
                  <input type="text" placeholder="Facebook handle (e.g. @yourname)" value={fbHandle} onChange={(e) => setFbHandle(e.target.value)} className={ic + ' mb-0'} />
                  <input type="text" placeholder="Instagram handle (e.g. @yourname)" value={igHandle} onChange={(e) => setIgHandle(e.target.value)} className={ic + ' mb-0'} />
                  <input type="text" placeholder="LinkedIn name or profile URL" value={liHandle} onChange={(e) => setLiHandle(e.target.value)} className={ic + ' mb-0'} />
                </div>

                <p className="text-sm uppercase tracking-wider text-gray-400 font-medium mb-3">Review Your Info</p>
                <div className="bg-gray-50 border border-gray-200 p-4 mb-4 space-y-2 rounded-lg">
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

                <p className="text-xs text-gray-500 font-light mb-3">Your license number is used only to avoid duplicate records and for RealtyLine's use only. It is never shared, sold or displayed publicly.</p>
                <p className="text-xs text-gray-400 font-light mb-4">By creating an account, you agree to receive communications from Caxton Publications, Inc. We will send a magic link to your email - no password needed.</p>

                <div className="flex gap-2">
                  <button onClick={() => setStep(2)} className="flex-1 text-center py-3.5 text-base font-medium uppercase tracking-wider border border-gray-300 text-gray-500 rounded-md">Back</button>
                  <button onClick={handleSignup} disabled={loading} className="flex-1 text-center py-3.5 text-base font-medium uppercase tracking-wider text-white disabled:opacity-40" style={{ backgroundColor: info.color }}>{loading ? 'Sending...' : 'Create Account'}</button>
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
          <p className="text-sm uppercase tracking-[0.25em] font-medium mb-2 text-center" style={{ color: info.color }}>{info.name}</p>
          <h2 className="text-2xl text-gray-900 font-semibold text-center mb-6">Welcome Back</h2>
          {error && <p className="text-base text-red-500 text-center mb-4 font-light">{error}</p>}
          <input type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} className={ic} />
          <p className="text-sm text-gray-400 font-light mb-4">We will send you a magic link. No password needed.</p>
          <button onClick={handleLogin} disabled={loading || !email} className="w-full text-center py-3.5 text-base font-medium uppercase tracking-wider text-white mb-3 disabled:opacity-40" style={{ backgroundColor: info.color }}>{loading ? 'Sending...' : 'Send Magic Link'}</button>
          <button onClick={() => setMode('choice')} className="w-full text-center py-2 text-base text-gray-400 font-light">Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-40" style={SW}>
      <div className="w-full max-w-md px-8">
        <p className="text-sm uppercase tracking-[0.25em] font-medium mb-2 text-center" style={{ color: info.color }}>{info.name}</p>
        <h2 className="text-2xl text-gray-900 font-semibold text-center mb-2">Sign In to Continue</h2>
        <button onClick={() => setMode('signup')} className="w-full text-center py-3.5 text-base font-medium uppercase tracking-wider text-white mb-3" style={{ backgroundColor: info.color }}>Create Your Account</button>
        <button onClick={() => setMode('login')} className="w-full text-center py-3.5 text-base font-medium uppercase tracking-wider border border-gray-300 text-gray-700 mb-6 rounded-md">I Already Have an Account</button>
        <button onClick={handleSkip} className="w-full text-center py-2 text-sm text-gray-300 font-light">Continue as Guest</button>
        <p className="text-xs text-gray-300 text-center mt-4 font-light">Guest access has limited features</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [phase, setPhase] = useState('splash');
  // caxton-events-frontend-v1-state
  const [events, setEvents] = useState<any[] | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
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
      const savedEvent = localStorage.getItem('caxton_selected_event');
      if (savedPub === 'realtyline' || savedPub === 'newsline') {
        setPub(savedPub);
      }
      // Restore selections BEFORE phase so the phase render has its data.
      if (savedArticle) {
        try { setSelectedArticle(JSON.parse(savedArticle)); } catch {}
      }
      if (savedEvent) {
        try { setSelectedEvent(JSON.parse(savedEvent)); } catch {}
      }
      if (savedPhase && savedPhase !== 'splash') {
        // Stale-data guard: don't restore article/event_detail phase if its data is missing.
        if (savedPhase === 'article' && !savedArticle) {
          setPhase('feed');
        } else if (savedPhase === 'event_detail' && !savedEvent) {
          setPhase('events');
        } else {
          setPhase(savedPhase);
        }
      }
    } catch {}

    // Check if we already have a server session.
    fetch(`${API}/auth/me`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.realtor) {
          setUser(data.realtor); identifyUser(data.realtor?.id || null, { email: data.realtor?.email });
          // Only force feed when there's no real content phase to restore.
          // Auth-flow phases (splash/select/auth) should fall through to feed;
          // content phases (feed/article/events/event_detail/magazines) stay put.
          const savedPhaseForAuth = (() => { try { return localStorage.getItem('caxton_phase'); } catch { return null; } })();
          const contentPhases = ['feed', 'article', 'events', 'event_detail', 'magazines'];
          if (!savedPhaseForAuth || !contentPhases.includes(savedPhaseForAuth)) {
            setPhase('feed');
          }
        }
      })
      .catch(() => {});

    setHydrated(true);
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist phase + pub on every change (after initial hydration).
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (pub === 'realtyline' || pub === 'newsline') {
        localStorage.setItem('caxton_pub', pub);
      } else {
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

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (selectedEvent) {
        localStorage.setItem('caxton_selected_event', JSON.stringify(selectedEvent));
      } else {
        localStorage.removeItem('caxton_selected_event');
      }
    } catch {}
  }, [selectedEvent, hydrated]);




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
      if (target === 'events' || target === 'feed' || target === 'magazines') {
        trackEvent('nav', { target });
      }
      if (target === 'events') setPhase('events');
      else if (target === 'feed') setPhase('feed');
      else if (target === 'magazines') setPhase('magazines');
    };
    window.addEventListener('caxton:nav', onNav as EventListener);
    return () => window.removeEventListener('caxton:nav', onNav as EventListener);
  }, []);

  // caxton-events-frontend-v1-fetch
  useEffect(() => {
    if (!pub) return;
    let cancelled = false;
    setEventsLoading(true);
    setEventsError(false);
    const market = pub === 'realtyline' ? 'austin' : 'san_antonio';
    fetch(`/api/events/${market}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (cancelled) return;
        const arr = Array.isArray(data?.events) ? data.events : [];
        console.log(`[Events] Loaded ${arr.length} events for ${market}`);
        setEvents(arr);
        setEventsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[Events] Failed to load:', err);
        setEventsError(true);
        setEventsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pub]);

  if (phase === 'splash') return <SplashScreen onDone={() => { trackEvent('splash_dismissed'); setPhase('select'); }} />;
  if (phase === 'select') return <PubSelector onSelect={(id) => { trackEvent('pub_selected', { pub: id }); setPub(id); setPhase('auth'); }} />;
  if (phase === 'auth') return <AuthGate pub={pub} onAuth={(u) => { setUser(u); identifyUser(u?.id || null, { email: u?.email }); trackEvent('auth_completed', { is_guest: !!u?.guest, pub }); setPhase('feed'); }} />;

  // caxton-events-frontend-v1-phases
  if (phase === 'events')
    return (
      <EventsList
        pub={pub}
        events={events}
        loading={eventsLoading}
        error={eventsError}
        onBack={() => setPhase('feed')}
        onSelect={(ev: any) => {
          setSelectedEvent(ev);
          setPhase('event_detail');
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
  if (phase === 'event_detail')
    return (
      <EventDetail
        pub={pub}
        event={selectedEvent}
        onBack={() => setPhase('events')}
      />
    );
  // caxton-magazine-phase-b1
  if (phase === 'magazines')
    return (
      <MagazinePhase
        pub={pub}
        onBack={() => setPhase('feed')}
        onOpenArticle={(a: any) => { setSelectedArticle(a); setPhase('article'); }}
      />
    );
  const handleLogout = async () => {
    if (!confirm("Are you sure you want to log out?")) return;
    try {
      await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" });
    } catch {}
    try {
      localStorage.removeItem("caxton_pub");
      localStorage.removeItem("caxton_phase");
    } catch {}
    setUser(null);
    identifyUser(null);
    setPub("");
    setPhase("splash");
  };

  return <Feed pub={pub} user={user} onSwitch={(id) => { setPub(id); }} newsRefreshNonce={newsRefreshNonce} onLogout={handleLogout} />;
}

function Feed({ pub, user, onSwitch, newsRefreshNonce, onLogout }: { pub: string; user: any; onSwitch: (id: string) => void; newsRefreshNonce: number; onLogout: () => void }) {
  const [tab, setTab] = useState('n');
  const [cat, setCat] = useState('All');
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const track = useMetrics(user?.id || null);
  const info = PUBS.find((p) => p.id === pub) || PUBS[0];
  const other = PUBS.find((p) => p.id !== pub) || PUBS[1];
  const [liveNews, setLiveNews] = useState<any[] | null>(null);
  // caxton-article-reader-b2a-fix (dispatcher)
  useEffect(() => {
    if (liveNews && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('caxton:newsList', { detail: liveNews }));
    }
  }, [liveNews]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
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
  const tOn = 'whitespace-nowrap px-4 py-2 text-sm font-medium rounded-md border border-[#1a2a44] bg-[#1a2a44] text-white';
  const tOff = 'whitespace-nowrap px-4 py-2 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:border-gray-500';

  const feed: { t: 'n' | 'a' | 'c' | 's' | 'e'; d?: any }[] = [];
  const isLoadingFirstFetch = newsLoading && liveNews === null;
  const isEmptyAfterLoad = !isLoadingFirstFetch && filt.length === 0;

  if (isLoadingFirstFetch) {
    for (let i = 0; i < 3; i++) feed.push({ t: 's', d: { id: i } });
  } else if (isEmptyAfterLoad) {
    feed.push({ t: 'e', d: { cat } });
  } else {
    let ai = 0;
    filt.forEach((item, i) => {
      feed.push({ t: 'n', d: item });
      if ((i + 1) % 2 === 0 && ai < pubAds.length) {
        feed.push({ t: 'a', d: pubAds[ai] });
        ai++;
      }
      if (i === 2) {
        feed.push({ t: 'c' });
      }
    });
  }

  function handleSwitch() {
    setCat('All');
    setTab('n');
    onSwitch(other.id);
  }

  function handleAdClick(ad: any) {
    track('ad_click', { adId: ad.id, advertiser: ad.biz, publication: pub });
    window.open(ad.url, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="min-h-screen bg-white pb-36" style={SW}>
      <div className="px-3 py-3 flex items-center justify-between bg-white border-b border-gray-200">
        <button onClick={() => { trackEvent('menu_opened'); setMenuOpen(true); }} aria-label="Open menu" className="text-gray-900 p-2 border border-gray-300 rounded-full hover:border-gray-400 transition-colors">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
        </button>
        <p className="text-base font-semibold text-gray-900 tracking-tight">Caxton Publications, Inc.</p>
        <button aria-label="Search" className="text-gray-700 p-2">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        </button>
      </div>
      <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: info.color }}>
        <div className="min-w-0 flex-1">
          {!user?.guest && user?.firstName && (
            <p className="text-[10px] uppercase tracking-[0.25em] text-white/50 font-medium">Welcome, {user.firstName}</p>
          )}
          <p className="text-white text-lg font-semibold tracking-wide truncate">{info.name}</p>
        </div>
        <button onClick={handleSwitch} className="text-xs uppercase tracking-wider text-white/80 font-medium border border-white/30 px-3 py-1.5 flex items-center gap-2 flex-shrink-0 ml-2">
          <span>{other.name}</span>
          <span className="text-white/50">{'\u2192'}</span>
        </button>
      </div>
      {menuOpen && (
        <div className="fixed inset-0 z-[60] overflow-y-auto" style={{ ...SW, backgroundColor: info.color }}>
          <div className="sticky top-0 bg-black px-3 py-3 flex items-center justify-between border-b border-white/10 z-10">
            <div className="w-10" />
            <p className="text-sm uppercase tracking-[0.25em] text-white/50 font-medium">Caxton Publications, Inc.</p>
            <button onClick={() => setMenuOpen(false)} aria-label="Close menu" className="text-white p-2">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div className="px-6 py-8 pb-32">
            <button onClick={() => { trackEvent('publication_switch_clicked'); setMenuOpen(false); handleSwitch(); }} className="w-full flex items-center justify-between border border-white/30 px-4 py-3.5 text-white text-sm uppercase tracking-wider font-medium mb-10">
              <span>Switch to {other.name}</span>
              <span className="text-white/60">{'\u2192'}</span>
            </button>
            <div className="mb-10">
              <div className="space-y-5">
                <button onClick={() => { setMenuOpen(false); window.dispatchEvent(new CustomEvent('caxton:nav', { detail: 'magazines' })); }} className="block text-sm uppercase tracking-[0.15em] text-white font-medium text-left">Magazine</button>
                <button onClick={() => { setMenuOpen(false); window.dispatchEvent(new CustomEvent('caxton:nav', { detail: 'events' })); }} className="block text-sm uppercase tracking-[0.15em] text-white font-medium text-left">Calendar</button>
                <button onClick={() => { setMenuOpen(false); router.push("/giveaways"); }} className="block text-sm uppercase tracking-[0.15em] text-white font-medium text-left">Giveaway</button>
                <button onClick={() => { setMenuOpen(false); router.push("/inventory"); }} className="block text-sm uppercase tracking-[0.15em] text-white font-medium text-left">Builder Inventory</button>
                <button onClick={() => { setMenuOpen(false); router.push("/builder-promotions"); }} className="block text-sm uppercase tracking-[0.15em] text-white font-medium text-left">Builder Promotions</button>
              </div>
            </div>
            <div className="mb-10 pt-6 border-t border-white/20">
              <div className="space-y-5">
                <a href="#" className="block text-sm uppercase tracking-[0.15em] text-white font-medium">Digital Newsletters</a>
                <button onClick={() => { setMenuOpen(false); router.push("/subscribe"); }} className="block text-sm uppercase tracking-[0.15em] text-white font-medium text-left">Subscribe to Print</button>
                <a href="#" className="block text-sm uppercase tracking-[0.15em] text-white font-medium">Manage Subscriptions</a>
                <button onClick={() => { setMenuOpen(false); router.push("/faq"); }} className="block text-sm uppercase tracking-[0.15em] text-white font-medium text-left">FAQs</button>
                <a href="#" className="block text-sm uppercase tracking-[0.15em] text-white font-medium">Site Map</a>
              </div>
            </div>
            <div className="mb-10 pt-6 border-t border-white/20">
              <div className="space-y-5">
                <button onClick={() => { setMenuOpen(false); router.push("/about"); }} className="block text-sm uppercase tracking-[0.15em] text-white font-medium text-left">About Us</button>
                <button onClick={() => { setMenuOpen(false); router.push("/advertise"); }} className="block text-sm uppercase tracking-[0.15em] text-white font-medium text-left">Advertise</button>
                <a href="#" className="block text-sm uppercase tracking-[0.15em] text-white font-medium">My Profile</a>
                <a href="/admin/login" className="block text-sm uppercase tracking-[0.15em] text-white font-medium">Admin Login</a>
              </div>
            </div>
            <div className="mb-10 pt-6 border-t border-white/20">
              <div className="space-y-5">
                <button onClick={() => { setMenuOpen(false); router.push("/privacy"); }} className="block text-sm uppercase tracking-[0.15em] text-white font-medium text-left">Privacy Notice</button>
                <button onClick={() => { setMenuOpen(false); router.push("/terms"); }} className="block text-sm uppercase tracking-[0.15em] text-white font-medium text-left">User Agreement</button>
              </div>
            </div>
            <div className="mb-10 pt-6 border-t border-white/20">
              {user ? (
                <button
                  onClick={() => { trackEvent('logout_clicked'); setMenuOpen(false); onLogout(); }}
                  className="block text-sm uppercase tracking-[0.15em] text-white font-medium text-left"
                >
                  Logout
                </button>
              ) : (
                <a
                  href="/"
                  onClick={() => { trackEvent('login_link_clicked'); setMenuOpen(false); }}
                  className="block text-sm uppercase tracking-[0.15em] text-white font-medium"
                >
                  Login
                </a>
              )}
            </div>
            <p className="text-xs text-white/30 font-light text-center pt-4">{'\u00A9'} 2026 Caxton Publications, Inc.</p>
          </div>
        </div>
      )}
      {user?.guest && (
        <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
          <p className="text-sm text-amber-700 font-light">Browsing as Guest</p>
          <button onClick={() => window.location.reload()} className="text-sm text-amber-700 font-medium underline">Sign In</button>
        </div>
      )}
      <div className="bg-white sticky top-0 z-10 border-b border-gray-200 px-4 py-4">
        <h2 className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-3">Builder / Developer Advertisers</h2>
        <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          <button onClick={() => router.push('/communities')} className={tOff}>New Home Communities</button>
          <button onClick={() => router.push('/inventory?kind=listing')} className={tOff}>Move-in Ready Homes</button>
          <button onClick={() => router.push('/inventory?kind=promotion')} className={tOff}>Promotions</button>
        </div>
      </div>
      {tab === 'n' && (
        <div>
          <FeedTopBanner pub={pub} />
          <div className="flex gap-2 overflow-x-auto px-4 py-3 bg-white border-b border-gray-200" style={{ scrollbarWidth: 'none' }}>
            {CATS.map((c) => (
              <button key={c} onClick={() => setCat(c)} className={cat === c ? 'whitespace-nowrap px-3 py-1.5 text-sm font-medium uppercase tracking-wider border border-[#1a2a44] bg-[#1a2a44] text-white' : 'whitespace-nowrap px-3 py-1.5 text-sm font-medium uppercase tracking-wider border border-gray-300 bg-white text-gray-500'}>{c}</button>
            ))}
          </div>
          <div>
            {feed.map((item, idx) => item.t === 's' ? (
              <ArticleSkeleton key={'s' + idx} />
            ) : item.t === 'e' ? (
              <EmptyState key={'e' + idx} cat={item.d.cat} />
            ) : item.t === 'c' ? (
              <NewsletterCTA key={'c' + idx} info={info} />
            ) : item.t === 'n' ? (
              <article key={'n' + item.d.id} className="bg-white border-b border-gray-200">
                <ArticleCard item={item.d} />
              </article>
            ) : (
              <AdCardTracked key={'a' + item.d.id} ad={item.d} onClick={handleAdClick} track={track} pub={pub} />
            ))}
          </div>
        </div>
      )}
      {tab === 'e' && (
        <div>
          <div className="px-4 py-4 border-b border-gray-200">
            <p className="text-sm uppercase tracking-[0.25em] text-gray-400 font-medium">Upcoming in {info.city}</p>
          </div>
          {EVTS.map((ev) => {
            const mo = ev.date.split(' ')[0];
            const dy = (ev.date.split(' ')[1] || '').replace(',', '');
            return (
              <article key={ev.id} className="bg-white border-b border-gray-200">
                <div className="px-4 py-5 flex gap-4">
                  <div className="flex-shrink-0 w-16 h-16 flex flex-col items-center justify-center rounded" style={{ backgroundColor: info.color }}>
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
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-300 z-50">
        <a href="#" className="block px-4 py-3 border-b border-gray-100 hover:bg-gray-50">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 flex-shrink-0 flex flex-col items-center justify-center" style={{ backgroundColor: info.color }}>
                <span className="text-[8px] uppercase tracking-wider text-white/70 leading-none">House</span>
                <span className="text-[10px] uppercase tracking-wider text-white font-semibold leading-none mt-0.5">Ad</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 leading-tight truncate">Advertise in {info.name}</p>
                <p className="text-xs text-gray-500 font-light leading-snug truncate">Reach 50,000+ Texas real estate pros</p>
              </div>
            </div>
            <span className="text-xs uppercase tracking-wider font-medium flex-shrink-0" style={{ color: info.color }}>Learn More {'\u2192'}</span>
          </div>
        </a>
        <div className="flex justify-around py-2 pb-3">
          <button onClick={() => { if (typeof window !== "undefined") { window.dispatchEvent(new CustomEvent("caxton:nav", { detail: "magazines" })); window.dispatchEvent(new CustomEvent("caxton:openLatestMagazine")); } }} className="flex flex-col items-center text-[#1a2a44] flex-1 px-1 gap-1"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg><span className="text-[10px] font-medium uppercase tracking-wider whitespace-nowrap">Latest Issue</span></button>
          <button onClick={() => { if (typeof window !== "undefined") { window.dispatchEvent(new CustomEvent("caxton:nav", { detail: "magazines" })); } }} className="flex flex-col items-center text-gray-400 flex-1 px-1 gap-1"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/></svg><span className="text-[10px] font-medium uppercase tracking-wider whitespace-nowrap">All Issues</span></button>
          <button onClick={() => router.push("/dashboard")} className="flex flex-col items-center text-gray-400 flex-1 px-1 gap-1"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg><span className="text-[10px] font-medium uppercase tracking-wider whitespace-nowrap">Latest Columns</span></button>
          <button onClick={() => { if (typeof window !== "undefined") { window.dispatchEvent(new CustomEvent("caxton:nav", { detail: "events" })); } }} className="flex flex-col items-center text-gray-400 flex-1 px-1 gap-1"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg><span className="text-[10px] font-medium uppercase tracking-wider whitespace-nowrap">Calendar</span></button> {/* caxton-events-frontend-v1-footer */}
          <button onClick={() => router.push("/giveaways")} className="flex flex-col items-center text-gray-400 flex-1 px-1 gap-1"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/></svg><span className="text-[10px] font-medium uppercase tracking-wider whitespace-nowrap">Giveaways</span></button>
        </div>
      </nav>
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
    <article ref={ref} className="bg-[#faf8f3] border-b border-[#e8dcc8]">
      <div className="px-4 py-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-full bg-white border border-[#d4af37] flex items-center justify-center">
            <span className="text-xs font-medium text-[#d4af37]">{initials}</span>
          </div>
          <span className="text-sm uppercase tracking-[0.2em] font-semibold text-[#b8972e]">Sponsored</span>
          <span className="flex-1" />
          <span className="text-sm text-gray-400 italic font-light">{ad.page}</span>
        </div>
        <p className="text-base text-[#1a2a44] font-medium mb-1">{ad.biz}</p>
        <h3 className="text-xl text-gray-900 leading-snug mb-2 font-semibold">{ad.tag}</h3>
        <p className="text-lg text-gray-500 leading-relaxed mb-4 font-light">{ad.desc}</p>
        <button onClick={() => onClick(ad)} className="w-full text-center py-3 text-base font-medium uppercase tracking-wider bg-[#1a2a44] text-white">Connect Now</button>
      </div>
    </article>
  );
}

function NewsletterCTA({ info }: { info: typeof PUBS[0] }) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  function handleSubmit() {
    if (!email) return;
    // TODO: wire to /newsletter/subscribe API endpoint
    setSubmitted(true);
  }
  return (
    <div className="bg-gray-100 border-y border-gray-200 px-5 py-8">
      <p className="text-center text-2xl font-bold text-gray-900 leading-tight mb-2">Get All Our Content in One Weekly Email</p>
      <p className="text-center text-base text-gray-500 font-light mb-6">It{'\u2019'}s free. It{'\u2019'}s weekly. And it{'\u2019'}s full of great resources.</p>
      {submitted ? (
        <p className="text-center text-base text-gray-700 font-medium py-4">{'\u2713'} You{'\u2019'}re subscribed. Watch your inbox.</p>
      ) : (
        <>
          <div className="flex max-w-md mx-auto">
            <input
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 px-4 py-3.5 border border-gray-300 text-base font-light bg-white focus:outline-none focus:border-[#1a2a44] placeholder:text-[#C7C7CD]"
            />
            <button onClick={handleSubmit} className="px-6 py-3.5 text-base font-medium uppercase tracking-wider text-white whitespace-nowrap" style={{ backgroundColor: info.color }}>
              Sign Up
            </button>
          </div>
          <div className="flex items-center justify-center gap-6 mt-4 text-xs uppercase tracking-wider text-gray-600 font-medium">
            <a href="#" className="border-b border-gray-400 pb-0.5">All Newsletters</a>
            <a href="#" className="border-b border-gray-400 pb-0.5">Privacy Policy</a>
          </div>
        </>
      )}
    </div>
  );
}


function ArticleCard({ item }: { item: any }) {
  const body = (
    <div className="flex items-start gap-4">
      <div className="flex-1 min-w-0">
        <span className="text-xs uppercase tracking-[0.15em] font-medium text-[#1a2a44] mb-2 block">{item.cat}</span>
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
        window.dispatchEvent(new CustomEvent('caxton:openArticle', { detail: item }));
      }
    };
    return (
      <button
        type="button"
        onClick={onTap}
        className="block w-full text-left px-4 py-5 hover:bg-gray-50 transition-colors"
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
  return (
    <div className="px-6 py-16 text-center bg-white border-b border-gray-200">
      <p className="text-gray-700 text-lg font-medium mb-1">
        {cat === 'All' ? 'No articles available right now.' : `No articles tagged ${cat} yet.`}
      </p>
      <p className="text-gray-500 text-sm font-light">
        {cat === 'All' ? 'Check back soon.' : 'Check back soon, or try another category.'}
      </p>
    </div>
  );
}


// caxton-events-frontend-v1-components
// ─────────────────────────────────────────────────────────────────────────
// Events feature: full-screen list page + detail page + supporting helpers
// ─────────────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: number;
  title: string;
  description: string;
  link: string;
  publication: 'austin' | 'san_antonio';
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  organizer: string | null;
  organizerEmail: string | null;
  website: string | null;
  tags: string | null;
  format: string | null;
  courseNumber: string | null;
  memberPrice: string | null;
  nonmemberPrice: string | null;
  imageUrl: string | null;
  imageThumb: string | null;
  instructor: string | null;
  instructorBio: string | null;
  lat: number | null;
  lng: number | null;
  // Sponsored support — populated from WP _event_sponsored, _event_sponsor_tier, _event_sponsor_advertiser
  sponsored?: string;        // "1" or "" from WP
  sponsor_tier?: string;     // "standard" | "featured" | "hero"
  sponsor_advertiser?: string;
}

const PUB_META: Record<string, { name: string; city: string; color: string }> = {
  realtyline: { name: 'RealtyLine', city: 'Austin', color: '#021D40' },
  newsline: { name: 'Newsline San Antonio', city: 'San Antonio', color: '#3D0740' },
};

const CAXTON_EV_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CAXTON_EV_MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function decodeEntities(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&#038;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8217;/g, "’")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

function isSponsored(ev: CalendarEvent): boolean {
  return ev.sponsored === '1' || ev.sponsored === 'true' || ev.sponsored === 'yes';
}

function formatEventDateLong(iso: string | null): string {
  if (!iso) return 'Date TBD';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${CAXTON_EV_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatEventTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  let hr = d.getHours();
  const min = d.getMinutes();
  const ampm = hr >= 12 ? 'PM' : 'AM';
  hr = hr % 12 || 12;
  return min === 0 ? `${hr}:00 ${ampm}` : `${hr}:${String(min).padStart(2, '0')} ${ampm}`;
}

function formatEventTimeRange(start: string | null, end: string | null): string {
  if (!start) return '';
  const s = formatEventTime(start);
  if (!end) return s;
  const e = formatEventTime(end);
  if (!e || e === s) return s;
  return `${s} – ${e}`;
}

function monthKey(iso: string | null): string {
  if (!iso) return 'TBD';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'TBD';
  return `${CAXTON_EV_MONTHS[d.getMonth()].toUpperCase()} ${d.getFullYear()}`;
}

function dayOfMonth(iso: string | null): { mo: string; dy: string } {
  if (!iso) return { mo: 'TBD', dy: '?' };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { mo: 'TBD', dy: '?' };
  return { mo: CAXTON_EV_MONTHS_SHORT[d.getMonth()].toUpperCase(), dy: String(d.getDate()) };
}

// Group events by month-year for the list rendering.
// Drops expired events first (anything whose end date is before today's midnight).
function groupByMonth(events: CalendarEvent[]): Array<{ key: string; events: CalendarEvent[] }> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const liveEvents = events.filter((ev) => {
    const lastDay = new Date(ev.endDate || ev.startDate || '');
    return !isNaN(lastDay.getTime()) && lastDay >= todayStart;
  });
  const groups: Record<string, CalendarEvent[]> = {};
  const order: string[] = [];
  liveEvents.forEach((ev) => {
    const k = monthKey(ev.startDate);
    if (!(k in groups)) {
      groups[k] = [];
      order.push(k);
    }
    groups[k].push(ev);
  });
  return order.map((k) => ({ key: k, events: groups[k] }));
}

// ─────────────────────────────────────────────────────────────────────────
// EventsList — full-screen list page
// ─────────────────────────────────────────────────────────────────────────

interface EventsListProps {
  pub: string;
  events: CalendarEvent[] | null;
  loading: boolean;
  error: boolean;
  onBack: () => void;
  onSelect: (ev: CalendarEvent) => void;
}

function EventsList({ pub, events, loading, error, onBack, onSelect }: EventsListProps) {
  const info = PUB_META[pub] || PUB_META.realtyline;
  const list = events ?? [];
  const groups = groupByMonth(list);

  return (
    <div className="fixed inset-0 bg-white z-30 overflow-y-auto" style={SW}>
      {/* Header */}
      <div className="sticky top-0 bg-white z-10 border-b border-gray-200 px-3 py-3 flex items-center justify-between">
        <div className="flex items-center">
          <button onClick={onBack} aria-label="Back" className="text-gray-900 p-2 -ml-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <p className="text-sm uppercase tracking-[0.25em] text-gray-900 font-medium ml-2">Events</p>
        </div>
        <span className="text-xs uppercase tracking-[0.2em] text-gray-400 font-medium">{info.city}</span>
      </div>

      {/* Body */}
      <div className="pb-24">
        <CalendarTopBanner pub={pub} />
        {loading && (
          <div className="px-4 py-6">
            <EventSkeleton />
            <EventSkeleton />
            <EventSkeleton />
          </div>
        )}

        {!loading && error && list.length === 0 && (
          <div className="px-4 py-12 text-center">
            <p className="text-base text-gray-500 font-light">Couldn't load events. Showing a few examples instead.</p>
          </div>
        )}

        {!loading && !error && list.length === 0 && (
          <div className="px-4 py-16 text-center">
            <p className="text-base text-gray-400 font-light">No upcoming events in {info.city} yet.</p>
            <p className="text-sm text-gray-400 font-light mt-2">Check back soon.</p>
          </div>
        )}

        {!loading && groups.map((group) => (
          <div key={group.key}>
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-semibold">{group.key}</p>
            </div>
            {group.events.map((ev) => (
              <EventCard key={ev.id} event={ev} pubColor={info.color} onClick={() => { trackEvent('event_card_clicked', { event_id: ev.id, event_title: ev.title, pub }); onSelect(ev); }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// EventCard — single row in the list
// ─────────────────────────────────────────────────────────────────────────

interface EventCardProps {
  event: CalendarEvent;
  pubColor: string;
  onClick: () => void;
}

function EventCard({ event, pubColor, onClick }: EventCardProps) {
  const { mo, dy } = dayOfMonth(event.startDate);
  const sponsored = isSponsored(event);
  const tier = event.sponsor_tier || 'standard';
  const isHero = sponsored && tier === 'hero';

  return (
    <button
      onClick={onClick}
      className="w-full bg-white border-b border-gray-200 hover:bg-gray-50 text-left transition-colors"
      style={sponsored ? { borderLeft: `4px solid ${pubColor}` } : undefined}
    >
      <div className={`flex gap-4 ${isHero ? 'px-4 py-6' : 'px-4 py-5'}`}>
        {/* Date block */}
        <div
          className={`flex-shrink-0 ${isHero ? 'w-20 h-20' : 'w-16 h-16'} flex flex-col items-center justify-center rounded`}
          style={{ backgroundColor: pubColor }}
        >
          <span className="text-xs uppercase text-white/60 font-medium leading-none tracking-wider">{mo}</span>
          <span className={`${isHero ? 'text-3xl' : 'text-2xl'} font-medium text-white leading-none mt-1`}>{dy}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {sponsored && (
            <p className="text-xs uppercase tracking-[0.2em] font-semibold mb-1" style={{ color: pubColor }}>
              {event.sponsor_advertiser ? `Sponsored · ${event.sponsor_advertiser}` : 'Sponsored'}
            </p>
          )}
          <h3 className={`${isHero ? 'text-2xl' : 'text-xl'} text-gray-900 leading-snug mb-1 font-semibold`}>
            {decodeEntities(event.title)}
          </h3>
          {event.startDate && (
            <p className="text-base text-gray-500 font-light">{formatEventTimeRange(event.startDate, event.endDate)}</p>
          )}
          {event.location && (
            <p className="text-base text-gray-500 font-light">{event.location}</p>
          )}
          {event.organizer && (
            <p className="text-sm font-medium mt-2 uppercase tracking-wider" style={{ color: pubColor }}>
              {event.organizer}
            </p>
          )}
        </div>

      
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// EventSkeleton — loading placeholder
// ─────────────────────────────────────────────────────────────────────────

function EventSkeleton() {
  return (
    <div className="bg-white border-b border-gray-200 animate-pulse">
      <div className="px-4 py-5 flex gap-4">
        <div className="flex-shrink-0 w-16 h-16 rounded bg-gray-200" />
        <div className="flex-1 space-y-2">
          <div className="h-5 bg-gray-200 rounded w-3/4" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-4 bg-gray-200 rounded w-2/3" />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// EventDetail — full-screen detail page with WHEN/WHERE/etc + 4 actions
// ─────────────────────────────────────────────────────────────────────────

interface EventDetailProps {
  pub: string;
  event: CalendarEvent | null;
  onBack: () => void;
}

function EventDetail({ pub, event, onBack }: EventDetailProps) {
  const info = PUB_META[pub] || PUB_META.realtyline;
  if (!event) {
    return (
      <div className="fixed inset-0 bg-white z-30 flex items-center justify-center" style={SW}>
        <div className="text-center px-8">
          <p className="text-gray-500 mb-4">Event not found</p>
          <button onClick={onBack} className="text-sm uppercase tracking-wider font-medium" style={{ color: info.color }}>
            ← Back to events
          </button>
        </div>
      </div>
    );
  }

  const sponsored = isSponsored(event);
  const title = decodeEntities(event.title);
  const description = decodeEntities(event.description);

  // Action handlers
  const onAddToCalendar = () => {
    trackEvent('event_added_to_calendar', { event_id: event.id, pub });
    const ics = generateICS(event);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(event.title || 'event').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const onRegister = () => {
    if (!event.website) return;
    trackEvent('event_register_clicked', { event_id: event.id, event_title: event.title, website: event.website, pub });
    window.open(event.website, '_blank', 'noopener,noreferrer');
  };

  const onShare = async () => {
    const shareData = {
      title: title,
      text: title,
      url: event.link,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        trackEvent('event_shared', { event_id: event.id, channel: 'native', pub });
      } else {
        await navigator.clipboard.writeText(event.link);
        alert('Event link copied to clipboard');
        trackEvent('event_shared', { event_id: event.id, channel: 'copy', pub });
      }
    } catch (err) {
      // User cancelled or share failed
      console.log('[Share] cancelled or failed:', err);
    }
  };

  const onDirections = () => {
    if (!event.location) return;
    trackEvent('event_directions_clicked', { event_id: event.id, pub });
    const isApple = /iPhone|iPad|iPod|Mac/.test(navigator.userAgent);
    const q = encodeURIComponent(event.location);
    const url = isApple ? `https://maps.apple.com/?q=${q}` : `https://www.google.com/maps/search/?api=1&query=${q}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 bg-white z-30 overflow-y-auto" style={SW}>
      {/* Header */}
      <div className="sticky top-0 bg-white z-10 border-b border-gray-200 px-3 py-3 flex items-center justify-between">
        <div className="flex items-center">
          <button onClick={onBack} aria-label="Back" className="text-gray-900 p-2 -ml-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <p className="text-sm uppercase tracking-[0.25em] text-gray-900 font-medium ml-2">Events</p>
        </div>
        <span className="text-xs uppercase tracking-[0.2em] text-gray-400 font-medium">{info.city}</span>
      </div>

      {/* Featured image */}
      {event.imageUrl && (
        <div className="w-full bg-gray-100">
          <img src={event.imageUrl} alt="" className="w-full h-auto" />
        </div>
      )}

      <div className="px-5 pt-6 pb-32">
        {/* Sponsored tag */}
        {sponsored && (
          <p className="text-xs uppercase tracking-[0.2em] font-semibold mb-3" style={{ color: info.color }}>
            {event.sponsor_advertiser ? `Sponsored · ${event.sponsor_advertiser}` : 'Sponsored'}
          </p>
        )}

        {/* Title */}
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight leading-tight mb-2">
          {title}
        </h1>

        {/* Subtitle: date · time · location */}
        {(event.startDate || event.location) && (
          <p className="text-sm uppercase tracking-wider text-gray-500 font-medium mb-6">
            {[
              event.startDate ? formatEventDateLong(event.startDate) : null,
              event.startDate ? formatEventTimeRange(event.startDate, event.endDate) : null,
              event.location,
            ].filter(Boolean).join(' · ')}
          </p>
        )}

        {/* DESCRIPTION section */}
        {description && description.length > 0 && (
          <DetailSection label="Description">
            <p className="text-base text-gray-700 leading-relaxed font-light whitespace-pre-wrap">{description}</p>
          </DetailSection>
        )}

        {/* DATE section */}
        {event.startDate && (
          <DetailSection label="Date">
            <p className="text-base text-gray-900">{formatEventDateLong(event.startDate)}</p>
          </DetailSection>
        )}

        {/* TIME section */}
        {event.startDate && (
          <DetailSection label="Time">
            <p className="text-base text-gray-900">{formatEventTimeRange(event.startDate, event.endDate)}</p>
          </DetailSection>
        )}

        {/* WHERE section */}
        {event.location && (
          <DetailSection label="Where">
            <p className="text-base text-gray-900">{event.location}</p>
          </DetailSection>
        )}

        {/* ORGANIZER section */}
        {event.organizer && (
          <DetailSection label="Provider">
            <p className="text-base text-gray-900">{event.organizer}</p>
            {event.organizerEmail && (
              <a href={`mailto:${event.organizerEmail}`} className="text-sm text-gray-500 font-light underline">
                {event.organizerEmail}
              </a>
            )}
          </DetailSection>
        )}

        {/* COURSE INFO section */}
        {(event.courseNumber || event.format) && (
          <DetailSection label="Course Info">
            {event.format && <p className="text-base text-gray-900">{event.format}</p>}
            {event.courseNumber && <p className="text-sm text-gray-500 font-light">Course {event.courseNumber}</p>}
          </DetailSection>
        )}

        {/* PRICE section */}
        {(event.memberPrice || event.nonmemberPrice) && (
          <DetailSection label="Price">
            {event.memberPrice && (
              <p className="text-base text-gray-900"><span className="text-gray-500 text-sm font-light mr-2">Members</span>{event.memberPrice}</p>
            )}
            {event.nonmemberPrice && (
              <p className="text-base text-gray-900"><span className="text-gray-500 text-sm font-light mr-2">Non-members</span>{event.nonmemberPrice}</p>
            )}
          </DetailSection>
        )}

        {/* INSTRUCTOR section */}
        {(event.instructor || event.instructorBio || event.imageThumb) && (
          <DetailSection label="Instructor">
            <div className="flex items-start gap-3">
              {event.imageThumb && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={event.imageThumb}
                  alt={event.instructor || 'Instructor'}
                  className="w-16 h-16 rounded-full object-cover flex-shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                {event.instructor && <p className="text-base text-gray-900">{event.instructor}</p>}
                {event.instructorBio && (
                  <p className="text-sm text-gray-700 font-light leading-relaxed whitespace-pre-wrap mt-2">
                    {event.instructorBio}
                  </p>
                )}
              </div>
            </div>
          </DetailSection>
        )}

        {/* TAGS */}
        {event.tags && (
          <DetailSection label="Tags">
            <p className="text-sm text-gray-500 font-light">{event.tags}</p>
          </DetailSection>
        )}
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-2 z-20" style={SW}>
        {event.website && (
          <button
            onClick={onRegister}
            className="w-full py-3 text-white text-sm font-semibold uppercase tracking-wider rounded-md"
            style={{ backgroundColor: info.color }}
          >
            Register
          </button>
        )}
        {/* Floating action pill — Map / Calendar / Share, matches article reader aesthetic */}
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
          <div className="pointer-events-auto flex items-stretch gap-1 bg-black/85 backdrop-blur-md rounded-md px-2 py-1.5 shadow-lg">
            {event.location && (
              <button onClick={onDirections} aria-label="Directions" className="flex flex-col items-center justify-center min-w-[60px] px-2 py-1.5 rounded-md transition-colors text-white/85 hover:text-white active:bg-white/10">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <span className="text-[10px] uppercase tracking-wider mt-0.5 font-medium">Map</span>
              </button>
            )}
            <button onClick={onAddToCalendar} aria-label="Add to calendar" className="flex flex-col items-center justify-center min-w-[60px] px-2 py-1.5 rounded-md transition-colors text-white/85 hover:text-white active:bg-white/10">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>
              <span className="text-[10px] uppercase tracking-wider mt-0.5 font-medium">Calendar</span>
            </button>
            <button onClick={onShare} aria-label="Share" className="flex flex-col items-center justify-center min-w-[60px] px-2 py-1.5 rounded-md transition-colors text-white/85 hover:text-white active:bg-white/10">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
              <span className="text-[10px] uppercase tracking-wider mt-0.5 font-medium">Share</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// DetailSection — labeled section with thin divider (TM-inspired)
// ─────────────────────────────────────────────────────────────────────────

function DetailSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-semibold mb-2">{label}</p>
      <div className="border-t border-gray-300 pt-3">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// generateICS — build an iCalendar (.ics) text from a CalendarEvent
// ─────────────────────────────────────────────────────────────────────────

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function isoToICS(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  // Format: YYYYMMDDTHHMMSS (local time, no Z)
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

function escapeICS(s: string): string {
  return (s || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function generateICS(event: CalendarEvent): string {
  const dtstart = isoToICS(event.startDate);
  const dtend = isoToICS(event.endDate || event.startDate);
  const uid = `event-${event.id}@caxton`;
  const now = isoToICS(new Date().toISOString().replace('Z', ''));
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Caxton Publications, Inc.//Realtor App//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    dtstart ? `DTSTART:${dtstart}` : '',
    dtend ? `DTEND:${dtend}` : '',
    `SUMMARY:${escapeICS(decodeEntities(event.title))}`,
    event.location ? `LOCATION:${escapeICS(event.location)}` : '',
    event.description ? `DESCRIPTION:${escapeICS(decodeEntities(event.description))}` : '',
    event.link ? `URL:${event.link}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.join('\r\n');
}

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

const PUB_META_AR: Record<string, { name: string; city: string; color: string; tagline: string; reach: string; email: string }> = {
  realtyline: {
    name: 'RealtyLine',
    city: 'Austin',
    color: '#021D40',
    tagline: 'Reach 71,000+ Texas real estate professionals',
    reach: '71,000+ Texas REALTORS',
    email: 'ads@myrealtyline.com',
  },
  newsline: {
    name: 'Newsline San Antonio',
    city: 'San Antonio',
    color: '#3D0740',
    tagline: 'Reach 24,000+ San Antonio real estate professionals',
    reach: '24,000+ San Antonio REALTORS',
    email: 'ads@newslinesa.com',
  },
};

// CAXTON ADS — House ads rotate when slot is empty. To add a real campaign
// for a publication and slot, push to the appropriate array.
//
// Example real campaign:
//   ADS_RL.leaderboard.push({
//     id: 'heritage-may-2026',
//     image: 'https://cdn.example.com/ads/heritage-728x90.png',
//     alt: 'Heritage Title — closing services',
//     href: 'https://heritagetitle.com/?utm_source=realtorapp&utm_campaign=may2026',
//   });
type AdSlot = { id: string; image?: string; alt?: string; href?: string; headline?: string };
type AdInventory = { leaderboard: AdSlot[]; rectangle: AdSlot[]; popup: AdSlot[] };

const ADS_RL: AdInventory = { leaderboard: [], rectangle: [], popup: [] };
const ADS_NS: AdInventory = { leaderboard: [], rectangle: [], popup: [] };

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

// Per-session cache: key = `${slot}:${pub}`. First fetch picks one campaign at
// random (server-side via ORDER BY RANDOM). All subsequent renders of the same
// slot+pub return the cached choice. Survives until tab close.
const __adCache = new Map<string, AdSlot | null>();
const __adInflight = new Map<string, Promise<AdSlot | null>>();

async function fetchAd(slot: 'leaderboard' | 'rectangle' | 'popup' | 'feed_top' | 'calendar_top', pub: string): Promise<AdSlot | null> {
  const cacheKey = `${slot}:${pub}`;
  if (__adCache.has(cacheKey)) return __adCache.get(cacheKey) ?? null;
  const inflight = __adInflight.get(cacheKey);
  if (inflight) return inflight;
  const promise = (async () => {
    try {
      const r = await fetch(`${API}/ads/active?slot=${slot}&pub=${pub}`, { credentials: 'omit' });
      if (!r.ok) {
        __adCache.set(cacheKey, null);
        return null;
      }
      const data = await r.json();
      const ad = data?.ad ? (data.ad as AdSlot) : null;
      __adCache.set(cacheKey, ad);
      return ad;
    } catch {
      __adCache.set(cacheKey, null);
      return null;
    } finally {
      __adInflight.delete(cacheKey);
    }
  })();
  __adInflight.set(cacheKey, promise);
  return promise;
}

function useAd(slot: 'leaderboard' | 'rectangle' | 'popup' | 'feed_top' | 'calendar_top', pub: string, _key: string): AdSlot {
  const cacheKey = `${slot}:${pub}`;
  const cached = __adCache.get(cacheKey);
  const [ad, setAd] = useState<AdSlot>(cached || { id: 'house', headline: 'house-ad' });
  useEffect(() => {
    let cancelled = false;
    fetchAd(slot, pub).then((result) => {
      if (cancelled) return;
      if (result) setAd(result);
    });
    return () => { cancelled = true; };
  }, [slot, pub]);
  return ad;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

// ─────────────────────────────────────────────────────────────────────────
// HouseAd — fallback rendered when an ad slot has no real campaign loaded
// ─────────────────────────────────────────────────────────────────────────

function HouseAd({ slot, pub }: { slot: 'leaderboard' | 'rectangle' | 'popup'; pub: string }) {
  const info = PUB_META_AR[pub] || PUB_META_AR.realtyline;
  const headline = slot === 'leaderboard' ? 'Get featured here' : 'Advertise in ' + info.name;
  const sub = `Reach ${info.reach}`;
  const isRect = slot === 'rectangle';
  const isPopup = slot === 'popup';
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        isRect ? 'py-8 px-4' : isPopup ? 'p-3' : 'py-3 px-4'
      }`}
      style={{ backgroundColor: info.color, color: 'white' }}
    >
      <p className={`uppercase tracking-[0.2em] font-bold ${isRect ? 'text-2xl mb-2' : 'text-sm mb-1'}`}>
        {headline}
      </p>
      <p className={`font-light ${isRect ? 'text-base mb-3' : 'text-xs mb-1'}`} style={{ opacity: 0.9 }}>
        {sub}
      </p>
      <a
        href={`mailto:${info.email}?subject=Advertise%20in%20${encodeURIComponent(info.name)}`}
        className={`inline-block underline font-medium ${isRect ? 'text-sm' : 'text-xs'}`}
      >
        {info.email}
      </a>
    </div>
  );
}

function FeedTopBanner({ pub }: { pub: string }) {
  const ad = useAd('feed_top' as any, pub, 'feed');
  if (!ad?.image || !ad?.href) return null;
  return (
    <div className="bg-white border-b border-gray-200">
      <p className="text-[10px] uppercase tracking-[0.3em] text-gray-400 text-center pt-3 pb-2 font-medium">
        Advertisement
      </p>
      <div className="pb-3 px-4">
        <a href={ad.href} target="_blank" rel="noopener noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ad.image} alt={ad.alt || ''} className="w-full h-auto" />
        </a>
      </div>
    </div>
  );
}

function CalendarTopBanner({ pub }: { pub: string }) {
  const ad = useAd('calendar_top' as any, pub, 'calendar');
  if (!ad?.image || !ad?.href) return null;
  return (
    <div className="bg-white border-b border-gray-200">
      <p className="text-[10px] uppercase tracking-[0.3em] text-gray-400 text-center pt-3 pb-2 font-medium">
        Advertisement
      </p>
      <div className="pb-3 px-4">
        <a href={ad.href} target="_blank" rel="noopener noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ad.image} alt={ad.alt || ''} className="w-full h-auto" />
        </a>
      </div>
    </div>
  );
}

function AdLeaderboard({ pub, articleId }: { pub: string; articleId: string }) {
  const ad = useAd('leaderboard', pub, articleId);
  return (
    <div className="my-6 -mx-5">
      <p className="text-[10px] uppercase tracking-[0.3em] text-gray-400 text-center mb-2 font-medium">
        Advertisement
      </p>
      {ad.image && ad.href ? (
        <a href={ad.href} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ad.image} alt={ad.alt || ''} className="w-full h-auto" />
        </a>
      ) : (
        <HouseAd slot="leaderboard" pub={pub} />
      )}
    </div>
  );
}

function AdRectangle({ pub, articleId, idx }: { pub: string; articleId: string; idx: number }) {
  const ad = useAd('rectangle', pub, articleId + ':' + idx);
  return (
    <div className="my-8">
      <div className="border-t border-gray-200 pt-4">
        <p className="text-[10px] uppercase tracking-[0.3em] text-gray-400 text-center mb-3 font-medium">
          Advertisement
        </p>
        {ad.image && ad.href ? (
          <a href={ad.href} target="_blank" rel="noopener noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ad.image} alt={ad.alt || ''} className="w-full h-auto" />
          </a>
        ) : (
          <HouseAd slot="rectangle" pub={pub} />
        )}
        <div className="border-t border-gray-200 mt-4" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// AdPopup — bottom-right corner, dismissable, session-remembered
// ─────────────────────────────────────────────────────────────────────────

function AdPopup({ pub, articleId }: { pub: string; articleId: string }) {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem('caxton_popup_dismissed') === '1') {
      setDismissed(true);
      return;
    }
    const t = setTimeout(() => setShow(true), 4000);
    return () => clearTimeout(t);
  }, []);

  const ad = useAd('popup', pub, articleId);

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
      className="fixed bottom-20 right-4 z-50 w-72 shadow-2xl rounded-lg overflow-hidden"
      style={{ animation: 'slideInRight 0.3s ease-out' }}
    >
      <button
        onClick={onClose}
        className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center z-10"
        aria-label="Dismiss ad"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6L6 18"/><path d="M6 6l12 12"/>
        </svg>
      </button>
      {ad.image && ad.href ? (
        <a href={ad.href} target="_blank" rel="noopener noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ad.image} alt={ad.alt || ''} className="w-full h-auto" />
        </a>
      ) : (
        <HouseAd slot="popup" pub={pub} />
      )}
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
  const url = article?.link || (typeof window !== 'undefined' ? window.location.href : '');
  const title = article?.head || article?.title || '';
  const enc = (s: string) => encodeURIComponent(s);

  const onShareNative = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        trackEvent('article_shared', { article_id: article?.id, channel: 'native_sharerow' });
      } else {
        await navigator.clipboard.writeText(url);
        trackEvent('article_shared', { article_id: article?.id, channel: 'copy_fallback' });
        onCopied();
      }
    } catch {
      // user cancelled, ignore
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
      <p className="text-xs uppercase tracking-[0.25em] font-semibold text-gray-500 mb-5">Read Next</p>
      <ul className="space-y-4">
        {others.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => {
                trackEvent('article_related_clicked', { from_article_id: currentId, to_article_id: a.id });
                if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
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

function ArticleActionBar({ saved, onBack, onSaveToggle, onShare, onMagazine, onLatest }: { article: any; pubColor: string; saved: boolean; onBack: () => void; onSaveToggle: () => void; onShare: () => void; onCopy: () => void; onMagazine?: () => void; onLatest?: () => void }) {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
      <div className="pointer-events-auto flex items-stretch gap-1 bg-black/85 backdrop-blur-md rounded-md px-2 py-1.5 shadow-lg">
        <ActionPillButton onClick={onBack} label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </ActionPillButton>
        <ActionPillButton onClick={onSaveToggle} label={saved ? 'Saved' : 'Save'} active={saved}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </ActionPillButton>
        <ActionPillButton onClick={onMagazine} label="Magazine">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
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
  const info = PUB_META_AR[pub] || PUB_META_AR.realtyline;
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // useSwipeBack must be called unconditionally, before any early returns,
  // to satisfy React's Rules of Hooks (otherwise hook count varies across
  // renders when `article` toggles null/non-null, throwing React #310).
  const { ref: swipeRef, style: swipeStyle } = useSwipeBack({ onBack });

  // Restore saved state from sessionStorage (placeholder until B2b adds backend)
  useEffect(() => {
    if (!article || typeof window === 'undefined') return;
    const key = `caxton_saved_${article.id}`;
    setSaved(sessionStorage.getItem(key) === '1');
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
      trackEvent('article_unsaved', { article_id: article.id, pub });
    } else {
      sessionStorage.setItem(key, '1');
      setSaved(true);
      flashToast('Saved (this session)');
      trackEvent('article_saved', { article_id: article.id, pub });
    }
  };

  const onShare = async () => {
    if (!article) return;
    const url = article.link;
    const title = article.head || article.title || '';
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        trackEvent('article_shared', { article_id: article.id, channel: 'native', pub });
      } else {
        await navigator.clipboard.writeText(url);
        flashToast('Link copied');
        trackEvent('article_shared', { article_id: article.id, channel: 'copy', pub });
      }
    } catch {}
  };

  const onCopy = async () => {
    if (!article) return;
    try {
      await navigator.clipboard.writeText(article.link || '');
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
  const dek = decodeHtmlEntities(article.excerpt || article.sum || '');
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


      {/* Featured image */}
      {article.imageUrl && (
        <div className="w-full bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={article.imageUrl} alt="" className="w-full h-auto" />
        </div>
      )}

      <div className="px-5 pt-6 pb-44 max-w-2xl mx-auto">
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
                className="w-10 h-10 rounded-full bg-gray-100 flex-shrink-0"
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
        onMagazine={() => { trackEvent('article_magazine_pill_clicked', { article_id: article.id, pub }); window.dispatchEvent(new CustomEvent('caxton:nav', { detail: 'magazines' })); }}
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
          color: #1f2937;
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

// caxton-magazine-phase-b1
// Standalone phase component that wraps the carousel with a back button and
// brand color. Batch 2 will swap the alert() for a real MagazineReader modal.
function MagazinePhase({ pub, onBack, onOpenArticle }: { pub: string; onBack: () => void; onOpenArticle: (a: any) => void }) {
  const info = PUBS.find((p) => p.id === pub) || PUBS[0];
  const [openMag, setOpenMag] = useStateForMag<Magazine | null>(null);
  const [currentMag, setCurrentMag] = useStateForMag<Magazine | null>(null);
  const [autoOpenLatest, setAutoOpenLatest] = useStateForMag<boolean>(false);
  // Listen for the Latest Issue footer button.
  useEffectForMag(() => {
    const handler = () => setAutoOpenLatest(true);
    window.addEventListener('caxton:openLatestMagazine', handler);
    return () => window.removeEventListener('caxton:openLatestMagazine', handler);
  }, []);
  // When auto-open is requested AND the current magazine loads, open it.
  useEffectForMag(() => {
    if (autoOpenLatest && currentMag) {
      setOpenMag(currentMag);
      setAutoOpenLatest(false);
    }
  }, [autoOpenLatest, currentMag]);
  return (
    <div className="min-h-screen bg-white" style={{ paddingBottom: 96 }}>
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-3 py-3 flex items-center justify-between">
        <div className="flex items-center">
          <button onClick={onBack} aria-label="Back" className="text-gray-900 p-2 -ml-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <p className="text-sm uppercase tracking-[0.25em] text-gray-900 font-medium ml-2">Magazine</p>
        </div>
        <span className="text-xs uppercase tracking-[0.2em] text-gray-400 font-medium">{info.city}</span>
      </div>
      <MagazineCarousel
        publication={pub}
        brandColor={info.color}
        onOpen={(m: Magazine) => { trackEvent('magazine_cover_opened', { magazine_id: m.id, issue_label: m.issue_label, publication: m.publication }); setOpenMag(m); }}
        onMagazinesLoaded={(mags: Magazine[]) => { if (mags.length > 0) setCurrentMag(mags[0]); }}
      />
      {currentMag && (
        <MagazineFeatured
          magazine={currentMag}
          brandColor={info.color}
          onOpenMagazine={() => setOpenMag(currentMag)}
          onOpenArticle={onOpenArticle}
        />
      )}
      {openMag && (
        <MagazineReader
          magazine={openMag}
          brandColor={info.color}
          onClose={() => setOpenMag(null)}
        />
      )}
    </div>
  );
}

