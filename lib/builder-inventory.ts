// lib/builder-inventory.ts
// Builder Inventory & Promotions data layer.
// Reads/writes to Neon `builder_inventory` table.
//
// Migrations are tracked in a `schema_migrations` table (per Session 9 GOTCHAS:
// don't use module-level "*Ensured" boolean flags — they short-circuit on warm
// function instances when the migration code changes between deploys).
//
// Session 13 (per-home pivot): added address, ready_date, plan_name,
// community_name, home_type columns. A row in this table can now represent
// either a specific home (home_type='showcase' or 'plan') or a community
// summary (home_type='community') or a human-submitted listing
// (home_type='listing' or NULL, for backward compat with rows pre-S13).
// The public listing groups rows by community_name when set, falling back
// to title-only when null.

import { neon } from '@neondatabase/serverless';
import type { CommunityData } from './scrapers/david-weekley';

const sql = neon(process.env.DATABASE_URL!);

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export type Kind = 'listing' | 'promotion';
// Re-export from lib/types/ — Single Source of Truth.
import type { BuilderInventoryStatus } from './types/builder-inventory';
export type Status = BuilderInventoryStatus;
;
;
// Publication scope for a builder_inventory row. Mirrors the CHECK
// constraint in the table (see migration 2026_06_15__widen_builder_inventory_publication_check).
// 'both' covers Austin + San Antonio (the original launched markets). Pre-launch
// pubs are listed here so admins can flag builder submissions for Houston/Dallas
// inventory ahead of those markets going live.
export type Publication =
  | 'realtyline'
  | 'newsline'
  | 'realtyline-houston'
  | 'realtyline-dallas'
  | 'both';
export type PromoType =
  | 'rate_buydown'
  | 'incentive'
  | 'event'
  | 'broker_bonus'
  | 'other';

// What kind of row this represents (S13):
// - 'showcase'  → a specific move-in-ready inventory home with an address
// - 'plan'      → a build-to-order floor plan offered at a community
// - 'community' → an aggregated community summary (the pre-S13 design;
//                 still used by builders whose APIs only expose this level)
// - 'listing'   → a human-submitted listing through the admin form
export type HomeType = 'plan' | 'showcase' | 'community' | 'listing';

export type BuilderInventoryRow = {
  id: number;
  createdAt: string;
  reviewedAt: string | null;
  kind: Kind;
  status: Status;
  featured: boolean;
  publication: Publication;
  submittedByName: string;
  submittedByEmail: string;
  submittedByPhone: string | null;
  builderName: string;
  title: string;
  city: string;
  state: string;
  description: string | null;
  bedsMin: number | null;
  bedsMax: number | null;
  bathsMin: number | null;
  bathsMax: number | null;
  sqftMin: number | null;
  sqftMax: number | null;
  priceMin: number | null;
  priceMax: number | null;
  promoType: PromoType | null;
  startsAt: string | null;
  expiresAt: string | null;
  sourceUrl: string | null;
  tags: string[] | null;
  flyerPdfUrl: string | null;
  thumbnailUrl: string | null;
  sourceIp: string | null;
  userAgent: string | null;
  reviewedBy: string | null;
  externalId: string | null;
  // S13 per-home additions:
  address: string | null;
  readyDate: string | null;
  planName: string | null;
  communityName: string | null;
  homeType: HomeType | null;
  // S13 gallery (KB Home multi-image rotation):
  galleryUrls: string[] | null;
  // Structured community page data (David Weekley backfill): plans,
  // amenities, schools, tax, sales office, gallery, lifecycle status.
  communityData: CommunityData | null;
  // Structured key/value details scraped from the builder's listing page
  // (county, school district, MLS, foundation, owner's suite, etc.).
  extraDetails: Record<string, string> | null;
  // Developer name (for master-planned communities like Santa Rita Ranch).
  // NULL for builder rows. When set, builder_name holds the developer name
  // and individual builders appear in the title/communityData.
  developerName: string | null;
};

export type CreateBuilderInventoryInput = {
  kind: Kind;
  publication: Publication;
  submittedByName: string;
  submittedByEmail: string;
  submittedByPhone?: string | null;
  builderName: string;
  title: string;
  city: string;
  state?: string;
  description?: string | null;
  bedsMin?: number | null;
  bedsMax?: number | null;
  bathsMin?: number | null;
  bathsMax?: number | null;
  sqftMin?: number | null;
  sqftMax?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  promoType?: PromoType | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  sourceUrl?: string | null;
  tags?: string[] | null;
  flyerPdfUrl?: string | null;
  thumbnailUrl?: string | null;
  sourceIp?: string | null;
  userAgent?: string | null;
  externalId?: string | null;
  // S13 per-home additions:
  address?: string | null;
  readyDate?: string | null;
  planName?: string | null;
  communityName?: string | null;
  homeType?: HomeType | null;
  // S13 gallery:
  galleryUrls?: string[] | null;
  communityData?: CommunityData | null;
  extraDetails?: Record<string, string> | null;
  developerName?: string | null;
};

