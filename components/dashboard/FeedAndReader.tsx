'use client';

/* eslint-disable @typescript-eslint/no-explicit-any -- TODO(S18-lint-debt): retype dashboard properly. 34 `any` types remain pending a proper types pass. */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { trackEvent, identifyUser } from "@/app/posthog-provider";
import { useSwipeBack } from '@/hooks/use-swipe-back';
const ProfilePanel = dynamic(() => import('@/components/ProfilePanel'));
import { getApiBase } from '@/lib/api-base';
import { DashboardHero } from '@/components/dashboard/DashboardHero';
const NewsletterCTA = dynamic(() => import('@/components/NewsletterCTA'));
const SaborReportCard = dynamic(() => import('@/components/SaborReportCard'));
const DallasPreviewHome = dynamic(() => import('@/components/DallasPreviewHome'));
const RealtyLineReportCard = dynamic(() => import('@/components/RealtyLineReportCard'));
import NotifyMeModal from '@/components/dashboard/NotifyMeModal';
import { SW } from '@/lib/style-constants';
import { PUB_META, type PubKey, isPreLaunchPub, isPubKey } from '@/lib/pub-meta';
import { PreLaunchEmptyState } from '@/components/PreLaunchEmptyState';
import { AdSlot as AdSlotComponent } from '@/components/ads/AdSlot';
import { COMING_SOON_PUBS, type ComingSoonPubId } from '@/lib/coming-soon-pubs';
import { share as nativeShare } from '@/lib/native/share';
import { haptics } from '@/lib/native/haptics';
import { openExternal } from '@/lib/native/external-link';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
const MarketSwitcherSheet = dynamic(() => import('@/components/MarketSwitcherSheet'));
import TrendingTicker from '@/components/feed/TrendingTicker';
import ArticleFeedCardBody from '@/components/ArticleFeedCardBody';
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
    return `${base}news/${encodeURIComponent(String(id))}`;
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

