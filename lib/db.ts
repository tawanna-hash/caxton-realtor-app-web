// caxton-events-v1
// Postgres client for the events feature. Connects to Vercel Postgres (Neon
// under the hood) using the auto-injected DATABASE_URL or POSTGRES_URL env
// var. Schema is created on first read/write — no separate migration step.

import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { ensureCrmSchema } from './crm-schema';

let cached: NeonQueryFunction<false, false> | null = null;
let schemaEnsured = false;
let schemaEnsurePromise: Promise<void> | null = null;
let schemaEnsureError: unknown = null;

function getConnectionString(): string {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING;
  if (!url) {
    throw new Error(
      'No Postgres connection string found. Connect a Postgres database to ' +
      'this Vercel project and redeploy. Expected env var: DATABASE_URL or POSTGRES_URL.',
    );
  }
  return url;
}

/** Lazily create and cache the Neon client. */
export function getSql(): NeonQueryFunction<false, false> {
  if (cached) return cached;
  cached = neon(getConnectionString());
  return cached;
}

/**
 * Create the `events` table if it doesn't exist yet. Safe to call on every
 * request — it's a no-op once the table is in place. We also cache the
 * "already ensured" flag in module memory so we don't even hit the DB after
 * the first call within a warm function instance.
 */
export async function ensureSchema(): Promise<void> {
  if (schemaEnsured) return;
  if (schemaEnsureError) return;
  if (schemaEnsurePromise) return schemaEnsurePromise;
  schemaEnsurePromise = _runEnsureSchema()
    .then(() => { schemaEnsured = true; })
    .catch((err) => {
      schemaEnsureError = err;
      console.warn('[ensureSchema] one-time bootstrap failed, cached:', err instanceof Error ? err.message : err);
    })
    .finally(() => { schemaEnsurePromise = null; });
  return schemaEnsurePromise;
}

/**
 * Initial curated senders for the Gmail event scanner. Seeded by domain, so
 * `communications@abor.com` and any other ABoR mailbox are already covered by
 * the single `abor.com` row.
 *
 * NAHREP and AREAA are national domains — chapter mail for both markets
 * arrives from the same host, so they default to Austin and rely on the
 * scanner's keyword auto-detect to route San Antonio events correctly.
 *
 * Admins extend this list at runtime by inserting into `event_source_orgs`
 * directly; new rows here are only for bootstrapping a fresh environment.
 */
const EVENT_SOURCE_ORG_SEEDS: ReadonlyArray<{
  name: string;
  domain: string;
  defaultPublication: 'austin' | 'san_antonio';
}> = [
  { name: 'Austin Board of REALTORS', domain: 'abor.com', defaultPublication: 'austin' },
  { name: 'Five Points Board of REALTORS', domain: 'fivepointsrealtors.com', defaultPublication: 'austin' },
  // Home Builders Association of Greater Austin. Their events also flow in via
  // the existing `scrape-hba` cron (external_source='hba'); Gmail catches
  // promo/mailing-list events that don't appear on the public HBA calendar.
  { name: 'HBA Austin', domain: 'hbaaustin.com', defaultPublication: 'austin' },
  // Realty Austin merged into Compass RE Texas in 2023; realtyaustin.com may
  // still forward or be aliased. If mail arrives from `@compass.com` instead,
  // add that domain via a separate seed row or an admin insert.
  { name: 'Realty Austin', domain: 'realtyaustin.com', defaultPublication: 'austin' },
  // wcraustin.com is unverified — WCR chapters have historically used both
  // wcr.org subdomains and standalone chapter sites. Confirm the real sending
  // domain from a recent chapter email and UPDATE the row if it differs.
  { name: 'WCR Austin', domain: 'wcraustin.com', defaultPublication: 'austin' },
  { name: 'NAHREP', domain: 'nahrep.org', defaultPublication: 'austin' },
  { name: 'AREAA', domain: 'areaa.org', defaultPublication: 'austin' },
  { name: 'Texas REALTORS', domain: 'texasrealestate.com', defaultPublication: 'austin' },
  { name: 'SABOR', domain: 'sabor.com', defaultPublication: 'san_antonio' },
];