// ─────────────────────────────────────────────────────────────────────────
// Migration runner — schema_migrations table is the source of truth.
// ─────────────────────────────────────────────────────────────────────────

type Migration = { name: string; up: () => Promise<void> };

const MIGRATIONS: Migration[] = [
  {
    name: '2026_05_12__create_schema_migrations',
    up: async () => {
      // Idempotent — bootstraps the migrations table itself.
      await sql`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          name       TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
    },
  },
  {
    name: '2026_05_12__create_builder_inventory',
    up: async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS builder_inventory (
          id              SERIAL PRIMARY KEY,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          reviewed_at     TIMESTAMPTZ,
          kind            TEXT NOT NULL CHECK (kind IN ('listing','promotion')),
          status          TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','active','rejected')),
          featured        BOOLEAN NOT NULL DEFAULT FALSE,
          publication     TEXT NOT NULL
                          CHECK (publication IN ('realtyline','newsline','both')),
          submitted_by_name   TEXT NOT NULL,
          submitted_by_email  TEXT NOT NULL,
          submitted_by_phone  TEXT,
          builder_name    TEXT NOT NULL,
          title           TEXT NOT NULL,
          city            TEXT NOT NULL,
          state           TEXT NOT NULL DEFAULT 'TX',
          description     TEXT,
          beds_min        INT,
          beds_max        INT,
          baths_min       NUMERIC(3,1),
          baths_max       NUMERIC(3,1),
          sqft_min        INT,
          sqft_max        INT,
          price_min       INT,
          price_max       INT,
          promo_type      TEXT,
          expires_at      DATE,
          tags            TEXT[],
          flyer_pdf_url   TEXT,
          thumbnail_url   TEXT,
          source_ip       TEXT,
          user_agent      TEXT,
          reviewed_by     TEXT
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_builder_inv_kind_status
                ON builder_inventory (kind, status)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_builder_inv_publication
                ON builder_inventory (publication, status)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_builder_inv_featured
                ON builder_inventory (featured) WHERE featured = TRUE`;
      await sql`CREATE INDEX IF NOT EXISTS idx_builder_inv_created
                ON builder_inventory (created_at DESC)`;
    },
  },
  {
    name: '2026_05_12__create_thumbnail_jobs',
    up: async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS thumbnail_jobs (
          id              SERIAL PRIMARY KEY,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          started_at      TIMESTAMPTZ,
          completed_at    TIMESTAMPTZ,
          inventory_id    INT NOT NULL REFERENCES builder_inventory(id) ON DELETE CASCADE,
          pdf_url         TEXT NOT NULL,
          status          TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','processing','done','failed')),
          attempts        INT NOT NULL DEFAULT 0,
          last_error      TEXT,
          worker_id       TEXT
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_thumb_jobs_pending
                ON thumbnail_jobs (created_at)
                WHERE status = 'pending'`;
      await sql`CREATE INDEX IF NOT EXISTS idx_thumb_jobs_inventory
                ON thumbnail_jobs (inventory_id)`;
    },
  },
  {
    name: '2026_05_12__add_builder_inventory_external_id',
    up: async () => {
      await sql`ALTER TABLE builder_inventory
                ADD COLUMN IF NOT EXISTS external_id TEXT`;
      // Partial unique index: human-submitted rows have NULL external_id
      // (no collision possible); scraper rows must be unique per builder.
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_builder_inventory_external
                ON builder_inventory (builder_name, external_id)
                WHERE external_id IS NOT NULL`;
    },
  },
  {
    name: '2026_05_13__add_per_home_fields',
    up: async () => {
      // S13 per-home pivot. Existing rows get NULLs; new scraper runs
      // will populate. CHECK constraint added separately so it can be
      // tolerant of legacy NULL values.
      await sql`ALTER TABLE builder_inventory
                ADD COLUMN IF NOT EXISTS address        TEXT`;
      await sql`ALTER TABLE builder_inventory
                ADD COLUMN IF NOT EXISTS ready_date     DATE`;
      await sql`ALTER TABLE builder_inventory
                ADD COLUMN IF NOT EXISTS plan_name      TEXT`;
      await sql`ALTER TABLE builder_inventory
                ADD COLUMN IF NOT EXISTS community_name TEXT`;
      await sql`ALTER TABLE builder_inventory
                ADD COLUMN IF NOT EXISTS home_type      TEXT`;

      // Add CHECK separately to allow NULLs for legacy rows.
      // Drop-then-add pattern means the migration is idempotent if rerun
      // against a partial state (e.g., constraint dropped manually).
      await sql`ALTER TABLE builder_inventory
                DROP CONSTRAINT IF EXISTS chk_builder_inv_home_type`;
      await sql`ALTER TABLE builder_inventory
                ADD CONSTRAINT chk_builder_inv_home_type
                CHECK (home_type IS NULL OR
                       home_type IN ('plan','showcase','community','listing'))`;

      // Index supports the public listing's GROUP BY community_name.
      await sql`CREATE INDEX IF NOT EXISTS idx_builder_inv_community
                ON builder_inventory (builder_name, community_name)
                WHERE community_name IS NOT NULL`;
    },
  },
  {
    name: '2026_05_14__add_promo_fields',
    up: async () => {
      await sql`ALTER TABLE builder_inventory
                ADD COLUMN IF NOT EXISTS starts_at DATE`;
      await sql`ALTER TABLE builder_inventory
                ADD COLUMN IF NOT EXISTS source_url TEXT`;
    },
  },
  {
    name: '2026_05_13__add_gallery_urls',
    up: async () => {
      // S13: multi-image gallery for visual variety on cards.
      // KB Home sells multiple collections under one community URL — they
      // all share og:image, so we collect every hero <img> as a gallery
      // and pick a different one per card via deterministic hash.
      await sql`ALTER TABLE builder_inventory
                ADD COLUMN IF NOT EXISTS gallery_urls TEXT[]`;
    },
  },
  {
    // Phase 2 PR C: widen the publication CHECK to allow the pre-launch
    // markets (realtyline-houston, realtyline-dallas). The old constraint
    // only allowed realtyline/newsline/both — once admins start submitting
    // builder rows scoped to Houston/Dallas the INSERT would fail with a
    // CHECK violation. We DROP the old constraint by name then ADD the new
    // one. The constraint name is what Postgres assigns by default when a
    // CHECK is declared inline on a column (table_column_check) — we look
    // it up dynamically to stay portable across managed Postgres providers.
    name: '2026_06_15__widen_builder_inventory_publication_check',
    up: async () => {
      // Find the existing CHECK constraint on the publication column. There's
      // exactly one inline CHECK that mentions 'realtyline', 'newsline', and
      // 'both' together.
      const rows = (await sql`
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'builder_inventory'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%publication%'
          AND pg_get_constraintdef(oid) ILIKE '%realtyline%'
          AND pg_get_constraintdef(oid) ILIKE '%newsline%'
      `) as { conname: string }[];
      for (const r of rows) {
        // Identifier interpolation isn't supported by the tagged template;
        // constraint names from pg_constraint are safe (no quoting needed
        // for default-generated names) but we still wrap defensively.
        await sql.query(
          `ALTER TABLE builder_inventory DROP CONSTRAINT IF EXISTS "${r.conname}"`,
        );
      }
      await sql`
        ALTER TABLE builder_inventory
        ADD CONSTRAINT builder_inventory_publication_check
        CHECK (publication IN (
          'realtyline',
          'newsline',
          'realtyline-houston',
          'realtyline-dallas',
          'both'
        ))
      `;
    },
  },
  {
    // Add 'expired' to the status CHECK constraint so the auto-expire
    // cron can flip promos whose expires_at has passed. Public reads still
    // filter to status='active' so expired rows disappear from the feed
    // automatically. Admin can review them under the new Expired tab.
    name: '2026_06_22__add_status_expired',
    up: async () => {
      const checks = (await sql`
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'builder_inventory'::regclass
          AND conname LIKE '%status%check%'
      `) as { conname: string }[];
      for (const r of checks) {
        await sql.query(
          `ALTER TABLE builder_inventory DROP CONSTRAINT IF EXISTS "${r.conname}"`,
        );
      }
      await sql`
        ALTER TABLE builder_inventory
        ADD CONSTRAINT builder_inventory_status_check
        CHECK (status IN ('pending','active','rejected','expired'))
      `;
      // Index to make the hourly auto-expire scan cheap. Only indexes
      // active promotions with a non-null expiry — the only rows the cron
      // ever needs to look at.
      await sql`CREATE INDEX IF NOT EXISTS idx_builder_inv_promo_expiry
                ON builder_inventory (expires_at)
                WHERE kind = 'promotion'
                  AND status = 'active'
                  AND expires_at IS NOT NULL`;
    },
  },
  {
    name: '2026_07_23__add_community_data',
    up: async () => {
      // Structured David Weekley community page data: home plans, amenities,
      // schools, tax info, sales office + driving directions, gallery, and
      // lifecycle status (coming-soon / close-out / adult-only). Backfilled by
      // the scrape-david-weekley cron.
      await sql`ALTER TABLE builder_inventory
                ADD COLUMN IF NOT EXISTS community_data JSONB`;
    },
  },
  {
    name: '2026_07_23__add_extra_details',
    up: async () => {
      // Structured key/value details scraped from builder listing pages
      // (e.g. M/I Homes "Additional Details": county, school district, MLS
      // number, foundation, owner's suite, homesite, plan dimensions).
      // JSONB so each builder can surface different keys without a schema
      // change per field.
      await sql`ALTER TABLE builder_inventory
                ADD COLUMN IF NOT EXISTS extra_details JSONB`;
    },
  },
  {
    name: '2026_07_24__create_builder_page_visibility',
    up: async () => {
      // Per-builder public visibility toggle. When public_enabled=false,
      // the builder's pages are hidden from the public site (builders hub,
      // builder detail, inventory, communities, individual listing pages)
      // while its rows remain in builder_inventory. Controlled from
      // /admin/inventory/builders. Scraper/prune behavior is unchanged —
      // visibility is public-display state only.
      await sql`
        CREATE TABLE IF NOT EXISTS builder_page_visibility (
          builder_name    TEXT PRIMARY KEY,
          public_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      // Seed Newmark Homes hidden. ON CONFLICT DO NOTHING (not DO UPDATE)
      // so a later admin re-enable is never clobbered by a redeploy.
      await sql`
        INSERT INTO builder_page_visibility (builder_name, public_enabled)
        VALUES ('Newmark Homes', FALSE)
        ON CONFLICT (builder_name) DO NOTHING
      `;
    },
  },
  {
    name: '2026_07_26__add_developer_name',
    up: async () => {
      // Developers (master-planned communities like Santa Rita Ranch, La Cima)
      // aggregate many builders within their community. builder_name still holds
      // the developer name for backwards compat, but developer_name marks
      // which rows belong to a developer vs a builder. NULL = builder row.
      await sql`ALTER TABLE builder_inventory
                ADD COLUMN IF NOT EXISTS developer_name TEXT`;
      // Backfill existing developer rows.
      await sql`UPDATE builder_inventory
                SET developer_name = builder_name
                WHERE builder_name IN ('Santa Rita Ranch', 'La Cima')
                  AND developer_name IS NULL`;
      // Index for filtering developer vs builder rows.
      await sql`CREATE INDEX IF NOT EXISTS idx_builder_inv_developer
                ON builder_inventory (developer_name)
                WHERE developer_name IS NOT NULL`;
    },
  },
];

// Per-process cache: "the current MIGRATIONS array is fully applied in the DB."
// Source of truth is the schema_migrations table; this just skips the SELECT.
//
// Why a cache KEY (string) instead of a boolean (FOLLOW_UPS #31, #40):
// A permanent boolean=true short-circuits forever once set. Any migration added
// by a subsequent deploy is silently skipped on warm Vercel instances that
// already cached true. This bug bit twice in Sessions 9 and 10. The cache key
// here is derived from the current MIGRATIONS array contents, so it invalidates
// automatically when the array changes (i.e., when a new deploy adds entries),
// forcing re-verification. Zero overhead on warm hits when the schema is
// already current.
let migrationsVerifiedKey = '';

export async function ensureBuilderInventorySchema(): Promise<void> {
  const currentKey = MIGRATIONS.map((m) => m.name).join('|');
  if (migrationsVerifiedKey === currentKey) return;

  // Bootstrap: create schema_migrations if it doesn't exist.
  await MIGRATIONS[0].up();

  // Read what's already been applied.
  const applied = (await sql`SELECT name FROM schema_migrations`) as { name: string }[];
  const appliedSet = new Set(applied.map((r) => r.name));

  // Apply any missing migrations.
  for (const m of MIGRATIONS) {
    if (appliedSet.has(m.name)) continue;
    await m.up();
    await sql`INSERT INTO schema_migrations (name) VALUES (${m.name})
              ON CONFLICT (name) DO NOTHING`;
  }

  migrationsVerifiedKey = currentKey;
}

// ─────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────

// Neon returns JSONB as a parsed object over the HTTP driver, but some
// drivers/contexts return a string — handle both.
function parseCommunityData(v: unknown): CommunityData | null {
  if (v == null) return null;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as CommunityData;
    } catch {
      return null;
    }
  }
  if (typeof v === 'object') return v as CommunityData;
  return null;
}

// JSONB extra_details: label -> value map (county, school district, MLS, ...).
function parseExtraDetails(v: unknown): Record<string, string> | null {
  if (v == null) return null;
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v);
      return p && typeof p === 'object' ? (p as Record<string, string>) : null;
    } catch {
      return null;
    }
  }
  if (typeof v === 'object') return v as Record<string, string>;
  return null;
}

function rowToBuilderInventoryRow(r: Record<string, unknown>): BuilderInventoryRow {
  return {
    id: r.id as number,
    createdAt: r.created_at as string,
    reviewedAt: (r.reviewed_at as string) ?? null,
    kind: r.kind as Kind,
    status: r.status as Status,
    featured: r.featured as boolean,
    publication: r.publication as Publication,
    submittedByName: r.submitted_by_name as string,
    submittedByEmail: r.submitted_by_email as string,
    submittedByPhone: (r.submitted_by_phone as string) ?? null,
    builderName: r.builder_name as string,
    title: r.title as string,
    city: r.city as string,
    state: r.state as string,
    description: (r.description as string) ?? null,
    bedsMin: (r.beds_min as number) ?? null,
    bedsMax: (r.beds_max as number) ?? null,
    bathsMin: r.baths_min != null ? Number(r.baths_min) : null,
    bathsMax: r.baths_max != null ? Number(r.baths_max) : null,
    sqftMin: (r.sqft_min as number) ?? null,
    sqftMax: (r.sqft_max as number) ?? null,
    priceMin: (r.price_min as number) ?? null,
    priceMax: (r.price_max as number) ?? null,
    promoType: (r.promo_type as PromoType) ?? null,
    startsAt: (r.starts_at as string) ?? null,
    expiresAt: (r.expires_at as string) ?? null,
    sourceUrl: (r.source_url as string) ?? null,
    tags: (r.tags as string[]) ?? null,
    flyerPdfUrl: (r.flyer_pdf_url as string) ?? null,
    thumbnailUrl: (r.thumbnail_url as string) ?? null,
    sourceIp: (r.source_ip as string) ?? null,
    userAgent: (r.user_agent as string) ?? null,
    reviewedBy: (r.reviewed_by as string) ?? null,
    externalId: (r.external_id as string) ?? null,
    // S13 per-home additions:
    address: (r.address as string) ?? null,
    readyDate: (r.ready_date as string) ?? null,
    planName: (r.plan_name as string) ?? null,
    communityName: (r.community_name as string) ?? null,
    homeType: (r.home_type as HomeType) ?? null,
    galleryUrls: (r.gallery_urls as string[]) ?? null,
    communityData: parseCommunityData(r.community_data),
    extraDetails: parseExtraDetails(r.extra_details),
    developerName: (r.developer_name as string) ?? null,
  };
}

export async function createBuilderInventory(
  input: CreateBuilderInventoryInput,
): Promise<BuilderInventoryRow> {
  await ensureBuilderInventorySchema();

  const rows = (await sql`
    INSERT INTO builder_inventory (
      kind, publication,
      submitted_by_name, submitted_by_email, submitted_by_phone,
      builder_name, title, city, state, description,
      beds_min, beds_max, baths_min, baths_max,
      sqft_min, sqft_max, price_min, price_max,
      promo_type, starts_at, expires_at, source_url, tags,
      flyer_pdf_url, thumbnail_url,
      source_ip, user_agent,
      external_id,
      address, ready_date, plan_name, community_name, home_type,
      gallery_urls, community_data, extra_details, developer_name
    ) VALUES (
      ${input.kind}, ${input.publication},
      ${input.submittedByName}, ${input.submittedByEmail}, ${input.submittedByPhone ?? null},
      ${input.builderName}, ${input.title}, ${input.city}, ${input.state ?? 'TX'}, ${input.description ?? null},
      ${input.bedsMin ?? null}, ${input.bedsMax ?? null}, ${input.bathsMin ?? null}, ${input.bathsMax ?? null},
      ${input.sqftMin ?? null}, ${input.sqftMax ?? null}, ${input.priceMin ?? null}, ${input.priceMax ?? null},
      ${input.promoType ?? null}, ${input.startsAt ?? null}, ${input.expiresAt ?? null}, ${input.sourceUrl ?? null}, ${input.tags ?? null},
      ${input.flyerPdfUrl ?? null}, ${input.thumbnailUrl ?? null},
      ${input.sourceIp ?? null}, ${input.userAgent ?? null},
      ${input.externalId ?? null},
      ${input.address ?? null}, ${input.readyDate ?? null},
      ${input.planName ?? null}, ${input.communityName ?? null},
${input.homeType ?? null},
      ${(input.galleryUrls ?? null) as string[] | null},
      ${input.communityData != null ? JSON.stringify(input.communityData) : null}::jsonb,
      ${input.extraDetails != null ? JSON.stringify(input.extraDetails) : null}::jsonb,
      ${input.developerName ?? null}
    )
    RETURNING *
  `) as Record<string, unknown>[];

  return rowToBuilderInventoryRow(rows[0]);
}

export type ListBuilderInventoryFilters = {
  publication?: Publication | 'all';
  kind?: Kind;
  status?: Status;
  builderName?: string;
  featured?: boolean;
  limit?: number;
  // S13: filter by home_type. Either an exact match, or the special
  // 'isNullOrCommunity' which matches legacy NULL rows + community summaries
  // (use this for the /communities public page).
  homeType?: HomeType | 'isNullOrCommunity';
  // When true, include builders whose public pages are disabled
  // (builder_page_visibility.public_enabled=false). Default false =
  // public-safe: disabled builders are hidden from every public surface.
  // Admin inventory routes pass true so retained data stays visible in admin.
  includeDisabledBuilders?: boolean;
  // Filter by developer_name. Pass a specific developer name to get only
  // rows belonging to that developer. Pass 'all' to get all rows (including
  // developer rows). When omitted/undefined, no developer_name filter is
  // applied (returns both builder and developer rows).
  developerName?: string | null;
  // When true, return only rows where developer_name IS NOT NULL
  // (developer entries only). When false, only builder rows (NULL).
  isDeveloper?: boolean;
};

export async function listBuilderInventory(
  filters: ListBuilderInventoryFilters = {},
): Promise<BuilderInventoryRow[]> {
  await ensureBuilderInventorySchema();

  // Build WHERE clauses defensively — neon's template literal SQL handles
  // injection safety on values, but we need to be careful with conditional
  // composition. Use a single CASE-shaped query for clarity.
  const pub = filters.publication ?? 'all';
  const kind = filters.kind ?? null;
  const status = filters.status ?? null;
  const builder = filters.builderName ?? null;
  const featured = filters.featured ?? null;
  const limit = Math.min(filters.limit ?? 100, 5000);

  // S13: home_type filter dispatch.
  const homeType = filters.homeType ?? null;
  const homeTypeIsNullOrCommunity = homeType === 'isNullOrCommunity';
  const homeTypeExact =
    homeType && homeType !== 'isNullOrCommunity' ? homeType : null;
  const includeDisabled = filters.includeDisabledBuilders ?? false;
  const developerName = filters.developerName ?? null;
  const isDeveloper = filters.isDeveloper ?? null;

  const rows = (await sql`
    SELECT b.* FROM builder_inventory b
    LEFT JOIN builder_page_visibility v ON v.builder_name = b.builder_name
    WHERE
      (${pub} = 'all'
        OR b.publication = ${pub}::text
        OR b.publication = 'both')
      AND (${kind}::text IS NULL OR b.kind = ${kind}::text)
      AND (${status}::text IS NULL OR b.status = ${status}::text)
      AND (${builder}::text IS NULL OR b.builder_name = ${builder}::text)
      AND (${featured}::boolean IS NULL OR b.featured = ${featured}::boolean)
      AND (${homeTypeIsNullOrCommunity}::boolean = false
           OR b.home_type IS NULL OR b.home_type = 'community')
      AND (${homeTypeExact}::text IS NULL OR b.home_type = ${homeTypeExact}::text)
      AND (${developerName}::text IS NULL OR b.developer_name = ${developerName}::text)
      AND (${isDeveloper}::boolean IS NULL
           OR (${isDeveloper}::boolean = true AND b.developer_name IS NOT NULL)
           OR (${isDeveloper}::boolean = false AND b.developer_name IS NULL))
      AND (${includeDisabled}::boolean = true
           OR COALESCE(v.public_enabled, true) = true)
    ORDER BY
      b.featured DESC NULLS LAST,
      b.builder_name ASC,
      b.community_name ASC NULLS LAST,
      b.created_at DESC
    LIMIT ${limit}
  `) as Record<string, unknown>[];

  return rows.map(rowToBuilderInventoryRow);
}

export async function getBuilderInventoryById(
  id: number,
  includeDisabledBuilders = false,
): Promise<BuilderInventoryRow | null> {
  await ensureBuilderInventorySchema();
  const rows = (await sql`
    SELECT b.* FROM builder_inventory b
    LEFT JOIN builder_page_visibility v ON v.builder_name = b.builder_name
    WHERE b.id = ${id}
      AND (${includeDisabledBuilders}::boolean = true
           OR COALESCE(v.public_enabled, true) = true)
    LIMIT 1
  `) as Record<string, unknown>[];
  return rows[0] ? rowToBuilderInventoryRow(rows[0]) : null;
}

/**
 * Bulk-approve every pending builder_inventory row in a single UPDATE.
 * Sets status='active', stamps reviewed_at=NOW() and reviewed_by=<admin>.
 * Returns the count of rows activated. Powers the "Approve all pending"
 * action on /admin/inventory (open all builder/developer content at once).
 */
export async function bulkApprovePendingBuilderInventory(
  reviewedBy: string,
): Promise<number> {
  await ensureBuilderInventorySchema();
  const rows = (await sql`
    UPDATE builder_inventory
    SET status       = 'active',
        reviewed_at  = NOW(),
        reviewed_by  = ${reviewedBy}
    WHERE status = 'pending'
    RETURNING id
  `) as Record<string, unknown>[];
  return rows.length;
}

export type UpdateBuilderInventoryInput = {
  // Status + workflow
  status?: Status;
  featured?: boolean;
  reviewedBy?: string;
  // Editable content
  publication?: Publication;
  builderName?: string;
  title?: string;
  city?: string;
  state?: string;
  description?: string | null;
  bedsMin?: number | null;
  bedsMax?: number | null;
  bathsMin?: number | null;
  bathsMax?: number | null;
  sqftMin?: number | null;
  sqftMax?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  promoType?: PromoType | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  sourceUrl?: string | null;
  thumbnailUrl?: string | null;
  flyerPdfUrl?: string | null;
  // S13 per-home additions:
  address?: string | null;
  readyDate?: string | null;
  planName?: string | null;
  communityName?: string | null;
  homeType?: HomeType | null;
  // S13 gallery:
  galleryUrls?: string[] | null;
  communityData?: CommunityData | null;
  extraDetails?: Record<string, string> | null;
  developerName?: string | null;
};


// David Weekley community rows that still need a structured community_data
// backfill (and/or a description). Pre-S13 community rows were created with
// description=null; community_data is new (2026_07_23). Returns the id plus
// the builder page URL stored in flyer_pdf_url so the caller can fetch each
// community page and extract the full structured blob.
// Used by the David Weekley ingestion step to avoid creating duplicate
// community rows for communities already tracked (by external_id or the
// community page URL stored in flyer_pdf_url).

export async function updateBuilderInventory(
  id: number,
  input: UpdateBuilderInventoryInput,
): Promise<BuilderInventoryRow | null> {
  await ensureBuilderInventorySchema();

  // Two-pass merge: fetch current row, JS-merge input on top, write back the
  // full row. This lets us cleanly distinguish "field not provided"
  // (undefined) from "field set to null" — which COALESCE cannot do.
  const current = await getBuilderInventoryById(id);
  if (!current) return null;

  const m = { ...current, ...input };

  // Stamp reviewed_at when status transitions from pending to anything else.
  const reviewedAt =
    input.status !== undefined &&
    current.status === 'pending' &&
    input.status !== 'pending'
      ? new Date().toISOString()
      : current.reviewedAt;

  const rows = (await sql`
    UPDATE builder_inventory SET
      status         = ${m.status},
      featured       = ${m.featured},
      publication    = ${m.publication},
      reviewed_by    = ${m.reviewedBy ?? null},
      reviewed_at    = ${reviewedAt},
      builder_name   = ${m.builderName},
      title          = ${m.title},
      city           = ${m.city},
      state          = ${m.state},
      description    = ${m.description},
      beds_min       = ${m.bedsMin},
      beds_max       = ${m.bedsMax},
      baths_min      = ${m.bathsMin},
      baths_max      = ${m.bathsMax},
      sqft_min       = ${m.sqftMin},
      sqft_max       = ${m.sqftMax},
      price_min      = ${m.priceMin},
      price_max      = ${m.priceMax},
      promo_type     = ${m.promoType},
      starts_at      = ${m.startsAt},
      expires_at     = ${m.expiresAt},
      source_url     = ${m.sourceUrl},
      thumbnail_url  = ${m.thumbnailUrl},
      flyer_pdf_url  = ${m.flyerPdfUrl},
      address        = ${m.address},
      ready_date     = ${m.readyDate},
      plan_name      = ${m.planName},
      community_name = ${m.communityName},
      home_type      = ${m.homeType},
      gallery_urls   = ${(m.galleryUrls ?? null) as string[] | null},
      community_data = ${m.communityData != null ? JSON.stringify(m.communityData) : null}::jsonb,
      extra_details  = COALESCE(${m.extraDetails != null ? JSON.stringify(m.extraDetails) : null}::jsonb, extra_details),
      developer_name = ${m.developerName}
    WHERE id = ${id}
    RETURNING *
  `) as Record<string, unknown>[];

  return rows[0] ? rowToBuilderInventoryRow(rows[0]) : null;
}

export async function deleteBuilderInventory(id: number): Promise<boolean> {
  await ensureBuilderInventorySchema();
  const rows = (await sql`
    DELETE FROM builder_inventory WHERE id = ${id} RETURNING id
  `) as Record<string, unknown>[];
  return rows.length > 0;
}

// ─────────────────────────────────────────────────────────────────────────
// Upsert by (builder_name, external_id) — used by scrapers
// ─────────────────────────────────────────────────────────────────────────

export type UpsertScrapedInput = {
  externalId: string;
  kind: Kind;
  publication: Publication;
  submittedByName: string;
  submittedByEmail: string;
  builderName: string;
  title: string;
  city: string;
  state: string;
  description: string | null;
  bedsMin: number | null;
  bedsMax: number | null;
  bathsMin: number | null;
  bathsMax: number | null;
  sqftMin: number | null;
  sqftMax: number | null;
  priceMin: number | null;
  priceMax: number | null;
  flyerPdfUrl: string | null;
  thumbnailUrl: string | null;
  // S13 per-home additions:
  address?: string | null;
  readyDate?: string | null;
  planName?: string | null;
  communityName?: string | null;
  // S14 promotion-scraper additions:
  promoType?: PromoType | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  sourceUrl?: string | null;
  homeType?: HomeType | null;
  // S13 gallery:
  galleryUrls?: string[] | null;
  communityData?: CommunityData | null;
  extraDetails?: Record<string, string> | null;
  developerName?: string | null;
};

/**
 * Upserts a builder_inventory row keyed on (builder_name, external_id).
 *
 * - No match: INSERT a pending row with the scraper as submitter.
 * - Match found: UPDATE only data-driven fields (title/city/desc/ranges).
 *   Does NOT touch status, featured, reviewedBy, or reviewedAt — those
 *   are admin decisions and the scraper has no business overwriting them.
 */
export async function upsertBuilderInventoryByExternalId(
  input: UpsertScrapedInput,
): Promise<{ row: BuilderInventoryRow; created: boolean }> {
  await ensureBuilderInventorySchema();

  const existing = (await sql`
    SELECT * FROM builder_inventory
    WHERE builder_name = ${input.builderName}
      AND external_id  = ${input.externalId}
    LIMIT 1
  `) as Record<string, unknown>[];

  if (existing[0]) {
    const existingRow = rowToBuilderInventoryRow(existing[0]);
    const updated = await updateBuilderInventory(existingRow.id, {
      title: input.title,
      city: input.city,
      state: input.state,
      publication: input.publication,
      description: input.description,
      bedsMin: input.bedsMin,
      bedsMax: input.bedsMax,
      bathsMin: input.bathsMin,
      bathsMax: input.bathsMax,
      sqftMin: input.sqftMin,
      sqftMax: input.sqftMax,
      priceMin: input.priceMin,
      priceMax: input.priceMax,
      flyerPdfUrl: input.flyerPdfUrl,
      thumbnailUrl: input.thumbnailUrl,
      promoType: input.promoType ?? null,
      startsAt: input.startsAt ?? null,
      expiresAt: input.expiresAt ?? null,
      sourceUrl: input.sourceUrl ?? null,
      address: input.address ?? null,
      readyDate: input.readyDate ?? null,
      planName: input.planName ?? null,
      communityName: input.communityName ?? null,
      homeType: input.homeType ?? null,
      galleryUrls: input.galleryUrls ?? null,
      communityData: input.communityData ?? null,
      extraDetails: input.extraDetails ?? null,
      developerName: input.developerName ?? null,
    });
    if (!updated) {
      throw new Error(`Upsert: row ${existingRow.id} vanished mid-update`);
    }
    return { row: updated, created: false };
  }

  const created = await createBuilderInventory({
    kind: input.kind,
    publication: input.publication,
    submittedByName: input.submittedByName,
    submittedByEmail: input.submittedByEmail,
    submittedByPhone: null,
    builderName: input.builderName,
    title: input.title,
    city: input.city,
    state: input.state,
    description: input.description,
    bedsMin: input.bedsMin,
    bedsMax: input.bedsMax,
    bathsMin: input.bathsMin,
    bathsMax: input.bathsMax,
    sqftMin: input.sqftMin,
    sqftMax: input.sqftMax,
    priceMin: input.priceMin,
    priceMax: input.priceMax,
    flyerPdfUrl: input.flyerPdfUrl,
    thumbnailUrl: input.thumbnailUrl,
    promoType: input.promoType ?? null,
    startsAt: input.startsAt ?? null,
    expiresAt: input.expiresAt ?? null,
    sourceUrl: input.sourceUrl ?? null,
    externalId: input.externalId,
    address: input.address ?? null,
    readyDate: input.readyDate ?? null,
    planName: input.planName ?? null,
    communityName: input.communityName ?? null,
    homeType: input.homeType ?? null,
    galleryUrls: input.galleryUrls ?? null,
    communityData: input.communityData ?? null,
    extraDetails: input.extraDetails ?? null,
    developerName: input.developerName ?? null,
  });

  // S13: Scraper-produced LISTING rows auto-publish to 'active'.
  // S14: Scraper-produced PROMOTION rows stay 'pending' so a human reviews
  // legal text / dates / participating-community claims before publishing.
  // Human form submissions (no external_id) always go through moderation.
  if (input.kind === 'listing') {
    await sql`
      UPDATE builder_inventory
      SET status = 'active',
          reviewed_at = NOW(),
          reviewed_by = 'system:scraper-trusted'
      WHERE id = ${created.id}
    `;
  }
  const activated = await getBuilderInventoryById(created.id);
  return { row: activated ?? created, created: true };
}

/**
 * Claim a manually-entered promotion row by setting its external_id.
 *
 * When a promotion was originally submitted through the admin form (no
 * external_id), a later scraper run would create a DUPLICATE because
 * `upsertBuilderInventoryByExternalId` matches on external_id. This
 * function retroactively tags the existing row so the upsert finds and
 * updates it instead.
 *
 * Safe: only touches rows where external_id IS NULL (never overwrites an
 * existing external_id) and only matches by builder_name + title + kind.
 */
export async function claimExistingPromotion(args: {
  builderName: string;
  title: string;
  externalId: string;
}): Promise<number> {
  await ensureBuilderInventorySchema();
  const rows = await sql`
    UPDATE builder_inventory
    SET external_id = ${args.externalId}
    WHERE builder_name = ${args.builderName}
      AND title        = ${args.title}
      AND kind         = 'promotion'
      AND external_id IS NULL
    RETURNING id
  `;
  return Array.isArray(rows) ? rows.length : 0;
}
