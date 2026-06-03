// caxton-events-v1
// Postgres client for the events feature. Connects to Vercel Postgres (Neon
// under the hood) using the auto-injected DATABASE_URL or POSTGRES_URL env
// var. Schema is created on first read/write — no separate migration step.

import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { ensureCrmSchema } from './crm-schema';

let cached: NeonQueryFunction<false, false> | null = null;
let schemaEnsured = false;

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

  // Pre-populate the 15 ad spaces (catalog). Idempotent: ON CONFLICT DO NOTHING
  // means re-running ensureSchema() doesn't disturb anything.
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
      display_name: 'Newsletter Banner',
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
      ON CONFLICT (slug) DO NOTHING
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
     * Override the destination email. Defaults to ads@realtynewsnow.app.
     * Article-reader slots use ads@myrealtyline.com to match the existing
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
      email: 'ads@myrealtyline.com',
    },
    {
      slug: 'article_mid_inline',
      blob_url: '/ads/house-article-mid-inline.svg',
      width: 600,
      height: 300,
      alt: 'Advertise in RealtyLine — Reach 71,000+ Texas REALTORS',
      subject: 'Article Mid-Inline inquiry',
      email: 'ads@myrealtyline.com',
    },
    {
      slug: 'article_interstitial',
      blob_url: '/ads/house-article-interstitial.svg',
      width: 288,
      height: 200,
      alt: 'Advertise in RealtyLine — dismissable popup',
      subject: 'Article Interstitial inquiry',
      email: 'ads@myrealtyline.com',
    },
  ];

  for (const ad of houseAds) {
    const destEmail = ad.email ?? 'ads@realtynewsnow.app';
    const clickUrl = `mailto:${destEmail}?subject=${encodeURIComponent(ad.subject)}`;

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
  // 'manual' = drawn in the editor; 'pdf_import' = extracted from embedded PDF links.
  // Re-importing PDF links deletes existing 'pdf_import' rows but never touches 'manual'.
  await sql`
    ALTER TABLE magazine_hotspots
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
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
  await ensureCrmSchema(sql);

  schemaEnsured = true;
}
