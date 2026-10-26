// lib/structured-data.ts
//
// Shared schema.org JSON-LD builders. Keeps brand relationships explicit
// (Realty News Now app -> Caxton Publications -> RealtyLine + Newsline San
// Antonio) so search engines and AI assistants resolve them as one entity
// graph rather than separate sites.

export const SITE_URL = 'https://realtynewsnow.app';
const ORG_ID = `${SITE_URL}/#organization`;
const PUBLISHER_ID = `${SITE_URL}/#caxton-publications`;
const REALTYLINE_ID = `${SITE_URL}/#realtyline-austin`;
const NEWSLINE_ID = `${SITE_URL}/#newsline-san-antonio`;

export const SITE_TAGLINE =
  'Realty News Now is a free Texas real estate news app and publishing platform from Caxton Publications, Inc., home of RealtyLine (Austin) and Newsline San Antonio.';

const SAME_AS = [
  'https://www.facebook.com/myrealtyline',
  'https://www.instagram.com/myrealtyline',
  'https://www.facebook.com/newslinesa',
  'https://www.instagram.com/newsline_sanantonio',
];

const CONTACT = {
  '@type': 'ContactPoint',
  email: 'hello@myrealtyline.com',
  contactType: 'customer support',
  availableLanguage: 'English',
};

/** Core entity graph: app/org, publisher, both magazines, website. */
export function siteGraph() {
  return [
    {
      '@type': ['Organization', 'NewsMediaOrganization'],
      '@id': ORG_ID,
      name: 'Realty News Now',
      url: SITE_URL,
      logo: `${SITE_URL}/icon-512.png`,
      description: SITE_TAGLINE,
      foundingDate: '2026-05',
      parentOrganization: { '@id': PUBLISHER_ID },
      areaServed: [
        { '@type': 'City', name: 'Austin', containedInPlace: { '@type': 'State', name: 'Texas' } },
        { '@type': 'City', name: 'San Antonio', containedInPlace: { '@type': 'State', name: 'Texas' } },
      ],
      contactPoint: CONTACT,
      sameAs: SAME_AS,
    },
    {
      '@type': 'Organization',
      '@id': PUBLISHER_ID,
      name: 'Caxton Publications, Inc.',
      description:
        'Independent, family-run publisher serving the Texas real estate community.',
      url: `${SITE_URL}/about`,
      contactPoint: CONTACT,
      brand: [{ '@id': REALTYLINE_ID }, { '@id': NEWSLINE_ID }],
      member: [
        { '@type': 'Organization', name: 'National Association of REALTORS®' },
        { '@type': 'Organization', name: 'Texas REALTORS®' },
        { '@type': 'Organization', name: 'Austin Board of REALTORS®' },
        { '@type': 'Organization', name: 'San Antonio Board of REALTORS®' },
        { '@type': 'Organization', name: 'Home Builders Association of Greater Austin' },
        { '@type': 'Organization', name: 'Greater San Antonio Builders Association' },
      ],
    },
    {
      '@type': 'Periodical',
      '@id': REALTYLINE_ID,
      name: 'RealtyLine Austin',
      alternateName: 'RealtyLine',
      description: 'Monthly Austin and Central Texas real estate magazine, founded in 1995.',
      foundingDate: '1995',
      publisher: { '@id': PUBLISHER_ID },
      url: `${SITE_URL}/magazine`,
      contentLocation: { '@type': 'City', name: 'Austin' },
      sameAs: [SAME_AS[0], SAME_AS[1]],
    },
    {
      '@type': 'Periodical',
      '@id': NEWSLINE_ID,
      name: 'Newsline San Antonio',
      description:
        'Monthly San Antonio and South Texas real estate magazine, founded in 1982 and relaunched in 2025.',
      foundingDate: '1982',
      publisher: { '@id': PUBLISHER_ID },
      url: `${SITE_URL}/magazine`,
      contentLocation: { '@type': 'City', name: 'San Antonio' },
      sameAs: [SAME_AS[2], SAME_AS[3]],
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: 'Realty News Now',
      inLanguage: 'en-US',
      publisher: { '@id': ORG_ID },
    },
  ];
}

export function siteStructuredData() {
  return { '@context': 'https://schema.org', '@graph': siteGraph() };
}

export function webPage(opts: {
  path: string;
  name: string;
  description: string;
  type?: 'WebPage' | 'AboutPage' | 'CollectionPage' | 'FAQPage';
}) {
  return {
    '@context': 'https://schema.org',
    '@type': opts.type ?? 'WebPage',
    '@id': `${SITE_URL}${opts.path}#webpage`,
    url: `${SITE_URL}${opts.path}`,
    name: opts.name,
    description: opts.description,
    inLanguage: 'en-US',
    isPartOf: { '@id': `${SITE_URL}/#website` },
    publisher: { '@id': ORG_ID },
  };
}