export function Feed({ pub, user, onSwitch, newsRefreshNonce, onRefresh }: { pub: string; user: any; onSwitch: (id: string) => void; newsRefreshNonce: number; onRefresh: () => void }) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- pre-existing, unrelated to this change
  const [tab, setTab] = useState('n');

  // Pull-to-refresh on touch devices. Active when scrolled to top and on
  // any tab — strategy varies by tab (see below).
  const router = useRouter();
  // PTR is tab-aware. News tab bumps newsRefreshNonce so the /news effect
  // re-fetches. Events tab triggers a router.refresh() so the route's
  // server logic re-runs (no client-side events fetch today, but this keeps
  // the gesture useful and forward-compatible).
  const ptr = usePullToRefresh(async () => {
    // Haptics handled inside usePullToRefresh now — don't double-fire.
    if (tab === 'n') {
      onRefresh();
    } else if (tab === 'e') {
      router.refresh();
    } else {
      router.refresh();
    }
  });

  // Read saved cat synchronously on mount so the first client paint shows
  // the correct pill (no 'All' → 'Social' flash). On the server this falls
  // back to 'All' since there's no window; the client may then re-render
  // with the saved value — React tolerates this since the difference is
  // inside our component's state, not the rendered HTML.
  const initialCat = (() => {
    // Always default to 'All' on feed mount. Saved category is ignored so
    // every sign-in / navigation to feed starts fresh.
    return 'All';
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional sync of cat to current pub on pub change
      setCatState('All');
    } catch {}
  }, [pub]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [marketDrawerOpen, setMarketDrawerOpen] = useState(false);
  const [marketNotifyFor, setMarketNotifyFor] = useState<{ id: ComingSoonPubId; name: string } | null>(null);

  // iOS HIG: surface the Notify-Me bottom sheet when MarketSwitcherSheet
  // (mounted from any page via the header title-as-switcher) sent the
  // user to /?notify=<id>. Strips the query so a refresh doesn't reopen.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    queueMicrotask(() => {
      try {
        const params = new URLSearchParams(window.location.search);
        const id = params.get('notify');
        if (!id) return;
        const meta = COMING_SOON_PUBS.find((p) => p.id === id);
        if (meta) {
          setMarketNotifyFor({ id: meta.id, name: meta.name });
          trackEvent('coming_soon_market_click', { market: meta.id, via: 'url' });
        }
        const url = new URL(window.location.href);
        url.searchParams.delete('notify');
        window.history.replaceState(null, '', url.toString());
      } catch {}
    });
  }, []);

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
  // Private Dallas/Ft. Worth preview (AppShell only lets allowlisted accounts
  // select it). No Dallas article feed yet, so it gets its own home.
  const isDallasPreview = pub === 'realtyline-dallas';
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
    // Always request the latest merged article payload. WordPress itself is
    // cached server-side, while local admin overrides must appear immediately.
    fetch(`${API}/news/${market}?fields=list`, { cache: 'no-store' })
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
  const market = pub === 'realtyline' ? 'austin' : 'san_antonio';
  const marketCategories = articleCategoriesForPublication(market);
  // Include any approved category used by this market, even if it is not in
  // the usual market-specific pill set (for example an RRC story in Austin).
  const CATS = ['All', ...marketCategories, ...ARTICLE_CATEGORIES.filter((category) =>
    !marketCategories.includes(category) && NEWS.some((article) =>
      canonicalArticleCategory(article.cat || '', market) === category))];
  const filt = cat === 'All' ? NEWS : NEWS.filter((article) =>
    canonicalArticleCategory(article.cat || '', market) === cat);

  // Month-by-month feed: show this month's articles first, then a Show More
  // button reveals the next older month instead of an endless scroll.
  const [nowMonth] = useState(() => { const d = new Date(); return d.getFullYear() * 12 + d.getMonth(); });
  const [feedMonths, setFeedMonths] = useState<{ key: string; n: number }>({ key: '', n: 1 });
  const feedKey = `${pub}|${cat}`;
  const monthsShown = feedMonths.key === feedKey ? feedMonths.n : 1;
  const articleMonth = (article: any): number => {
    const d = new Date(article?.publishedAt || article?.dateIso || '');
    return Number.isNaN(d.getTime()) ? nowMonth : d.getFullYear() * 12 + d.getMonth();
  };
  const monthCutoff = nowMonth - (monthsShown - 1);
  let visibleNews = filt.filter((article) => articleMonth(article) >= monthCutoff);
  if (visibleNews.length < 5) visibleNews = filt.slice(0, Math.max(5, visibleNews.length));
  const nextOlderArticle = filt.find((article) => !visibleNews.includes(article));
  const showMoreNews = () => {
    if (!nextOlderArticle) return;
    void haptics.selection();
    setFeedMonths({ key: feedKey, n: Math.max(monthsShown + 1, nowMonth - articleMonth(nextOlderArticle) + 1) });
  };

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
  // Always-pin: SABOR report stays at the top of the Newsline SA feed
  // for the lifetime of the latest published report. Auto-swaps on new release.
  const showSaborHero = saborEligible && saborReleasedAt !== undefined;
  const showSaborInline = false;

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
  // Always-pin: RealtyLine MLS report stays at top of RealtyLine Austin feed.
  const showRealtylineHero = realtylineEligible && realtylineReleasedAt !== undefined;
  const showRealtylineInline = false;

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

    visibleNews.forEach((item, i) => {
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
    // In-app browser on iOS — advertisers' destination pages should not
    // hard-eject users into Safari.
    void openExternal(ad.url);
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
      {/* Redundant "Welcome, {user} / Select Your Market" banner removed —
          the AppShell header now handles title-as-switcher with the same
          MarketSwitcherSheet, per iOS HIG dedupe pass. */}
      {!showPreLaunch && (
        <DashboardHero pub={pub as "realtyline" | "newsline" | "realtyline-dallas" | "realtyline-houston"} />
      )}
      {user?.guest && (
        <div className="px-4 py-3 bg-[#FEF8CC] border-b border-[#FAD800]/30 flex items-center justify-between">
          <p className="text-sm text-[#645600] font-light">Browsing as Guest</p>
          <button onClick={() => window.location.reload()} className="text-sm text-[#645600] font-medium underline">Sign In</button>
        </div>
      )}
      {tab === 'n' && showPreLaunch && pubKey && (
        <PreLaunchEmptyState pub={pubKey} surface="news" />
      )}
      {tab === 'n' && isDallasPreview && <DallasPreviewHome surface="news" />}
      {tab === 'n' && !showPreLaunch && !isDallasPreview && (
        <div>
          <FeedTopBanner pub={pub} />
          <TrendingTicker market={pub as PubKey} className="mx-4 mt-3" />
          <div className="flex gap-2 overflow-x-auto px-4 py-3 bg-white border-b border-gray-200" style={{ scrollbarWidth: 'none' }}>
            {CATS.map((c) => (
              <button
                key={c}
                onClick={() => { void haptics.selection(); setCat(c); }}
                aria-pressed={cat === c}
                // BUG-16: add flex-shrink-0 so long category chips
                // don't get squeezed by sibling flex children and overflow the row.
                className={
                  cat === c
                    ? 'flex-shrink-0 whitespace-nowrap px-3 py-2 text-sm font-semibold border border-gray-900 bg-gray-900 text-white rounded-md transition-colors'
                    : 'flex-shrink-0 whitespace-nowrap px-3 py-2 text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:text-gray-900 rounded-md transition-colors'
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
            {!isLoadingFirstFetch && nextOlderArticle && (
              <div className="px-4 py-4 border-b border-gray-200">
                <button
                  type="button"
                  onClick={showMoreNews}
                  className="w-full py-3 text-base font-semibold uppercase tracking-wider border border-gray-900 text-gray-900 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Show More
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {tab === 'e' && showPreLaunch && pubKey && (
        <PreLaunchEmptyState pub={pubKey} surface="events" />
      )}
      {tab === 'e' && isDallasPreview && <DallasPreviewHome surface="events" />}
      {tab === 'e' && !showPreLaunch && !isDallasPreview && (
        <div>
          <div className="px-4 py-4 border-b border-gray-200">
            <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium">Upcoming in {info.city}</p>
          </div>
          {EVTS.map((ev) => {
            const mo = ev.date.split(' ')[0];
            const dy = (ev.date.split(' ')[1] || '').replace(',', '');
            return (
              <article key={ev.id} className="bg-white border-b border-gray-200">
                <div className="px-4 py-4 flex gap-4">
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
      {/* iOS HIG: market picker is the shared MarketSwitcherSheet now
          (used by AppShell header + onboarding too). Single source of
          truth — the old custom side-drawer was removed during the
          dedupe pass. Coming-soon picks route via the ?notify= URL
          query string and are caught by the effect above. */}
      <MarketSwitcherSheet
        open={marketDrawerOpen}
        currentPub={pub}
        onClose={() => setMarketDrawerOpen(false)}
      />
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
    <article ref={ref} className="bg-[#F6F3FB] border-b border-[#E6E5EC]">
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-full bg-white border border-[#7059A8] flex items-center justify-center">
            <span className="text-xs font-medium text-[#7059A8]">{initials}</span>
          </div>
          <span className="text-sm uppercase tracking-[0.2em] font-semibold text-[#42277C]">Sponsored</span>
          <span className="flex-1" />
          <span className="text-sm text-gray-500 italic font-light">{ad.page}</span>
        </div>
        <p className="text-base text-brand-700 font-medium mb-1">{ad.biz}</p>
        <h3 className="text-xl text-gray-900 leading-snug mb-2 font-semibold">{ad.tag}</h3>
        <p className="text-lg text-gray-500 leading-relaxed mb-4 font-light">{ad.desc}</p>
        <button onClick={() => onClick(ad)} className="w-full text-center py-3 text-base font-medium uppercase tracking-wider bg-brand-700 text-white">Connect Now</button>
      </div>
    </article>
  );
}

// NewsletterCTA was inlined here originally; extracted to
// components/NewsletterCTA.tsx so the same form can be used app-wide.
// See the import at the top of this file.


function ArticleCard({ item, pub }: { item: any; pub: string }) {
  const body = (
    <ArticleFeedCardBody category={item.cat} headline={item.head} summary={item.sum} date={item.time} imageUrl={item.imageUrl} />
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
        className="block w-full text-left px-4 py-4 hover:bg-gray-50 transition-colors rounded-md"
      >
        {body}
      </button>
    );
  }
  return <div className="px-4 py-4">{body}</div>;
}

function ArticleSkeleton() {
  return (
    <article className="bg-white border-b border-gray-200">
      <div className="px-4 py-4">
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
  /** Render as a normal page (window scroll, inside the site shell) instead of a fixed overlay. */
  asPage?: boolean;
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
    return normalizeArticleHtml(raw.trim());
  }
  return normalizeArticleHtml(cleaned);
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
// layout chrome (spacing and the dismissable popup shell).
// ─────────────────────────────────────────────────────────────────────────

// Publication is read by <AdSlotComponent> from localStorage.caxton_pub,
// so the ad wrappers below don't need pub or articleId props anymore.
// Props are kept on the function signatures only where call sites pass them.

function FeedTopBanner({}: { pub: string }) {
  return (
    <div className="bg-white border-b border-gray-200">
      <div className="py-3 px-4 max-w-3xl mx-auto">
        <AdSlotComponent slug="feed_top_banner" variant="bare" />
      </div>
    </div>
  );
}

function AdLeaderboard({}: { pub: string; articleId: string }) {
  return (
    <div className="my-6 -mx-5">
      <AdSlotComponent slug="article_top_leaderboard" variant="bare" />
    </div>
  );
}

function AdRectangle({}: { pub: string; articleId: string; idx: number }) {
  return (
    <div className="my-8">
      <div className="border-t border-gray-200 pt-4">
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
  const iconColor = "#1B1726";

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
      <p className="text-xs uppercase tracking-[0.2em] font-semibold text-gray-500 mb-4">Read Next</p>
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

function ArticleActionBar({ saved, onBack, onSaveToggle, onShare, onLatest, pubColor, variant = 'floating', autoHide = false, docked = false }: { variant?: 'floating' | 'inline'; autoHide?: boolean; docked?: boolean; article: any; pubColor: string; saved: boolean; onBack: () => void; onSaveToggle: () => void; onShare: () => void; onCopy: () => void; onLatest?: () => void }) {
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
  // Reading: slide the bar away while scrolling down so it never sits on top
  // of the article text; bring it back on any upward scroll or near the top.
  // In page mode the bar starts hidden (an inline copy sits under the byline)
  // and only floats back in when the reader scrolls up past the top section.
  const [hidden, setHidden] = useState(autoHide);
  useEffect(() => {
    if (variant === 'inline' || !autoHide) return;
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY;
      if (Math.abs(dy) < 8) return;
      setHidden(!(dy < 0 && y > 120));
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [variant, autoHide]);

  const pills = (
      <div className={docked ? "pointer-events-auto flex w-full items-stretch justify-around bg-white border-t border-gray-300 px-2 py-1" : "pointer-events-auto flex items-stretch gap-1 bg-black/85 backdrop-blur-md rounded-md px-2 py-2 shadow-lg"} style={docked ? { color: pubColor } : undefined}>
        <ActionPillButton docked={docked} onClick={onBack} label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </ActionPillButton>
        <ActionPillButton docked={docked} onClick={onSaveToggle} label={saved ? 'Saved' : 'Save'} active={saved}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </ActionPillButton>
        <ActionPillButton docked={docked} onClick={onLatest} label="Latest">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8M10 10h8"/></svg>
        </ActionPillButton>
        <ActionPillButton docked={docked} onClick={onShare} label="Share">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v13"/><path d="M16 6l-4-4-4 4"/><rect x="4" y="9" width="16" height="13" rx="2"/></svg>
        </ActionPillButton>
      </div>
  );
  if (variant === 'inline') return <div className="flex mb-6">{pills}</div>;
  if (docked) {
    // Full-width strip sitting directly on top of the mobile tab bar (about 72px).
    return (
      <div
        className="fixed left-0 right-0 z-[45]"
        style={{ bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' }}
      >
        {pills}
      </div>
    );
  }
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[60] pointer-events-none transition-all duration-200"
      style={{
        bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
        opacity: hidden ? 0 : 1,
        transform: hidden ? 'translate(-50%, 16px)' : 'translate(-50%, 0)',
        visibility: hidden ? 'hidden' : 'visible',
      }}
      aria-hidden={hidden}
    >
      {pills}
    </div>
  );
}

function ActionPillButton({ children, label, onClick, active, docked = false }: { children: React.ReactNode; label: string; onClick?: () => void; active?: boolean; docked?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`flex flex-col items-center justify-center px-2 py-2 rounded-md transition-colors ${docked ? 'flex-1 hover:bg-gray-50 active:bg-gray-100' : 'min-w-[60px] ' + (active ? 'text-white bg-white/15' : 'text-white/85 hover:text-white active:bg-white/10')}`}
    >
      {children}
      <span className="text-[10px] uppercase tracking-wider mt-0.5 font-medium">{label}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ArticleReader — the polished v2a top-level component
// ─────────────────────────────────────────────────────────────────────────

export function ArticleReader({ pub, article, allArticles, onBack, onLatest, onSelectArticle, asPage = false }: ArticleReaderProps) {
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
  const cleanedHtml = cleanArticleHtml(article.contentHtml || article.content || (article.excerpt ? `<p>${String(article.excerpt).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c))}</p>` : ""));
  const articleId = String(article.id || '');

  // Split body into 3 chunks for two mid-article rectangle ad slots.
  const chunks = splitHtmlIntoChunks(cleanedHtml, 3);
  const showMidAds = chunks.length >= 3;

  return (
    <div
      ref={swipeRef as React.Ref<HTMLDivElement>}
      className={asPage ? 'relative bg-white' : 'fixed inset-0 bg-white z-30 overflow-y-auto'}
      style={asPage ? undefined : { ...SW, ...swipeStyle }}
    >
      {/* Header (overlay mode only; page mode uses the site header) */}
      {!asPage && (
        <div className="sticky top-0 bg-white z-10 border-b border-gray-200">
          <div className="flex items-center justify-end px-4 py-4">
            <span className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium">{info.name}</span>
          </div>
        </div>
      )}


      {/* Featured article ad — shown before the editorial image so paid
          placement remains the first content unit beneath the app header. */}
      <div className={asPage ? "" : "px-4"}>
        <div className={asPage ? "max-w-3xl mx-auto px-4" : "max-w-2xl mx-auto"}>
          <AdLeaderboard pub={pub} articleId={articleId} />
        </div>
      </div>

      {/* Featured image — constrained to the same max-w-2xl column as the
          article body, so it doesn't stretch edge-to-edge on wide desktop
          windows (which also upscaled smaller source images and made them
          look blurry). max-h cap prevents very tall portraits from dominating. */}
      {article.imageUrl && (
        <div className="w-full bg-gray-100">
          <div className={asPage ? "max-w-3xl mx-auto px-4" : "max-w-2xl mx-auto"}>
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
      <div className={asPage ? "pt-8 pb-40" : "px-4 pt-6 pb-52"}>
        <div className={asPage ? "mx-auto flex max-w-3xl items-start px-4" : "mx-auto flex max-w-[1040px] items-start justify-center gap-8"}>
          <div className={asPage ? "w-full min-w-0 flex-1" : "w-full min-w-0 max-w-2xl"}>
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
                    className="w-20 h-20 rounded-full object-cover object-[center_20%] bg-gray-100 flex-shrink-0"
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
              <div className="mt-8 pt-6 border-t border-gray-200">
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

          {/* Desktop article-sidebar inventory. The bare variant preserves the
              uploaded creative's natural aspect ratio instead of stretching it
              to fill the rail. Hidden on mobile and tablet by design. */}
          <aside className={asPage ? "hidden" : "hidden w-[320px] shrink-0 lg:block"} aria-label="Article advertising partner">
            <div className="sticky top-24">
              <AdSlotComponent slug="article_sidebar_desktop" variant="bare" />
            </div>
          </aside>
        </div>
      </div>

      {/* Sticky action bar */}
      <ArticleActionBar
        docked={asPage}
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

    </div>
  );
}
