'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  Home,
  LayoutGrid,
  MapPin,
  Megaphone,
  Menu,
  MessageSquareQuote,
  Monitor,
  MoreHorizontal,
  Newspaper,
  RotateCcw,
  Share2,
  Smartphone,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { trackEvent } from '@/app/posthog-provider';

type TourStep = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
  tab: 'feed' | 'calendar' | 'builders' | 'issues' | 'partners' | 'more';
};

const STEPS: TourStep[] = [
  {
    id: 'issues',
    eyebrow: 'The publication, reimagined',
    title: 'Read every issue wherever business takes you',
    description:
      'Browse interactive digital editions with the familiar editorial experience of RealtyLine and Newsline.',
    points: ['Mobile-friendly issue library', 'Interactive publication pages', 'Easy access to current and past issues'],
    tab: 'issues',
  },
  {
    id: 'partners',
    eyebrow: 'A trusted local network',
    title: 'Connect with companies serving real estate professionals',
    description:
      'Discover builders, lenders, title companies, and service partners already active in your market.',
    points: ['Searchable partner directory', 'Detailed company profiles', 'Direct paths to websites and contacts'],
    tab: 'partners',
  },
  {
    id: 'advertising',
    eyebrow: 'Advertising opportunities',
    title: 'Reach real estate professionals across every channel',
    description:
      'Build a coordinated presence through the printed publications, digital placements, and the Realty News Now app.',
    points: ['Print and digital edition packages', 'High-visibility website placements', 'Native app and sponsored notification options'],
    tab: 'partners',
  },
  {
    id: 'calendar',
    eyebrow: 'Never miss what matters',
    title: 'A professional calendar built around the industry',
    description:
      'Find association meetings, education, networking, builder events, and important local dates in one place.',
    points: ['Browse by date and event type', 'Open full event details', 'Save relevant dates to your calendar'],
    tab: 'calendar',
  },
  {
    id: 'platinum',
    eyebrow: 'Platinum Tools',
    title: 'Turn everyday client service into a branded experience',
    description:
      'Use testimonial tools, calculators, quick references, and downloadable guides designed for REALTORS®.',
    points: ['Live testimonial collection and widgets', 'Custom-branded calculator sheets', 'Client-ready guides and references'],
    tab: 'more',
  },
  {
    id: 'feed',
    eyebrow: 'Your daily starting point',
    title: 'Local real estate news, organized for your market',
    description:
      'Open the app to a focused feed of market headlines, trending stories, and timely industry updates.',
    points: ['Market-specific coverage', 'Trending stories at a glance', 'A focused feed without the noise'],
    tab: 'feed',
  },
];

const STEP_BY_TAB: Record<TourStep['tab'], number> = {
  issues: 0,
  partners: 1,
  calendar: 3,
  more: 4,
  feed: 5,
  builders: 1,
};

function BrandMark({ inverse = false, compact = false }: { inverse?: boolean; compact?: boolean }) {
  return (
    <span className={`inline-flex items-center ${compact ? 'gap-1.5' : 'gap-2.5'}`}>
      <svg
        viewBox="0 0 40 40"
        width={compact ? 24 : 36}
        height={compact ? 24 : 36}
        role="img"
        aria-label="Realty News Now"
        className={inverse ? 'text-white' : 'text-brand-700'}
      >
        <rect x="2" y="2" width="36" height="36" rx="9" fill="currentColor" />
        <path d="M11 28V12h8.1c4.2 0 6.9 2.2 6.9 5.7 0 2.3-1.2 4.1-3.3 5l5 5.3h-5.2l-4.2-4.7h-2.8V28H11Zm4.5-8.3h3.2c1.8 0 2.8-.7 2.8-2s-1-2-2.8-2h-3.2v4Z" fill="white" />
      </svg>
      <span className="leading-none">
        <span className={`block font-bold tracking-tight ${compact ? 'text-[9px]' : 'text-sm'} ${inverse ? 'text-white' : 'text-brand-700'}`}>
          REALTY NEWS NOW
        </span>
      </span>
    </span>
  );
}