async function _runEnsureSchema(): Promise<void> {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      external_source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      publication TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      link TEXT,
      start_date TIMESTAMPTZ,
      end_date TIMESTAMPTZ,
      location TEXT,
      organizer TEXT,
      organizer_email TEXT,
      website TEXT,
      tags TEXT,
      format TEXT,
      course_number TEXT,
      member_price TEXT,
      nonmember_price TEXT,
      image_url TEXT,
      image_thumb TEXT,
      instructor_name TEXT,
      instructor_bio TEXT,
      hidden BOOLEAN NOT NULL DEFAULT false,
      edited_fields TEXT[] NOT NULL DEFAULT '{}'::text[],
      edited_by TEXT,
      edited_at TIMESTAMPTZ,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT events_external_uniq UNIQUE (external_source, external_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS events_pub_start_idx ON events (publication, start_date)`;
  await sql`CREATE INDEX IF NOT EXISTS events_synced_idx ON events (last_synced_at)`;
  // Idempotent column adds for tables created before instructor support.
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS instructor_name TEXT`;
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS instructor_bio TEXT`;
  // Manual-events admin support (DECISIONS.md #5 — May 8, 2026).
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false`;
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS edited_fields TEXT[] NOT NULL DEFAULT '{}'::text[]`;
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS edited_by TEXT`;
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ`;

  // ============================================================
  // Event registration short-link clicks (Sep 2026)
  // Every tap of the public "Register" button routes through
  // /e/[id], which logs a row here before redirecting to the
  // organizer's URL with UTM params. visitor_id is the PostHog
  // anonymous distinct_id read from the ph_*_posthog cookie when
  // present, so repeat clicks from the same browser share an id
  // without requiring a login. Falls back to a per-request random
  // id when the cookie is absent (e.g. ad blockers, first-party
  // cookie disabled).
  // ============================================================
  await sql`
    CREATE TABLE IF NOT EXISTS event_registration_clicks (
      id            BIGSERIAL PRIMARY KEY,
      event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      visitor_id    TEXT NOT NULL,
      ip            TEXT,
      city          TEXT,
      region        TEXT,
      country       TEXT,
      user_agent    TEXT,
      referrer      TEXT,
      destination_host TEXT,
      occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_event_reg_clicks_event
      ON event_registration_clicks(event_id, occurred_at DESC)
  `;

  // ============================================================
  // Ads dashboard (Phase 1 — May 9, 2026)
  // 15-slot ad inventory catalog, uploaded creatives, scheduled
  // campaigns. See DECISIONS.md #10 (ads dashboard scope).
  // ============================================================

  await sql`
    CREATE TABLE IF NOT EXISTS ad_spaces (
      slug TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      zone TEXT NOT NULL,
      tier TEXT NOT NULL,
      sizes_json JSONB NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS ad_creatives (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      advertiser_name TEXT NOT NULL,
      blob_url TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      click_url TEXT NOT NULL,
      alt_text TEXT,
      uploaded_by TEXT NOT NULL,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS ad_campaigns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      advertiser_name TEXT NOT NULL,
      ad_space_slug TEXT NOT NULL REFERENCES ad_spaces(slug),
      creative_id UUID NOT NULL REFERENCES ad_creatives(id),
      publication TEXT NOT NULL,
      pubs TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      price_total NUMERIC(10,2),
      price_notes TEXT,
      notes TEXT,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_ad_campaigns_lookup
      ON ad_campaigns (ad_space_slug, publication, active, start_date, end_date)
  `;
  // Multi-market checkout (Phase 3, 2026-06-17): pubs[] is the canonical
  // per-market booking scope. publication stays as a back-compat display
  // string (comma-joined for multi-market rows). GIN index supports fast
  // overlap (&&) queries for sold-out detection.
  await sql`
    ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS pubs TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_ad_campaigns_pubs ON ad_campaigns USING GIN (pubs)
  `;
  // Backfill any rows that have a legacy publication value but no pubs.
  await sql`
    UPDATE ad_campaigns SET pubs = CASE
      WHEN publication = 'both'                                       THEN ARRAY['realtyline','newsline']::TEXT[]
      WHEN publication = 'austin'      OR publication = 'realtyline'  THEN ARRAY['realtyline']::TEXT[]
      WHEN publication = 'san_antonio' OR publication = 'newsline'    THEN ARRAY['newsline']::TEXT[]
      WHEN publication = 'realtyline-houston' OR publication = 'houston' THEN ARRAY['realtyline-houston']::TEXT[]
      WHEN publication = 'realtyline-dallas'  OR publication = 'dallas'  THEN ARRAY['realtyline-dallas']::TEXT[]
      ELSE ARRAY[publication]::TEXT[]
    END
    WHERE COALESCE(array_length(pubs, 1), 0) = 0
  `;
  // Self-serve approval gate (2026-07-21): a paid self-serve booking must NOT
  // go live automatically — it waits for an admin to approve it from
  // /admin/ads/orders. approval_status tracks that lifecycle:
  //   'draft'    — submitted, payment not yet webhook-confirmed (does NOT reserve)
  //   'pending'  — paid, awaiting admin approval (reserves capacity, not live)
  //   'approved' — admin-approved OR legacy/admin-created campaign (gates on active)
  // Default 'approved' so every pre-existing row and all admin-created
  // campaigns behave exactly as before (serving still gates purely on `active`).
  await sql`
    ALTER TABLE ad_campaigns
      ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved'
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_ad_campaigns_approval
      ON ad_campaigns (ad_space_slug, approval_status, active, start_date, end_date)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_ad_creatives_advertiser
      ON ad_creatives (advertiser_name)
  `;

  // ── Featured social posts (curated Facebook integration) ─────────────────
  //
  // Admins paste a Facebook post URL in /admin/social; we fetch the post
  // via the Graph API (using a long-lived Page Access Token) and cache the
  // message/image/permalink here. Cards render natively in the feed and
  // when the user clicks 'View on Facebook' they're sent to permalink_url.
  //
  // is_open_house flips on a gold badge AND pins the post to the top of
  // the feed for that publication while is_active=true.
  await sql`
    CREATE TABLE IF NOT EXISTS featured_social_posts (
      id              SERIAL PRIMARY KEY,
      fb_post_id      TEXT UNIQUE NOT NULL,
      page_id         TEXT NOT NULL,
      permalink_url   TEXT NOT NULL,
      message         TEXT,
      image_url       TEXT,
      posted_at       TIMESTAMPTZ,
      pub             TEXT NOT NULL DEFAULT 'both',
      is_open_house   BOOLEAN NOT NULL DEFAULT FALSE,
      is_active       BOOLEAN NOT NULL DEFAULT TRUE,
      display_order   INTEGER NOT NULL DEFAULT 0,
      refreshed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by      TEXT
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_featured_social_posts_feed
      ON featured_social_posts (pub, is_active, is_open_house, display_order, posted_at DESC)
  `;

  // Pre-populate the 15 ad spaces (catalog). ON CONFLICT DO UPDATE on
  // display_name so the catalog stays the source of truth for the
  // user-facing label (e.g. 'Newsletter Banner' → 'e-Blast Top Banner'
  // renames propagate on the next cold start). Other columns are left as-is.
  // Idempotent: re-running ensureSchema() won't disturb anything else.
  const adSpaceCatalog = [
    {
      slug: 'article_top_leaderboard',
      display_name: 'Article Top Leaderboard',
      zone: 'article',
      tier: 'premium',
      sizes: [{w:728,h:90,context:'desktop'},{w:320,h:50,context:'mobile'},{w:300,h:250,context:'fallback'}],
      notes: '100% of article opens, above-the-fold',
    },
    {
      slug: 'article_mid_inline',
      display_name: 'Article Mid-Inline',
      zone: 'article',
      tier: 'standard',
      sizes: [{w:300,h:250,context:'all'},{w:320,h:100,context:'mobile-large'}],
      notes: 'Inserted at 40% scroll depth on articles >600 words',
    },
    {
      slug: 'article_bottom',
      display_name: 'Article Bottom',
      zone: 'article',
      tier: 'standard',
      sizes: [{w:300,h:250,context:'all'},{w:728,h:90,context:'desktop'}],
      notes: '100% of article completions',
    },
    {
      slug: 'article_sidebar_desktop',
      display_name: 'Article Sidebar (Desktop)',
      zone: 'article',
      tier: 'premium',
      sizes: [{w:300,h:600,context:'desktop'},{w:300,h:250,context:'desktop-stacked'}],
      notes: 'Desktop only (≥1024px). Long dwell time placement.',
    },
    {
      slug: 'article_interstitial',
      display_name: 'Article Interstitial',
      zone: 'article',
      tier: 'premium',
      sizes: [{w:1080,h:1920,context:'mobile-fullscreen'},{w:970,h:250,context:'desktop'}],
      notes: 'Every 4th article tap; never on first session. High friction.',
    },
    {
      slug: 'feed_inline_card',
      display_name: 'Feed Inline Card (Native)',
      zone: 'feed',
      tier: 'standard',
      sizes: [{w:1080,h:600,context:'native'}],
      notes: 'Every 6th feed card. Marked SPONSORED.',
    },
    {
      slug: 'feed_top_banner',
      display_name: 'Feed Top Banner',
      zone: 'feed',
      tier: 'standard',
      sizes: [{w:728,h:90,context:'desktop'},{w:320,h:50,context:'mobile'}],
      notes: 'Top of feed, both pubs.',
    },
    {
      slug: 'feed_sticky_bottom',
      display_name: 'Feed Sticky Bottom (Mobile)',
      zone: 'feed',
      tier: 'standard',
      sizes: [{w:320,h:50,context:'mobile'},{w:320,h:100,context:'mobile-large'}],
      notes: 'Persistent at bottom while scrolling feed; dismissable.',
    },
    {
      slug: 'calendar_top_banner',
      display_name: 'Calendar Top Banner',
      zone: 'calendar',
      tier: 'standard',
      sizes: [{w:728,h:90,context:'desktop'},{w:320,h:50,context:'mobile'}],
      notes: 'Top of calendar tab, both pubs.',
    },
    {
      slug: 'calendar_event_sponsor',
      display_name: 'Calendar Event Sponsor',
      zone: 'calendar',
      tier: 'premium',
      sizes: [{w:0,h:0,context:'native-event-card'}],
      notes: 'Pinned to top of calendar list. Gold border, "PRESENTED BY" tag. Limit 1-2 per pub per week.',
    },
    {
      slug: 'newsletter_banner',
      display_name: 'e-Blast Top Banner',
      zone: 'newsletter',
      tier: 'premium',
      sizes: [{w:600,h:200,context:'email'},{w:600,h:100,context:'email-slim'}],
      notes: 'Top of every send. Ships when newsletter ships (FOLLOW_UPS.md #10).',
    },
    {
      slug: 'splash_welcome',
      display_name: 'Splash / Welcome',
      zone: 'app',
      tier: 'premium',
      sizes: [{w:1080,h:1920,context:'mobile-fullscreen'}],
      notes: 'First session of the day, never twice in 12h.',
    },
    {
      slug: 'push_sponsorship',
      display_name: 'Push Notification Sponsor',
      zone: 'app',
      tier: 'premium',
      sizes: [{w:256,h:256,context:'icon'}],
      notes: '1 sponsored push per week max. Use sparingly.',
    },
    {
      slug: 'account_splash',
      display_name: 'Account Page Splash',
      zone: 'account',
      tier: 'premium',
      sizes: [{w:1080,h:400,context:'banner'},{w:970,h:250,context:'desktop'},{w:320,h:250,context:'mobile'}],
      notes: 'Top of /account or /profile, every visit. Rotates per session.',
    },
    {
      slug: 'house_fallback',
      display_name: 'House Ad Fallback',
      zone: 'misc',
      tier: 'house',
      sizes: [{w:0,h:0,context:'any'}],
      notes: 'Fills any unsold inventory. No revenue.',
    },
    // ---- Starter-pack additions (MONETIZATION_MAP.md, June 2026) ----
    // Three of the five recommended starter slots (calendar_event_sponsor,
    // feed_sticky_bottom, newsletter_banner) were already present above.
    // These two close out the starter pack so <AdSlot> can be wired into the
    // builders, inventory, and giveaways pages immediately.
    {
      slug: 'featured_builder_strip',
      display_name: 'Featured Builder Strip',
      zone: 'feed',
      tier: 'premium',
      sizes: [{w:0,h:0,context:'native-strip'},{w:1200,h:200,context:'desktop-hero'},{w:600,h:160,context:'mobile-hero'}],
      notes: 'Above the filter chips on /inventory and /builders. Logo + tagline + CTA. Premium tier; sell weekly.',
    },
    {
      slug: 'giveaway_prize_sponsor',
      display_name: 'Giveaway Prize Sponsor',
      zone: 'feed',
      tier: 'premium',
      sizes: [{w:0,h:0,context:'native-card'},{w:1080,h:600,context:'feed-card'}],
      notes: '"Prize provided by..." on /giveaways cards + entry-confirmation page. Sponsor pays for prize + visibility.',
    },
  ];

  for (const space of adSpaceCatalog) {
    await sql`
      INSERT INTO ad_spaces (slug, display_name, zone, tier, sizes_json, notes)
      VALUES (
        ${space.slug},
        ${space.display_name},
        ${space.zone},
        ${space.tier},
        ${JSON.stringify(space.sizes)}::jsonb,
        ${space.notes}
      )
      ON CONFLICT (slug) DO UPDATE SET display_name = EXCLUDED.display_name
    `;
  }

  // ============================================================
  // House-ad placeholder seed (June 2026)
  // Fills the 5 starter ad slots with "Feature your brand here"
  // placeholders so they aren't visually empty before real
  // advertisers are booked. Idempotent — re-running is a no-op.
  // Deactivate any house campaign from /admin/ads when a real
  // advertiser is booked for that slot.
  // ============================================================
  const houseAds: Array<{
    slug: string;
    blob_url: string;
    width: number;
    height: number;
    alt: string;
    subject: string;
    /**
     * Override the destination email. Defaults to info@myrealtyline.com.
     * Article-reader slots use info@myrealtyline.com to match the existing
     * /lib/pub-meta.ts copy that ran on these placements previously.
     */
    email?: string;
  }> = [
    {
      slug: 'featured_builder_strip',
      blob_url: '/ads/house-featured-builder-strip.svg',
      width: 728,
      height: 90,
      alt: 'Feature your model homes here — advertise with RealtyLine',
      subject: 'Featured Builder Strip inquiry',
    },
    {
      slug: 'calendar_event_sponsor',
      blob_url: '/ads/house-calendar-event-sponsor.svg',
      width: 600,
      height: 160,
      alt: 'Sponsor a pinned calendar event',
      subject: 'Calendar Event Sponsor inquiry',
    },
    {
      slug: 'feed_sticky_bottom',
      blob_url: '/ads/house-feed-sticky-bottom.svg',
      width: 320,
      height: 50,
      alt: 'Your ad here — sticky bottom banner',
      subject: 'Sticky Bottom Banner inquiry',
    },
    {
      slug: 'giveaway_prize_sponsor',
      blob_url: '/ads/house-giveaway-prize-sponsor.svg',
      width: 600,
      height: 200,
      alt: 'Become a giveaway prize sponsor',
      subject: 'Giveaway Prize Sponsor inquiry',
    },
    {
      slug: 'newsletter_banner',
      blob_url: '/ads/house-newsletter-banner.svg',
      width: 600,
      height: 200,
      alt: 'Top-of-newsletter sponsorship',
      subject: 'Newsletter Sponsor inquiry',
    },
    // ---- Article-reader slots (June 2026 unification) ----
    // Previously rendered by inline <HouseAd> JSX in app/(dashboard)/dashboard/page.tsx.
    // Now unified under <AdSlotComponent> so impressions/clicks track through PostHog.
    {
      slug: 'article_top_leaderboard',
      blob_url: '/ads/house-article-top-leaderboard.svg',
      width: 728,
      height: 90,
      alt: 'Get featured here — Reach 71,000+ Texas REALTORS',
      subject: 'Article Leaderboard inquiry',
      email: 'info@myrealtyline.com',
    },
    {
      slug: 'article_mid_inline',
      blob_url: '/ads/house-article-mid-inline.svg',
      width: 600,
      height: 300,
      alt: 'Advertise in RealtyLine — Reach 71,000+ Texas REALTORS',
      subject: 'Article Mid-Inline inquiry',
      email: 'info@myrealtyline.com',
    },
    {
      slug: 'article_interstitial',
      blob_url: '/ads/house-article-interstitial.svg',
      width: 288,
      height: 200,
      alt: 'Advertise in RealtyLine — dismissable popup',
      subject: 'Article Interstitial inquiry',
      email: 'info@myrealtyline.com',
    },
  ];

  // One-time rewrite of legacy house-ad mailtos (June 2026 + June 17 2026).
  // All ads@ inboxes (ads@realtynewsnow.app, ads@myrealtyline.com,
  // ads@newslinesa.com) consolidate to info@myrealtyline.com so inbound
  // lands in one place. Becomes a no-op once all rows are updated.
  await sql`
    UPDATE ad_creatives
       SET click_url = REPLACE(click_url, 'ads@realtynewsnow.app', 'info@myrealtyline.com')
     WHERE uploaded_by = 'system:house-ad-seed'
       AND click_url LIKE '%ads@realtynewsnow.app%'
  `;
  await sql`
    UPDATE ad_creatives
       SET click_url = REPLACE(click_url, 'ads@myrealtyline.com', 'info@myrealtyline.com')
     WHERE uploaded_by = 'system:house-ad-seed'
       AND click_url LIKE '%ads@myrealtyline.com%'
  `;
  await sql`
    UPDATE ad_creatives
       SET click_url = REPLACE(click_url, 'ads@newslinesa.com', 'info@myrealtyline.com')
     WHERE uploaded_by = 'system:house-ad-seed'
       AND click_url LIKE '%ads@newslinesa.com%'
  `;

  // One-time cleanup of malformed mailto links saved with a stray space
  // (e.g. 'mailto: ads@...'), which browsers refuse to dispatch to the
  // mail client. Becomes a no-op once all rows are clean.
  await sql`
    UPDATE ad_creatives
       SET click_url = REGEXP_REPLACE(click_url, '^mailto:\s+', 'mailto:')
     WHERE click_url ~ '^mailto:\s+'
  `;

  // June 9, 2026: switch all mailto: ad CTAs to the on-site inquiry form
  // (/advertise/inquire). Gmail web doesn't honor mailto: as a compose
  // intent by default, so the Inquire CTA opened Gmail without composing.
  // The form posts to /api/inquire which sends via Resend to the same
  // destination, with full lead capture. Covers every ads@/info@ alias
  // seen historically. Becomes a no-op once migrated.
  await sql`
    UPDATE ad_creatives
       SET click_url = 'https://realtynewsnow.app/advertise/inquire'
     WHERE click_url LIKE 'mailto:info@myrealtyline.com%'
        OR click_url LIKE 'mailto:ads@myrealtyline.com%'
        OR click_url LIKE 'mailto:ads@newslinesa.com%'
        OR click_url LIKE 'mailto:ads@realtynewsnow.app%'
  `;

  for (const ad of houseAds) {
    // Each slot gets its own inquiry URL so the form pre-fills the slot
    // label and the email subject reflects which placement was clicked.
    const clickUrl = `https://realtynewsnow.app/advertise/inquire?slot=${encodeURIComponent(ad.slug)}`;

    // 1. Creative (idempotent on advertiser_name + blob_url).
    const creativeRows = (await sql`
      WITH ins AS (
        INSERT INTO ad_creatives
          (advertiser_name, blob_url, width, height, click_url, alt_text, uploaded_by)
        SELECT 'RealtyLine House', ${ad.blob_url}, ${ad.width}, ${ad.height},
               ${clickUrl}, ${ad.alt}, 'system:house-ad-seed'
         WHERE NOT EXISTS (
           SELECT 1 FROM ad_creatives
            WHERE advertiser_name = 'RealtyLine House'
              AND blob_url = ${ad.blob_url}
         )
        RETURNING id
      )
      SELECT id FROM ins
      UNION ALL
      SELECT id FROM ad_creatives
       WHERE advertiser_name = 'RealtyLine House'
         AND blob_url = ${ad.blob_url}
       LIMIT 1
    `) as unknown as { id: string }[];

    const creativeId = creativeRows[0]?.id;
    if (!creativeId) continue;

    // 2. Campaign (idempotent on ad_space_slug + advertiser='RealtyLine House').
    await sql`
      INSERT INTO ad_campaigns
        (advertiser_name, ad_space_slug, creative_id, publication,
         start_date, end_date, active, price_notes, notes, created_by)
      SELECT 'RealtyLine House', ${ad.slug}, ${creativeId}::uuid, 'both',
             CURRENT_DATE, CURRENT_DATE + INTERVAL '5 years', TRUE,
             'house ad — no charge',
             'Auto-seeded house ad. Deactivate when a real advertiser is booked.',
             'system:house-ad-seed'
       WHERE NOT EXISTS (
         SELECT 1 FROM ad_campaigns
          WHERE ad_space_slug = ${ad.slug}
            AND advertiser_name = 'RealtyLine House'
       )
    `;
  }

  // ============================================================
  // Magazine hotspots (Phase 1 — May 27, 2026)
  // Clickable regions overlaid on magazine pages. Position stored
  // as fractions of natural page dims so they scale correctly
  // regardless of zoom, reader, or device. See lib/hotspots.ts
  // for type definitions. Click tracking feeds advertiser
  // performance reports (Phase 4).
  // ============================================================

  await sql`
    CREATE TABLE IF NOT EXISTS magazine_hotspots (
      id              BIGSERIAL PRIMARY KEY,
      magazine_id     INTEGER NOT NULL REFERENCES magazines(id) ON DELETE CASCADE,
      page_idx        INTEGER NOT NULL,
      x_frac          REAL NOT NULL CHECK (x_frac >= 0 AND x_frac <= 1),
      y_frac          REAL NOT NULL CHECK (y_frac >= 0 AND y_frac <= 1),
      w_frac          REAL NOT NULL CHECK (w_frac > 0 AND w_frac <= 1),
      h_frac          REAL NOT NULL CHECK (h_frac > 0 AND h_frac <= 1),
      type            TEXT NOT NULL CHECK (type IN (
                        'link', 'video', 'image', 'phone', 'email',
                        'form', 'mls', 'audio', 'reveal'
                      )),
      config          JSONB NOT NULL DEFAULT '{}'::jsonb,
      label           TEXT,
      advertiser_name TEXT,
      is_published    BOOLEAN NOT NULL DEFAULT false,
      created_by      TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by      TEXT,
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Phase 2.5: track how each hotspot was created.
  // 'manual' = drawn in the editor OR edited-from-import; 'pdf_import' = a
  // still-untouched extractor row eligible for wipe-and-reinsert on the next
  // Extract-all. On any human edit the row is promoted to 'manual' so it
  // survives future re-runs (see app/api/admin/hotspots/[id]/route.ts).
  await sql`
    ALTER TABLE magazine_hotspots
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
  `;

  // Origin flag: true if this row was ever created by the extractor pipeline,
  // even after being edited (source flips to 'manual' on edit, but this stays
  // true). Used by the admin editor to visually distinguish edited-imports
  // from truly hand-drawn hotspots.
  await sql`
    ALTER TABLE magazine_hotspots
    ADD COLUMN IF NOT EXISTS was_imported BOOLEAN NOT NULL DEFAULT FALSE
  `;
  // Backfill: every row currently marked source='pdf_import' was, by
  // definition, imported. Safe to run every boot — the WHERE keeps it O(0)
  // once each row's flag has been set.
  await sql`
    UPDATE magazine_hotspots
    SET was_imported = TRUE
    WHERE source = 'pdf_import' AND was_imported = FALSE
  `;

  // Option B: per-hotspot paint order within a page. Higher z_index paints on
  // top. Default 0 preserves creation order (ties broken by id). Editors
  // change this via bring-forward / send-backward controls; readers just
  // consume the order.
  await sql`
    ALTER TABLE magazine_hotspots
    ADD COLUMN IF NOT EXISTS z_index INTEGER NOT NULL DEFAULT 0
  `;

  // Fast lookup of published hotspots for a given magazine page.
  await sql`
    CREATE INDEX IF NOT EXISTS idx_hotspots_magazine_page
      ON magazine_hotspots(magazine_id, page_idx)
      WHERE is_published = true
  `;
  // For advertiser performance reports.
  await sql`
    CREATE INDEX IF NOT EXISTS idx_hotspots_advertiser
      ON magazine_hotspots(advertiser_name)
      WHERE advertiser_name IS NOT NULL
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS magazine_hotspot_clicks (
      id              BIGSERIAL PRIMARY KEY,
      hotspot_id      BIGINT NOT NULL REFERENCES magazine_hotspots(id) ON DELETE CASCADE,
      magazine_id     INTEGER NOT NULL REFERENCES magazines(id) ON DELETE CASCADE,
      page_idx        INTEGER NOT NULL,
      session_id      TEXT NOT NULL,
      user_agent      TEXT,
      referrer        TEXT,
      occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_clicks_hotspot
      ON magazine_hotspot_clicks(hotspot_id, occurred_at DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_clicks_magazine
      ON magazine_hotspot_clicks(magazine_id, occurred_at DESC)
  `;

  // ============================================================
  // -- Advertisers (Phase 3a) --
  // Normalizes the magazine_hotspots.advertiser_name string into a
  // first-class entity with stable slug + share token. Enables
  // per-advertiser analytics dashboards and link-shareable reports.
  // ============================================================
  await sql`
    CREATE TABLE IF NOT EXISTS advertisers (
      id                  SERIAL PRIMARY KEY,
      name                TEXT NOT NULL,
      slug                TEXT NOT NULL UNIQUE,
      share_token         TEXT NOT NULL UNIQUE,
      contact_email       TEXT,
      requires_email_gate BOOLEAN NOT NULL DEFAULT false,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_advertisers_slug ON advertisers(slug)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_advertisers_share_token ON advertisers(share_token)`;

  // Event submission token (separate from share_token so revoking event
  // submission privileges doesn't break magazine sharing). NULL until the
  // admin generates one for an advertiser; the public /submit-event/[token]
  // route 404s on NULL/unknown tokens.
  await sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS submission_token TEXT`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_advertisers_submission_token
    ON advertisers(submission_token) WHERE submission_token IS NOT NULL
  `;

  // Per-advertiser pick for the public detail page header layout.
  // Valid values are kept in lib/advertiser-header-styles.ts. We don't
  // CHECK the value at the DB level - the app coerces unknown values
  // back to 'current' on read so adding a new option doesn't require
  // a migration.
  await sql`
    ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS header_style TEXT NOT NULL DEFAULT 'current'
  `;

  // Per-advertiser default footer template applied to downloadable tools
  // (the /resources calculator PDFs today). Picker IDs live in
  // lib/footer-templates.ts; the app coerces unknown values back to
  // the default on read so adding a new template requires no migration.
  await sql`
    ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS footer_template TEXT NOT NULL DEFAULT 'split-column'
  `;
  await sql`
    ALTER TABLE advertisers ALTER COLUMN footer_template SET DEFAULT 'split-column'
  `;
  await sql`
    UPDATE advertisers
    SET footer_template = 'split-column'
    WHERE footer_template NOT IN ('split-column', 'minimal-rows')
  `;

  // Event-pipeline metadata (advertiser submissions + Gemini-detected from FB).
  // submitted_by_advertiser_id: links a row to the advertiser when source =
  //   'submission' (so the admin queue can show "Submitted by Austin Title").
  // confidence: Gemini's self-reported 0..1 confidence (only set for
  //   external_source='facebook-llm').
  // source_post_id: links a 'facebook-llm' event back to the
  //   featured_social_posts row it was extracted from (audit trail; also lets
  //   us skip already-scanned posts on the next cron tick).
  await sql`
    ALTER TABLE events
      ADD COLUMN IF NOT EXISTS submitted_by_advertiser_id INT REFERENCES advertisers(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS confidence REAL,
      ADD COLUMN IF NOT EXISTS source_post_id INT REFERENCES featured_social_posts(id) ON DELETE SET NULL
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_events_pending
    ON events(hidden, external_source) WHERE hidden = true
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_events_source_post
    ON events(source_post_id) WHERE source_post_id IS NOT NULL
  `;

  // ============================================================
  // Gmail event scanner (Path F)
  // Curated associations/boards whose mail we scan for events, plus the
  // OAuth token for the mailbox we read. Advertiser domains come from
  // advertisers.contact_email at scan time, so only non-advertiser
  // organizations need a row here.
  // No `events` DDL is needed for the new source — external_source is TEXT
  // and the review queue filters app-side.
  // ============================================================
  await sql`
    CREATE TABLE IF NOT EXISTS event_source_orgs (
      id                  SERIAL PRIMARY KEY,
      name                TEXT NOT NULL,
      domain              TEXT NOT NULL UNIQUE,
      default_publication TEXT NOT NULL,
      active              BOOLEAN NOT NULL DEFAULT true,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_event_source_orgs_active
    ON event_source_orgs(active) WHERE active = true
  `;

  // Seed the associations Tawanna already receives event mail from. Domain
  // is the unique key, so re-seeding is a no-op and an admin's later edit to
  // name/default_publication/active is never clobbered.
  for (const org of EVENT_SOURCE_ORG_SEEDS) {
    await sql`
      INSERT INTO event_source_orgs (name, domain, default_publication)
      VALUES (${org.name}, ${org.domain}, ${org.defaultPublication})
      ON CONFLICT (domain) DO NOTHING
    `;
  }

  // One row per connected mailbox. refresh_token is the long-lived grant;
  // access_token/token_expiry are a cache the client refreshes in place.
  await sql`
    CREATE TABLE IF NOT EXISTS gmail_oauth_tokens (
      id            SERIAL PRIMARY KEY,
      email_address TEXT NOT NULL UNIQUE,
      access_token  TEXT,
      refresh_token TEXT NOT NULL,
      token_expiry  TIMESTAMPTZ,
      scope         TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    ALTER TABLE magazine_hotspots
    ADD COLUMN IF NOT EXISTS advertiser_id INT REFERENCES advertisers(id) ON DELETE SET NULL
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_magazine_hotspots_advertiser
    ON magazine_hotspots(advertiser_id)
  `;

  // Backfill: link existing hotspots' advertiser_name to advertisers rows.
  // Idempotent — runs on every cold start, but only does work when there
  // are orphans (hotspots with a name string but no advertiser_id).
  try {
    const orphans = await sql`
      SELECT DISTINCT advertiser_name
      FROM magazine_hotspots
      WHERE advertiser_name IS NOT NULL
        AND TRIM(advertiser_name) != ''
        AND advertiser_id IS NULL
    `;
    for (const row of orphans as { advertiser_name: string }[]) {
      const name = (row.advertiser_name || '').trim();
      if (!name) continue;
      const slug = name
        .toLowerCase()
        .replace(/['"]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-')
        .slice(0, 80);
      if (!slug) continue;

      const deleted = (await sql`
        SELECT 1
        FROM advertiser_deletion_tombstones
        WHERE normalized_email IN (${`__slug__:${slug}`}, ${`__name__:${name.toLowerCase()}`})
           OR LOWER(COALESCE(original_slug, '')) = ${slug}
           OR LOWER(COALESCE(original_name, '')) = ${name.toLowerCase()}
        LIMIT 1
      `) as unknown as Array<{ '?column?': number }>;
      if (deleted.length > 0) continue;

      const existing = (await sql`
        SELECT id FROM advertisers WHERE slug = ${slug} LIMIT 1
      `) as unknown as { id: number }[];
      let advertiserId: number;
      if (existing.length > 0) {
        advertiserId = existing[0].id;
      } else {
        // Cheap token: 24 url-safe base64 chars. Crypto module imported lazily
        // to avoid bundling overhead on routes that don't need it.
        const { randomBytes } = await import('crypto');
        const token = randomBytes(18).toString('base64url');
        const inserted = (await sql`
          INSERT INTO advertisers (name, slug, share_token)
          VALUES (${name}, ${slug}, ${token})
          RETURNING id
        `) as unknown as { id: number }[];
        advertiserId = inserted[0].id;
      }
      await sql`
        UPDATE magazine_hotspots
        SET advertiser_id = ${advertiserId}
        WHERE advertiser_name = ${name} AND advertiser_id IS NULL
      `;
    }
  } catch (err) {
    // Don't fail schema ensure if backfill stumbles — log and continue.
    console.warn('[ensureSchema] advertiser backfill failed:', err);
  }

  // ============================================================
  // CRM bootstrap (Steps 1, 3, 4, 5 of PressBook CRM integration).
  // Idempotent: ALTER … ADD COLUMN IF NOT EXISTS, CREATE TABLE
  // IF NOT EXISTS, ON CONFLICT DO NOTHING. Pulled into a separate
  // module to keep this file readable. Self-heals admin pages so
  // they don't crash when the migrate-* POST routes haven't been
  // hit yet on a given environment.
  // ============================================================
  // ---- Agreements: link back to originating ad inquiry ----
  // Populated when an admin drafts a quote from an inquiry via
  // /api/admin/ads/inquiries/[id]/convert-to-agreement so the inquiry
  // status can follow the agreement lifecycle. Nullable — existing
  // Pressbook-imported agreements have no originating inquiry.
  await sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS linked_inquiry_id uuid`;
  await sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS preferred_send_dates jsonb`;
  await sql`
    CREATE INDEX IF NOT EXISTS agreements_linked_inquiry_idx
    ON agreements(linked_inquiry_id)
    WHERE linked_inquiry_id IS NOT NULL
  `;

  // ---- Agreement line items (bundled multi-channel quotes) ----
  // A single agreement can have N line items across channels. When no
  // rows exist, the agreement is a legacy single-line quote and the
  // parent columns (type, ad_rate_cents, amount_cents, etc.) carry the
  // full quote. When rows exist, the agreement is a bundle:
  //   • parent.type       = 'package'
  //   • parent.amount_cents = sum of children.amount_cents
  // Each child row carries its own channel + qty + rate metadata.
  await sql`
    CREATE TABLE IF NOT EXISTS agreement_line_items (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      agreement_id     uuid NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
      line_no          integer NOT NULL,
      channel          text NOT NULL,
      package_id       text NOT NULL,
      package_label    text NOT NULL,
      ad_size          text,
      frequency        text,
      quantity         integer NOT NULL DEFAULT 1,
      unit_cents       integer NOT NULL,
      amount_cents     integer NOT NULL,
      publication      text,
      start_date       date,
      end_date         date,
      pay_now          boolean NOT NULL DEFAULT true,
      meta             jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at       timestamptz NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS agreement_line_items_agreement_id_idx
    ON agreement_line_items(agreement_id)
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS agreement_line_items_agreement_line_uk
    ON agreement_line_items(agreement_id, line_no)
  `;

  // Print-line Insertion Order columns (idempotent — driven by AgreementDrawer parity).
  await sql`ALTER TABLE agreement_line_items ADD COLUMN IF NOT EXISTS ad_rate_cents         integer`;
  await sql`ALTER TABLE agreement_line_items ADD COLUMN IF NOT EXISTS ad_rate_base_cents    integer`;
  await sql`ALTER TABLE agreement_line_items ADD COLUMN IF NOT EXISTS discount_cents        integer`;
  await sql`ALTER TABLE agreement_line_items ADD COLUMN IF NOT EXISTS ad_premium_cents      integer`;
  await sql`ALTER TABLE agreement_line_items ADD COLUMN IF NOT EXISTS page_position         text`;
  await sql`ALTER TABLE agreement_line_items ADD COLUMN IF NOT EXISTS pos_premium_active    boolean NOT NULL DEFAULT false`;
  await sql`ALTER TABLE agreement_line_items ADD COLUMN IF NOT EXISTS ad_timing_months      jsonb`;
  await sql`ALTER TABLE agreement_line_items ADD COLUMN IF NOT EXISTS ad_timing_years       jsonb`;
  await sql`ALTER TABLE agreement_line_items ADD COLUMN IF NOT EXISTS total_monthly_cents   integer`;
  await sql`ALTER TABLE agreement_line_items ADD COLUMN IF NOT EXISTS expiration_date       date`;
  await sql`ALTER TABLE agreement_line_items ADD COLUMN IF NOT EXISTS renewal_reminder_date date`;
  await sql`ALTER TABLE agreement_line_items ADD COLUMN IF NOT EXISTS preferred_send_dates jsonb`;

  // ── One-time label backfill: 'Newsletter Banner' → 'e-Blast Top Banner'
  // on existing app placement line items (package_label + the nested
  // invoice_line.description in meta). Scoped to channel='app' +
  // package_id='newsletter_banner' so it never touches anything else.
  // Idempotent — the LIKE clauses make this a no-op once every row is
  // renamed. Runs on each cold start via the Vercel-managed DATABASE_URL
  // (Neon isn't standalone-connected here).
  await sql`
    UPDATE agreement_line_items
    SET package_label = REPLACE(package_label, 'Newsletter Banner', 'e-Blast Top Banner')
    WHERE channel = 'app'
      AND package_id = 'newsletter_banner'
      AND package_label LIKE 'Newsletter Banner%'
  `;
  await sql`
    UPDATE agreement_line_items
    SET meta = jsonb_set(
      meta,
      '{invoice_line,description}',
      to_jsonb(REPLACE(meta->'invoice_line'->>'description', 'Newsletter Banner', 'e-Blast Top Banner'))
    )
    WHERE channel = 'app'
      AND package_id = 'newsletter_banner'
      AND meta->'invoice_line'->>'description' LIKE 'Newsletter Banner%'
  `;

  // ---- Magazine GIF preview columns ----
  // Each magazine can have up to three pre-rendered animated previews
  // (full flipbook, teaser, ping-pong) stored in Vercel Blob. The URL
  // returned by the generator is cached here so subsequent share
  // requests don't re-render the GIF.
  await sql`ALTER TABLE magazines ADD COLUMN IF NOT EXISTS gif_full_url      TEXT`;
  await sql`ALTER TABLE magazines ADD COLUMN IF NOT EXISTS gif_teaser_url    TEXT`;
  await sql`ALTER TABLE magazines ADD COLUMN IF NOT EXISTS gif_pingpong_url  TEXT`;

  // ---- Per-publication settings ----
  // GA4 Measurement IDs (G-XXXXXXX) keyed by publication. The magazine
  // reader and index inject the matching tag based on the publication
  // of the issue being viewed.
  await sql`
    CREATE TABLE IF NOT EXISTS publication_settings (
      publication        TEXT PRIMARY KEY,
      ga_measurement_id  TEXT,
      created_at         TIMESTAMPTZ DEFAULT NOW(),
      updated_at         TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // Seed empty rows so the admin UI always has something to PATCH.
  await sql`
    INSERT INTO publication_settings (publication) VALUES ('austin')
    ON CONFLICT (publication) DO NOTHING
  `;
  await sql`
    INSERT INTO publication_settings (publication) VALUES ('san_antonio')
    ON CONFLICT (publication) DO NOTHING
  `;
  await sql`
    INSERT INTO publication_settings (publication) VALUES ('houston'), ('dallas')
    ON CONFLICT (publication) DO NOTHING
  `;

  await ensureCrmSchema(sql);
  await sql`
    ALTER TABLE advertisers
    ADD COLUMN IF NOT EXISTS publication TEXT NOT NULL DEFAULT 'austin'
  `;

  // Partner rows are business data, not schema. Do not seed, restore, or
  // backfill advertisers here: ensureSchema() runs during normal requests,
  // and doing so would resurrect records an admin intentionally deleted.
  // New agreement workflows call ensureAdvertiserForAgreement() directly;
  // historical backfills must remain explicit one-time admin operations.

  // Web push subscriptions. Stores each browser's PushSubscription so the
  // admin notification sender can fan out web_push deliveries. Tied to a
  // realtor when the user is signed in; allows multiple devices per realtor
  // (unique by endpoint). Anonymous subscriptions are permitted (realtor_id
  // NULL) so we can still reach a logged-out browser that opted in.
  await sql`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      realtor_id UUID REFERENCES realtors(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT,
      market TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS push_subscriptions_realtor_idx ON push_subscriptions(realtor_id)`;
  await sql`CREATE INDEX IF NOT EXISTS push_subscriptions_market_idx ON push_subscriptions(market)`;

  // Record-level push-service acceptance and click tallies on the
  // notification itself. We count push-service acceptance (not per-realtor
  // delivery rows) because anonymous opt-ins have no realtor_id and never
  // produced a notification_deliveries row, which left Delivered/Clicks at 0.
  // notifications is created out-of-band, so guard with IF EXISTS (no-op on a
  // fresh DB) and IF NOT EXISTS to stay idempotent on prod.
  await sql`ALTER TABLE IF EXISTS notifications ADD COLUMN IF NOT EXISTS delivered_count INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE IF EXISTS notifications ADD COLUMN IF NOT EXISTS clicked_count INTEGER NOT NULL DEFAULT 0`;

  // Native (iOS / Android) push tokens. Separate from push_subscriptions
  // because APNs/FCM tokens are opaque strings, not VAPID-encrypted
  // endpoints, and need a different sender library on the back end.
  await sql`
    CREATE TABLE IF NOT EXISTS native_push_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      realtor_id UUID REFERENCES realtors(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      platform TEXT NOT NULL CHECK (platform IN ('ios','android')),
      user_agent TEXT,
      market TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS native_push_tokens_realtor_idx ON native_push_tokens(realtor_id)`;
  await sql`CREATE INDEX IF NOT EXISTS native_push_tokens_market_idx ON native_push_tokens(market)`;
  await sql`CREATE INDEX IF NOT EXISTS native_push_tokens_platform_idx ON native_push_tokens(platform)`;

  // admin_jobs — background work queue for bulk admin operations that
  // can't finish synchronously inside an HTTP request (e.g. delete or
  // move thousands of mailing contacts). Routes enqueue a job here,
  // hand off processing to waitUntil(), and the UI polls
  // /api/admin/jobs/[id] for progress.
  await sql`
    CREATE TABLE IF NOT EXISTS admin_jobs (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      kind        TEXT NOT NULL,
      scope       JSONB NOT NULL,
      params      JSONB NOT NULL,
      status      TEXT NOT NULL DEFAULT 'queued',
      total       INTEGER,
      processed   INTEGER NOT NULL DEFAULT 0,
      error       TEXT,
      created_by  UUID,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at  TIMESTAMPTZ,
      finished_at TIMESTAMPTZ
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS admin_jobs_status_idx ON admin_jobs(status, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS admin_jobs_created_by_idx ON admin_jobs(created_by, created_at DESC)`;

  // ---- email_verifications -------------------------------------------
  // Unified lookup keyed by lower(email). Any admin table (mailing_contacts,
  // realtors, newsletter_subscribers) can LEFT JOIN on lower(email) to
  // render a status badge without owning the verification machinery itself.
  // Status values:
  //   'valid'         — deliverable
  //   'invalid'       — bounced / rejected / undeliverable
  //   'risky'         — catch-all, role-based, full-mailbox, greylist
  //   'unknown'       — verifier timed out / inconclusive
  //   'pending'       — queued, not yet verified
  await sql`
    CREATE TABLE IF NOT EXISTS email_verifications (
      email        TEXT PRIMARY KEY,
      status       TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('valid','invalid','risky','unknown','pending')),
      sub_status   TEXT,
      provider     TEXT NOT NULL DEFAULT 'smtp',
      verified_at  TIMESTAMPTZ,
      risk_score   INTEGER,
      raw          JSONB,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS email_verifications_status_idx ON email_verifications(status)`;
  await sql`CREATE INDEX IF NOT EXISTS email_verifications_verified_at_idx ON email_verifications(verified_at)`;

  // ---- email_suppressions ----------------------------------------------
  // Permanent-delete tombstone keyed by lower(email). When an admin
  // deletes a contact from the Mailing Hub we write a row here so:
  //   1. The publication-list / counts views exclude the email forever.
  //   2. The holding-stage upsert (ABOR / SABOR scraper) skips it on
  //      every subsequent sync, instead of silently re-inserting it.
  //   3. Public subscribe / signup endpoints can refuse to re-add it.
  //
  // The table snapshots the source row's table + id at the moment of
  // deletion so a human can later see WHERE the email used to live and,
  // if needed, remove the suppression to allow re-onboarding.
  await sql`
    CREATE TABLE IF NOT EXISTS email_suppressions (
      email           TEXT PRIMARY KEY,
      reason          TEXT NOT NULL DEFAULT 'admin_delete',
      source_table    TEXT,
      source_id       TEXT,
      source_snapshot JSONB,
      suppressed_by   TEXT,
      suppressed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS email_suppressions_suppressed_at_idx ON email_suppressions(suppressed_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS email_suppressions_reason_idx ON email_suppressions(reason)`;

  // ---- giveaway_rules.deadline_at ----------------------------------------
  // Optional per-rule cutoff. When set, autoEnrollSignupGiveaways() only
  // creates the entry if NOW() <= deadline_at. Used for "early bird" bonus
  // entries (e.g. "sign up before July 27 for a second ticket").
  await sql`ALTER TABLE giveaway_rules ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMPTZ`;

  // ---- Seed signup rules for the active giveaway --------------------------
  // One-time idempotent seed: two signup rules on the giveaway
  // 2c3b73cf-4889-4a63-b14c-093d1aa0b966 so newly-verified accounts are
  // auto-enrolled. Rule 1 = base entry (1 ticket). Rule 2 = early-bird bonus
  // (1 extra ticket, deadline July 27 11:59 PM CDT = 2026-07-28T04:59:00Z).
  // Re-running is a no-op: each INSERT is guarded by NOT EXISTS on label.
  await sql`
    INSERT INTO giveaway_rules (giveaway_id, action_type, label, target_url, tickets, sort_order, required, deadline_at)
    SELECT
      '2c3b73cf-4889-4a63-b14c-093d1aa0b966',
      'signup',
      'Sign up for a free Realty News Now account',
      NULL,
      1,
      0,
      true,
      NULL
    WHERE NOT EXISTS (
      SELECT 1 FROM giveaway_rules
      WHERE giveaway_id = '2c3b73cf-4889-4a63-b14c-093d1aa0b966'
        AND action_type = 'signup'
        AND label = 'Sign up for a free Realty News Now account'
    )
  `;
  await sql`
    INSERT INTO giveaway_rules (giveaway_id, action_type, label, target_url, tickets, sort_order, required, deadline_at)
    SELECT
      '2c3b73cf-4889-4a63-b14c-093d1aa0b966',
      'signup',
      'Early bird bonus — sign up by 11:59 PM on July 27 for a second entry',
      NULL,
      1,
      1,
      false,
      '2026-07-28T04:59:00Z'
    WHERE NOT EXISTS (
      SELECT 1 FROM giveaway_rules
      WHERE giveaway_id = '2c3b73cf-4889-4a63-b14c-093d1aa0b966'
        AND action_type = 'signup'
        AND deadline_at IS NOT NULL
    )
  `;
  // Idempotent label sync — keeps the early-bird rule text precise even
  // if the row was seeded with an older label in a prior deploy.
  await sql`
    UPDATE giveaway_rules
    SET label = 'Early bird bonus — sign up by 11:59 PM on July 27 for a second entry',
        deadline_at = '2026-07-28T04:59:00Z',
        tickets = 1,
        sort_order = 1,
        required = false
    WHERE giveaway_id = '2c3b73cf-4889-4a63-b14c-093d1aa0b966'
      AND action_type = 'signup'
      AND deadline_at IS NOT NULL
  `;

  // ── One-time backfill: enroll all existing subscribers into signup-rule
  //    giveaways.  Idempotent via ON CONFLICT — a no-op after the first run.
  //    Matches autoEnrollSignupGiveaways logic (publication scope + deadline)
  //    but without the active/date filters so draft giveaways are covered too.
  try {
    await sql`
      INSERT INTO giveaway_entries (giveaway_id, realtor_id, rule_id)
      SELECT gr.giveaway_id, r.id, gr.id
      FROM giveaway_rules gr
      JOIN giveaways g ON g.id = gr.giveaway_id
      CROSS JOIN realtors r
      WHERE gr.action_type = 'signup'
        AND (gr.deadline_at IS NULL OR gr.deadline_at >= NOW())
        AND (g.publication = r.market OR g.publication = 'both' OR r.market = 'both')
      ON CONFLICT (giveaway_id, realtor_id, rule_id) DO NOTHING
    `;
  } catch (err) {
    console.warn('[ensureSchema] giveaway signup backfill failed:', err);
  }
}
