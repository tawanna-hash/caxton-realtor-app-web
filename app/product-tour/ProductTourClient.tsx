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
  MoreHorizontal,
  Newspaper,
  RotateCcw,
  Share2,
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
  calendar: 2,
  more: 3,
  feed: 4,
  builders: 1,
};

function BrandMark({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg
        viewBox="0 0 40 40"
        width="36"
        height="36"
        role="img"
        aria-label="Realty News Now"
        className={inverse ? 'text-white' : 'text-brand-700'}
      >
        <rect x="2" y="2" width="36" height="36" rx="9" fill="currentColor" />
        <path d="M11 28V12h8.1c4.2 0 6.9 2.2 6.9 5.7 0 2.3-1.2 4.1-3.3 5l5 5.3h-5.2l-4.2-4.7h-2.8V28H11Zm4.5-8.3h3.2c1.8 0 2.8-.7 2.8-2s-1-2-2.8-2h-3.2v4Z" fill="white" />
      </svg>
      <span className="leading-none">
        <span className={`block text-sm font-bold tracking-tight ${inverse ? 'text-white' : 'text-brand-700'}`}>
          REALTY NEWS NOW
        </span>
        <span className={`mt-1 block text-[9px] uppercase tracking-[0.22em] ${inverse ? 'text-white/60' : 'text-gray-500'}`}>
          Texas real estate, daily
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
  const days = [
    ['MON', '24'],
    ['TUE', '25'],
    ['WED', '26'],
    ['THU', '27'],
    ['FRI', '28'],
  ];
  return (
    <div className="px-3 py-4" data-tour-screen="calendar">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-gray-400">Industry calendar</p>
          <h3 className="mt-1 text-lg font-semibold text-gray-900">August 2026</h3>
        </div>
        <span className="border border-gray-200 px-2.5 py-1.5 text-[10px] font-semibold text-gray-600">Event view</span>
      </div>
      <div className="mt-4 grid grid-cols-5 gap-1.5">
        {days.map(([day, date], index) => (
          <div
            key={day}
            className={`py-2 text-center ${index === 2 ? 'bg-brand-700 text-white' : 'border border-gray-200 bg-white text-gray-500'}`}
          >
            <p className="text-[8px] font-semibold">{day}</p>
            <p className="mt-1 text-sm font-bold">{date}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {[
          ['9:00 AM', 'Broker Breakfast & Market Update', 'Austin Board of REALTORS®'],
          ['12:00 PM', 'New Community Preview', 'West Austin'],
          ['5:30 PM', 'Women in Real Estate Networking', 'Downtown Austin'],
        ].map(([time, title, place], index) => (
          <div key={title} className="grid grid-cols-[64px_1fr] border border-gray-200 bg-white">
            <div className={`p-3 text-[9px] font-bold ${index === 0 ? 'bg-orange-50 text-orange-700' : 'bg-gray-50 text-gray-500'}`}>
              {time}
            </div>
            <div className="p-3">
              <p className="text-xs font-semibold text-gray-900">{title}</p>
              <p className="mt-1 flex items-center gap-1 text-[9px] text-gray-500">
                <MapPin size={10} aria-hidden /> {place}
              </p>
            </div>
          </div>
        ))}
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
      previous: '/product-tour/realtyline-july-2026.jpg',
    },
    {
      name: 'Newsline',
      market: 'San Antonio',
      current: '/product-tour/newsline-august-2026.jpg',
      previous: '/product-tour/newsline-july-2026.jpg',
    },
  ];

  return (
    <div className="px-3 py-4" data-tour-screen="issues">
      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-gray-400">Digital editions</p>
      <h3 className="mt-1 text-lg font-semibold text-gray-900">Latest issues</h3>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {publications.map((publication) => (
          <div key={publication.name} className="border border-gray-200 bg-gray-50 p-2">
            <div className="h-8 overflow-hidden border border-gray-200 bg-white px-2">
              <Image
                src={publication.current}
                alt={`${publication.name} logo`}
                width={720}
                height={804}
                className="h-full w-full object-cover object-top"
              />
            </div>
            <div className="relative mt-2 h-[152px]">
              <div className="absolute right-0 top-3 h-[132px] w-[73%] overflow-hidden border border-white bg-white shadow-sm">
                <Image
                  src={publication.previous}
                  alt={`${publication.name} July 2026 issue cover`}
                  fill
                  sizes="150px"
                  className="object-contain"
                />
              </div>
              <div className="absolute left-0 top-0 h-[142px] w-[78%] overflow-hidden border border-gray-200 bg-white shadow-md">
                <Image
                  src={publication.current}
                  alt={`${publication.name} August 2026 issue cover`}
                  fill
                  priority
                  sizes="170px"
                  className="object-contain"
                />
              </div>
            </div>
            <p className="mt-1 text-[10px] font-semibold text-gray-900">{publication.name}</p>
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
  return (
    <div className="px-3 py-4" data-tour-screen="partners">
      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-gray-400">Professional directory</p>
      <h3 className="mt-1 text-lg font-semibold text-gray-900">Local partners</h3>
      <div className="mt-3 flex items-center gap-2 border border-gray-200 bg-gray-50 px-3 py-2">
        <LayoutGrid size={14} className="text-gray-400" aria-hidden />
        <span className="text-[10px] text-gray-400">Search builders, lenders, title companies...</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {[
          ['M/I Homes', 'Homebuilder', 'MI'],
          ['Austin Title', 'Title Services', 'AT'],
          ['UFCU Mortgage', 'Lending', 'UF'],
          ['Heritage Land', 'Development', 'HL'],
        ].map(([name, category, initials], index) => (
          <div key={name} className="border border-gray-200 bg-white p-3">
            <div className={`flex h-9 w-9 items-center justify-center text-[10px] font-bold ${index % 2 ? 'bg-orange-50 text-orange-700' : 'bg-brand-50 text-brand-700'}`}>
              {initials}
            </div>
            <p className="mt-3 text-[11px] font-semibold text-gray-900">{name}</p>
            <p className="mt-0.5 text-[9px] text-gray-500">{category}</p>
          </div>
        ))}
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
          <button type="button" onClick={() => onSelectTab('feed')} className="flex flex-col items-center leading-none">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-900">
              RealtyLine <ChevronDown size={11} aria-hidden />
            </span>
            <span className="mt-1 text-[7px] font-semibold uppercase tracking-[0.16em] text-gray-400">Realty News Now</span>
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

      <section className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-8 sm:px-8 lg:min-h-[calc(100dvh-78px)] lg:grid-cols-[minmax(300px,.78fr)_minmax(500px,1.22fr)] lg:gap-16 lg:py-12">
        <div className="order-2 lg:order-1">
          <div className="mb-7 flex items-center gap-2" aria-label={`Step ${index + 1} of ${STEPS.length}`}>
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
            <h1 className="mt-4 max-w-xl font-serif text-[clamp(2.25rem,5vw,4.5rem)] leading-[0.98] tracking-[-0.035em] text-brand-700">
              {complete ? 'Ready to see what comes next?' : step.title}
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-gray-600">
              {complete
                ? 'You have seen how Realty News Now brings local intelligence, industry connections, and practical REALTOR® tools into one focused experience.'
                : step.description}
            </p>

            {!complete ? (
              <ul className="mt-6 space-y-2.5">
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

          <div className="mt-8 flex items-center gap-3 border-t border-brand-700/15 pt-6">
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
          <AppPreview
            step={step}
            onSelectTab={(tab) => selectStep(STEP_BY_TAB[tab], 'preview_navigation')}
          />
          <p className="mt-5 text-center text-[10px] uppercase tracking-[0.16em] text-gray-500">
            Interactive preview · Select any navigation tab
          </p>
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