function FeedScreen() {
  return (
    <div className="space-y-3" data-tour-screen="feed">
      <div className="relative aspect-[16/7] overflow-hidden bg-[#f3eadb]">
        <Image
          src="/hero/austin-skyline.jpg"
          alt=""
          fill
          sizes="(max-width: 768px) 100vw, 640px"
          className="object-cover object-bottom"
          priority
        />
        <div className="absolute inset-x-0 top-0 p-4">
          <span className="rounded-full bg-white/90 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-brand-700 shadow-sm">
            Austin
          </span>
        </div>
      </div>
      <div className="mx-3 flex items-center gap-3 border border-orange-200 bg-orange-50 p-3 shadow-sm">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-orange-100 text-orange-700">
          <Sparkles size={17} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-orange-700">Trending</p>
          <p className="truncate text-xs font-semibold text-gray-900">
            Central Texas housing activity signals a strong week ahead
          </p>
        </div>
      </div>
      <div className="px-3">
        <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-gray-400">Top stories</p>
        <div className="grid grid-cols-[1.35fr_.9fr] gap-2">
          <div className="border border-gray-200 bg-white p-3">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-orange-700">Market News</span>
            <p className="mt-1.5 text-sm font-semibold leading-snug text-gray-900">
              What local REALTORS® should know this week
            </p>
            <p className="mt-2 text-[10px] leading-relaxed text-gray-500">A concise briefing built for your business day.</p>
          </div>
          <div className="flex min-h-28 flex-col justify-between bg-brand-700 p-3 text-white">
            <Newspaper size={20} strokeWidth={1.6} aria-hidden />
            <p className="text-[11px] font-semibold leading-snug">Industry news selected for your market</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CalendarScreen() {
  const fallbackEvents = [
    {
      id: 30416,
      title: 'ABoR: Appraisals Gone Wild: Taming the 3.6 Update',
      startDate: '2026-08-27T13:00:00.000Z',
      location: 'Grand Hyatt San Antonio River Walk',
    },
    {
      id: 18122,
      title: 'ABoR: Forewarn Training',
      startDate: '2026-08-27T18:00:00.000Z',
      location: 'Virtual',
    },
    {
      id: 529,
      title: 'Five Points: CTXMLS New Member Orientation',
      startDate: '2026-08-28T15:00:00.000Z',
      location: 'Virtual',
    },
  ];
  const [events, setEvents] = useState(fallbackEvents);

  useEffect(() => {
    let active = true;
    fetch('/api/events/austin', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('Calendar unavailable');
        return response.json() as Promise<{ events?: typeof fallbackEvents }>;
      })
      .then((payload) => {
        if (!active || !Array.isArray(payload.events)) return;
        const upcoming = payload.events
          .filter((event) => new Date(event.startDate).getTime() >= Date.now())
          .slice(0, 3);
        if (upcoming.length) setEvents(upcoming);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="px-3 py-4" data-tour-screen="calendar">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-gray-400">Industry calendar</p>
          <h3 className="mt-1 text-lg font-semibold text-gray-900">Upcoming in Austin</h3>
        </div>
        <span className="border border-gray-200 px-2.5 py-1.5 text-[10px] font-semibold text-gray-600">Live calendar</span>
      </div>
      <div className="mt-4 space-y-2">
        {events.map((event, index) => {
          const date = new Date(event.startDate);
          const dateLabel = new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            timeZone: 'America/Chicago',
          }).format(date);
          const timeLabel = new Intl.DateTimeFormat('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: 'America/Chicago',
          }).format(date);
          return (
          <div key={event.id} className="grid grid-cols-[76px_1fr] border border-gray-200 bg-white">
            <div className={`p-3 text-[9px] font-bold ${index === 0 ? 'bg-orange-50 text-orange-700' : 'bg-gray-50 text-gray-500'}`}>
              <span className="block uppercase">{dateLabel}</span>
              <span className="mt-1 block font-medium">{timeLabel}</span>
            </div>
            <div className="p-3">
              <p className="line-clamp-2 text-xs font-semibold text-gray-900">{event.title}</p>
              <p className="mt-1 flex items-center gap-1 text-[9px] text-gray-500">
                <MapPin size={10} className="shrink-0" aria-hidden />
                <span className="truncate">{event.location || 'Online event'}</span>
              </p>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

function BuildersScreen() {
  return (
    <div className="px-3 py-4" data-tour-screen="builders">
      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-gray-400">Local opportunity</p>
      <h3 className="mt-1 text-lg font-semibold text-gray-900">Builders & communities</h3>
      <div className="mt-3 flex gap-1.5 overflow-hidden">
        {['All areas', 'Quick move-in', 'Promotions'].map((label, index) => (
          <span
            key={label}
            className={`whitespace-nowrap px-2.5 py-1.5 text-[9px] font-semibold ${index === 0 ? 'bg-brand-700 text-white' : 'border border-gray-200 text-gray-500'}`}
          >
            {label}
          </span>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {[
          ['Hillside at Lake Travis', 'From the $500s', '12 homes available'],
          ['Lakeside Crossing', 'From the $400s', '8 homes available'],
          ['The Grove at Georgetown', 'From the $600s', '5 homes available'],
        ].map(([name, price, availability], index) => (
          <div key={name} className="flex gap-3 border border-gray-200 bg-white p-2.5">
            <div className={`flex h-14 w-16 shrink-0 items-center justify-center ${index === 1 ? 'bg-orange-50 text-orange-700' : 'bg-brand-50 text-brand-700'}`}>
              <Building2 size={22} strokeWidth={1.5} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-gray-900">{name}</p>
              <p className="mt-1 text-[10px] text-gray-500">{price}</p>
              <p className="mt-1 text-[9px] font-semibold text-orange-700">{availability}</p>
            </div>
            <ArrowRight size={14} className="self-center text-gray-300" aria-hidden />
          </div>
        ))}
      </div>
    </div>
  );
}

function IssuesScreen() {
  const publications = [
    {
      name: 'RealtyLine',
      market: 'Austin',
      current: '/product-tour/realtyline-august-2026.jpg',
    },
    {
      name: 'Newsline',
      market: 'San Antonio',
      current: '/product-tour/newsline-august-2026.jpg',
    },
  ];

  return (
    <div className="px-3 py-4" data-tour-screen="issues">
      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-gray-400">Digital editions</p>
      <h3 className="mt-1 text-lg font-semibold text-gray-900">Latest issues</h3>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {publications.map((publication) => (
          <div key={publication.name} className="border border-gray-200 bg-white p-2 shadow-sm">
            <div className="relative aspect-[720/804] overflow-hidden border border-gray-200 bg-[#f7f4ef]">
              <Image
                src={publication.current}
                alt={`${publication.name} August 2026 issue cover`}
                fill
                priority
                sizes="(max-width: 640px) 42vw, 260px"
                className="object-contain"
              />
            </div>
            <p className="mt-2 text-[10px] font-semibold text-gray-900">{publication.name}</p>
            <p className="text-[8px] uppercase tracking-[0.12em] text-gray-500">{publication.market} · August 2026</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-3">
        <span className="text-[10px] text-gray-500">Browse the complete archive</span>
        <span className="text-[10px] font-semibold text-brand-700">View all issues</span>
      </div>
    </div>
  );
}

function PartnersScreen() {
  const partners = [
    ['Independence Title', 'Title Services', '/product-tour/partner-independence-title.png'],
    ['Stewart Title', 'Title Services', '/product-tour/partner-stewart-title.png'],
    ['Austin Title', 'Title Services', '/product-tour/partner-austin-title.png'],
    ['KB Home', 'Homebuilder', '/product-tour/partner-kb-home.png'],
  ];

  return (
    <div className="px-3 py-4" data-tour-screen="partners">
      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-gray-400">Professional directory</p>
      <h3 className="mt-1 text-lg font-semibold text-gray-900">Local partners</h3>
      <div className="mt-3 flex items-center gap-2 border border-gray-200 bg-gray-50 px-3 py-2">
        <LayoutGrid size={14} className="text-gray-400" aria-hidden />
        <span className="text-[10px] text-gray-400">Search builders, lenders, title companies...</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {partners.map(([name, category, logo]) => (
          <div key={name} className="border border-gray-200 bg-white p-3">
            <div className="relative flex h-10 w-full items-center justify-center overflow-hidden bg-white">
              <Image src={logo} alt={`${name} logo`} fill sizes="180px" className="object-contain object-left" />
            </div>
            <p className="mt-3 text-[11px] font-semibold text-gray-900">{name}</p>
            <p className="mt-0.5 text-[9px] text-gray-500">{category}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdvertisingScreen() {
  const opportunities = [
    {
      Icon: Newspaper,
      label: 'Print',
      title: 'RealtyLine & Newsline editions',
      detail: 'Full, half, and quarter-page advertising',
    },
    {
      Icon: Monitor,
      label: 'Digital',
      title: 'Web, articles & e-Blasts',
      detail: 'Banners, sponsored cards, and email placements',
    },
    {
      Icon: Smartphone,
      label: 'App',
      title: 'High-visibility app placements',
      detail: 'Welcome screens, feed placements, and sponsored pushes',
    },
  ];

  return (
    <div className="px-3 py-4" data-tour-screen="advertising">
      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-orange-700">Advertising opportunities</p>
      <h3 className="mt-1 text-lg font-semibold text-gray-900">Print, digital & app</h3>
      <div className="mt-4 space-y-2">
        {opportunities.map(({ Icon, label, title, detail }, index) => (
          <div key={label} className={`flex gap-3 border p-3 ${index === 1 ? 'border-brand-200 bg-brand-50' : 'border-gray-200 bg-white'}`}>
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center ${index === 1 ? 'bg-brand-700 text-white' : 'bg-orange-50 text-orange-700'}`}>
              <Icon size={18} strokeWidth={1.8} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-gray-500">{label}</p>
              <p className="mt-0.5 text-xs font-semibold text-gray-900">{title}</p>
              <p className="mt-1 text-[9px] leading-relaxed text-gray-500">{detail}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between bg-brand-700 px-3 py-2.5 text-white">
        <span className="text-[9px] font-medium">Build a cross-channel campaign</span>
        <ArrowRight size={14} aria-hidden />
      </div>
    </div>
  );
}

function PlatinumScreen() {
  return (
    <div className="px-3 py-4" data-tour-screen="platinum">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-orange-700">Platinum Tools</p>
          <h3 className="mt-1 text-lg font-semibold text-gray-900">Build your reputation</h3>
        </div>
        <Star size={21} className="fill-orange-100 text-orange-600" aria-hidden />
      </div>
      <div className="mt-4 space-y-2">
        {[
          [MessageSquareQuote, 'Testimonials HUB', 'Collect, approve, publish, and embed client praise.'],
          [CircleDollarSign, 'Calculators & Quick References', 'Create client-ready sheets with your REALTOR® branding.'],
          [BookOpen, 'Downloadable Guides', 'Share polished resources that keep your name in front of clients.'],
        ].map(([Icon, title, body], index) => {
          const ToolIcon = Icon as typeof MessageSquareQuote;
          return (
            <div key={String(title)} className={`flex gap-3 border p-3 ${index === 0 ? 'border-brand-200 bg-brand-50' : 'border-gray-200 bg-white'}`}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center ${index === 0 ? 'bg-brand-700 text-white' : 'bg-orange-50 text-orange-700'}`}>
                <ToolIcon size={17} strokeWidth={1.8} aria-hidden />
              </span>
              <div>
                <p className="text-xs font-semibold text-gray-900">{String(title)}</p>
                <p className="mt-1 text-[9px] leading-relaxed text-gray-500">{String(body)}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2 bg-brand-700 px-3 py-2.5 text-white">
        <Check size={14} aria-hidden />
        <p className="text-[9px] font-medium">Tools designed for real client conversations</p>
      </div>
    </div>
  );
}

function MockScreen({ step }: { step: TourStep }) {
  if (step.id === 'calendar') return <CalendarScreen />;
  if (step.id === 'builders') return <BuildersScreen />;
  if (step.id === 'issues') return <IssuesScreen />;
  if (step.id === 'partners') return <PartnersScreen />;
  if (step.id === 'advertising') return <AdvertisingScreen />;
  if (step.id === 'platinum') return <PlatinumScreen />;
  return <FeedScreen />;
}

function AppPreview({
  step,
  onSelectTab,
}: {
  step: TourStep;
  onSelectTab: (tab: TourStep['tab']) => void;
}) {
  const tabs: Array<[TourStep['tab'], string, typeof Home]> = [
    ['issues', 'Issues', BookOpen],
    ['partners', 'Partners', Megaphone],
    ['calendar', 'Calendar', CalendarDays],
    ['more', 'Tools', MoreHorizontal],
    ['feed', 'Feed', Home],
  ];
  return (
    <div className="relative mx-auto w-full max-w-[620px]">
      <div className="pointer-events-none absolute -inset-4 border border-brand-100 bg-white/45 sm:-inset-7" aria-hidden />
      <div className="relative overflow-hidden border border-gray-300 bg-white shadow-[0_24px_70px_rgba(48,29,93,0.18)]">
        <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2.5">
          <button type="button" aria-label="Preview menu" onClick={() => onSelectTab('more')} className="p-1 text-gray-500">
            <Menu size={17} aria-hidden />
          </button>
          <button type="button" onClick={() => onSelectTab('feed')} className="flex items-center gap-1 leading-none">
            <BrandMark compact />
            <ChevronDown size={10} className="text-gray-400" aria-hidden />
          </button>
          <span className="h-6 w-6" aria-hidden />
        </div>
        <div
          key={step.id}
          className="min-h-[345px] bg-[#fbfaf8] motion-safe:animate-[tourFade_.28s_cubic-bezier(0.16,1,0.3,1)] sm:min-h-[410px]"
        >
          <MockScreen step={step} />
        </div>
        <nav aria-label="Demo app navigation" className="grid grid-cols-5 border-t border-gray-200 bg-white px-1 py-2">
          {tabs.map(([id, label, Icon]) => {
            const active = step.tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelectTab(id)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-11 flex-col items-center justify-center gap-0.5 text-[7px] font-semibold uppercase tracking-tight transition-colors ${
                  active ? 'text-brand-700' : 'text-gray-400 hover:text-gray-700'
                }`}
              >
                <Icon size={16} strokeWidth={active ? 2.2 : 1.7} aria-hidden />
                <span className="max-w-full truncate">{label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

export default function ProductTourClient() {
  const [index, setIndex] = useState(0);
  const [complete, setComplete] = useState(false);
  const [copied, setCopied] = useState(false);
  const announcedRef = useRef<HTMLParagraphElement>(null);
  const step = STEPS[index];

  const selectStep = useCallback((nextIndex: number, source = 'controls') => {
    const safe = Math.min(Math.max(nextIndex, 0), STEPS.length - 1);
    setComplete(false);
    setIndex(safe);
    trackEvent('product_tour_step_viewed', {
      step_id: STEPS[safe].id,
      step_number: safe + 1,
      source,
    });
  }, []);

  const next = useCallback(() => {
    if (index === STEPS.length - 1) {
      setComplete(true);
      trackEvent('product_tour_completed', { total_steps: STEPS.length });
      return;
    }
    selectStep(index + 1);
  }, [index, selectStep]);

  const previous = useCallback(() => {
    if (complete) {
      setComplete(false);
      return;
    }
    selectStep(index - 1);
  }, [complete, index, selectStep]);

  const replay = useCallback(() => {
    setComplete(false);
    setIndex(0);
    trackEvent('product_tour_replayed', {});
  }, []);

  useEffect(() => {
    trackEvent('product_tour_started', { entry: 'public_share' });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') next();
      if (event.key === 'ArrowLeft') previous();
      if (event.key === 'Escape') setComplete(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [next, previous]);

  useEffect(() => {
    announcedRef.current?.focus();
  }, [index, complete]);

  const shareTour = async () => {
    const shareData = {
      title: 'Realty News Now Interactive Product Tour',
      text: 'See how Realty News Now supports Texas real estate professionals.',
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        trackEvent('product_tour_shared', { method: 'native' });
        return;
      }
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      trackEvent('product_tour_shared', { method: 'clipboard' });
    } catch {
      // Cancelled share sheets are intentionally silent.
    }
  };

  return (
    <main className="min-h-dvh overflow-hidden bg-[#f4eee4] text-gray-900">
      <style>{`
        @keyframes tourFade {
          from { opacity: .35; }
          to { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .tour-progress { transition: none !important; }
        }
      `}</style>
      <header className="border-b border-brand-700/15 bg-[#f4eee4]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" aria-label="Realty News Now home">
            <BrandMark />
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={replay}
              className="hidden min-h-11 items-center gap-2 border border-brand-700/20 px-3 text-xs font-semibold text-brand-700 transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 sm:inline-flex"
            >
              <RotateCcw size={15} aria-hidden /> Replay
            </button>
            <button
              type="button"
              onClick={shareTour}
              className="inline-flex min-h-11 items-center gap-2 bg-brand-700 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
            >
              {copied ? <Check size={15} aria-hidden /> : <Share2 size={15} aria-hidden />}
              {copied ? 'Link copied' : 'Share tour'}
            </button>
          </div>
        </div>
      </header>

      <div className="h-1 bg-brand-100" aria-hidden>
        <div
          className="tour-progress h-full bg-orange-600 transition-[width] duration-300 ease-out"
          style={{ width: complete ? '100%' : `${((index + 1) / STEPS.length) * 100}%` }}
        />
      </div>

      <section className="mx-auto grid max-w-7xl items-center gap-8 px-5 py-7 sm:px-8 lg:min-h-[calc(100dvh-70px)] lg:grid-cols-[minmax(300px,.78fr)_minmax(500px,1.22fr)] lg:gap-14 lg:py-10">
        <div className="order-2 lg:order-1">
          <div className="mb-6 flex items-center gap-2" aria-label={`Step ${index + 1} of ${STEPS.length}`}>
            {STEPS.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectStep(itemIndex, 'progress')}
                aria-label={`Go to step ${itemIndex + 1}: ${item.title}`}
                aria-current={!complete && index === itemIndex ? 'step' : undefined}
                className={`h-1.5 transition-[width,background-color] duration-300 ${
                  !complete && index === itemIndex
                    ? 'w-10 bg-orange-600'
                    : itemIndex < index || complete
                      ? 'w-5 bg-brand-700'
                      : 'w-5 bg-brand-200 hover:bg-brand-300'
                }`}
              />
            ))}
            <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-500">
              {complete ? 'Complete' : `${index + 1} of ${STEPS.length}`}
            </span>
          </div>

          <div key={complete ? 'complete' : step.id} className="motion-safe:animate-[tourFade_.28s_cubic-bezier(0.16,1,0.3,1)]">
            <p
              ref={announcedRef}
              tabIndex={-1}
              className="text-[11px] font-bold uppercase tracking-[0.22em] text-orange-700 outline-none"
              aria-live="polite"
            >
              {complete ? 'Tour complete' : step.eyebrow}
            </p>
            <h1 className="mt-3 max-w-xl font-serif text-[clamp(2rem,4vw,3.75rem)] leading-[1.02] tracking-[-0.03em] text-brand-700">
              {complete ? 'Ready to see what comes next?' : step.title}
            </h1>
            <p className="mt-4 max-w-lg text-base leading-7 text-gray-600">
              {complete
                ? 'You have seen how Realty News Now brings local intelligence, industry connections, and practical REALTOR® tools into one focused experience.'
                : step.description}
            </p>

            {!complete ? (
              <ul className="mt-5 space-y-2.5">
                {step.points.map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center bg-brand-700 text-white">
                      <Check size={12} strokeWidth={2.5} aria-hidden />
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/auth/sign-up"
                  className="inline-flex min-h-12 items-center gap-2 bg-brand-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
                >
                  Explore the app <ArrowRight size={16} aria-hidden />
                </Link>
                <a
                  href="mailto:hello@myrealtyline.com?subject=Realty%20News%20Now%20Partner%20Inquiry"
                  className="inline-flex min-h-12 items-center border border-brand-700/25 px-5 text-sm font-semibold text-brand-700 transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
                >
                  Talk with our team
                </a>
              </div>
            )}
          </div>

          <div className="mt-7 flex items-center gap-3 border-t border-brand-700/15 pt-5">
            <button
              type="button"
              onClick={previous}
              disabled={!complete && index === 0}
              className="inline-flex min-h-12 items-center gap-2 border border-brand-700/20 px-4 text-sm font-semibold text-brand-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ArrowLeft size={16} aria-hidden /> Back
            </button>
            {complete ? (
              <button
                type="button"
                onClick={replay}
                className="inline-flex min-h-12 items-center gap-2 bg-brand-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-800"
              >
                <RotateCcw size={16} aria-hidden /> Replay tour
              </button>
            ) : (
              <button
                type="button"
                onClick={next}
                className="inline-flex min-h-12 items-center gap-2 bg-brand-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-800"
              >
                {index === STEPS.length - 1 ? 'Finish tour' : 'Next'}
                <ArrowRight size={16} aria-hidden />
              </button>
            )}
            <span className="ml-auto hidden text-[10px] uppercase tracking-[0.14em] text-gray-400 sm:block">
              Use ← → keys
            </span>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <div className="mb-4 flex items-center justify-between lg:hidden">
            <span className="text-[10px] font-bold uppercase tracking-[0.17em] text-gray-500">Live app preview</span>
            <button type="button" onClick={replay} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700">
              <RotateCcw size={13} aria-hidden /> Replay
            </button>
          </div>
          <div className="mb-3 flex items-center justify-center gap-2 border border-brand-700/15 bg-white/70 px-3 py-2 text-center text-[9px] font-semibold uppercase tracking-[0.14em] text-brand-700 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-600" aria-hidden />
            Interactive preview · Select any navigation tab
          </div>
          <AppPreview
            step={step}
            onSelectTab={(tab) => selectStep(STEP_BY_TAB[tab], 'preview_navigation')}
          />
        </div>
      </section>

      <button
        type="button"
        aria-label="Close tour and visit Realty News Now"
        onClick={() => { window.location.href = '/'; }}
        className="fixed bottom-4 right-4 hidden h-10 w-10 items-center justify-center border border-brand-700/15 bg-[#f4eee4] text-brand-700 shadow-sm transition-colors hover:bg-white lg:flex"
      >
        <X size={16} aria-hidden />
      </button>
    </main>
  );
}