export const FAQ_ITEMS: ReadonlyArray<{ q: string; a: string }> = [
  { q: "Who can use this app?", a: "Anyone can sign up. Realty News Now is built for the Austin and San Antonio real estate community — REALTORS®, brokers, lenders, title professionals, builders, homebuyers, and anyone who wants to follow the local market. Some features (like REALTOR®-only giveaways or industry-specific content) may have additional eligibility, but the app and its core content are open to everyone." },
  { q: "Is it really free?", a: "Yes. There is no subscription fee. The app is supported by the same advertising partners who support our print and digital magazines." },
  { q: "How do I sign in?", a: "We use magic links — no passwords. Enter your email and we send you a one-time sign-in link. Click it and you're in. Links expire after a short time for security." },
  { q: "Why no passwords?", a: "Magic links are simpler, more secure, and remove the most common account-recovery headache for users — forgotten passwords." },
  { q: "What does the app cover — RealtyLine, Newsline San Antonio, or both?", a: "Both. RealtyLine covers Austin and Central Texas; Newsline San Antonio covers San Antonio and South Texas. You can choose which publication's content you want to see in your feed, or follow both." },
  { q: "How do push notifications work?", a: "You can opt in during sign-up or in settings. You control which types of notifications you receive — new issues, upcoming events, giveaways, breaking news, or partner features." },
  { q: "How do I change or turn off notifications?", a: "Open the app, go to Settings → Notification Preferences, and toggle each category individually. Or turn them all off in one tap." },
  { q: "How do I change my email address?", a: "Email us at hello@myrealtyline.com from your current email address and let us know the new one. We'll update your account and reverify." },
  { q: "How do I delete my account?", a: "Email hello@myrealtyline.com with the subject line “Account Deletion Request.” We'll confirm and then deactivate your account within 7 business days." },
  { q: "What happens to my data if I delete my account?", a: "Your personal information is removed from active systems. Some records may be retained for accounting, legal, or audit purposes — full details are in our Privacy Notice." },
  { q: "My magic link didn't arrive.", a: "Check your spam folder first — magic links sometimes get caught there. If it's still missing after a few minutes, request a new one. Each new request invalidates the previous link." },
  { q: "My magic link says it's expired or invalid.", a: "Links expire after a short time for security, and each one can only be used once. If yours expired, just go back to the sign-in screen and request a new one." },
  { q: "I'm having trouble signing in.", a: "Email hello@myrealtyline.com with the email address you're trying to use, and we'll look into it." },
  { q: "I found a bug or have a feature suggestion.", a: "We'd love to hear it. Email hello@myrealtyline.com and include a screenshot if you can." },
];

export function faqPage() {
  return {
    ...webPage({
      path: '/faq',
      name: 'Frequently Asked Questions — Realty News Now',
      description:
        'Common questions about signing in, notifications, account, and troubleshooting for Realty News Now.',
      type: 'FAQPage',
    }),
    mainEntity: FAQ_ITEMS.map((i) => ({
      '@type': 'Question',
      name: i.q,
      acceptedAnswer: { '@type': 'Answer', text: i.a },
    })),
  };
}

export function breadcrumbs(items: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.path}`,
    })),
  };
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

type EventLike = {
  id: number;
  title: string;
  description: string;
  publication: string;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  organizer: string | null;
  website: string | null;
  link: string;
  format: string | null;
  memberPrice: string | null;
  nonmemberPrice: string | null;
  imageUrl: string | null;
  lat: number | null;
  lng: number | null;
  instructor: string | null;
};

function parsePrice(raw: string | null): number | null {
  if (!raw) return null;
  const t = raw.trim().toLowerCase();
  if (t === 'free' || t === '$0' || t === '0') return 0;
  const m = t.match(/^\$?\s*(\d+(?:\.\d{1,2})?)$/);
  return m ? Number(m[1]) : null;
}

function plainText(html: string, max = 500): string {
  const t = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#?\w+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export function eventPath(publication: string, id: number) {
  return `/calendar/${publication}/${id}`;
}

export function eventDescription(e: Pick<EventLike, 'description' | 'title'>) {
  return plainText(e.description || '', 300) || e.title;
}

/** schema.org Event for a public calendar event (omits fields we do not have). */
export function eventJsonLd(e: EventLike) {
  const url = `${SITE_URL}${eventPath(e.publication, e.id)}`;
  const online = /online|virtual|webinar|zoom/i.test(`${e.format ?? ''} ${e.location ?? ''}`);
  const hasPlace = !!e.location && !/^online/i.test(e.location.trim());

  const prices = [e.memberPrice, e.nonmemberPrice]
    .map(parsePrice)
    .filter((p): p is number => p !== null);
  const offers = prices.length
    ? {
        '@type': 'Offer',
        url: e.website || e.link || url,
        price: Math.min(...prices),
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
      }
    : undefined;

  const location = online && !hasPlace
    ? { '@type': 'VirtualLocation', url: e.website || e.link || url }
    : hasPlace
      ? {
          '@type': 'Place',
          name: e.location!.split(',')[0].trim(),
          address: e.location,
          ...(e.lat != null && e.lng != null
            ? { geo: { '@type': 'GeoCoordinates', latitude: e.lat, longitude: e.lng } }
            : {}),
        }
      : undefined;

  const out: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    '@id': `${url}#event`,
    name: e.title,
    description: eventDescription(e),
    url,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: online && !hasPlace
      ? 'https://schema.org/OnlineEventAttendanceMode'
      : online
        ? 'https://schema.org/MixedEventAttendanceMode'
        : 'https://schema.org/OfflineEventAttendanceMode',
    inLanguage: 'en-US',
    publisher: { '@id': ORG_ID },
  };
  if (e.startDate) out.startDate = e.startDate;
  if (e.endDate) out.endDate = e.endDate;
  if (location) out.location = location;
  if (e.imageUrl) out.image = [e.imageUrl];
  if (e.organizer) out.organizer = { '@type': 'Organization', name: e.organizer };
  if (e.instructor) out.performer = { '@type': 'Person', name: e.instructor };
  if (offers) {
    out.offers = offers;
    out.isAccessibleForFree = Math.max(...prices) === 0;
  }
  return out;
}
