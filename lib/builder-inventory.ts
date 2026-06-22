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

const sql = neon(process.env.DATABASE_URL!);

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export type Kind = 'listing' | 'promotion';
export type Status = 'pending' | 'active' | 'rejected' | 'expired';
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
      gallery_urls
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
      ${(input.galleryUrls ?? null) as string[] | null}
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
  const limit = Math.min(filters.limit ?? 100, 500);

  // S13: home_type filter dispatch.
  const homeType = filters.homeType ?? null;
  const homeTypeIsNullOrCommunity = homeType === 'isNullOrCommunity';
  const homeTypeExact =
    homeType && homeType !== 'isNullOrCommunity' ? homeType : null;

  const rows = (await sql`
    SELECT * FROM builder_inventory
    WHERE
      (${pub} = 'all'
        OR publication = ${pub}::text
        OR publication = 'both')
      AND (${kind}::text IS NULL OR kind = ${kind}::text)
      AND (${status}::text IS NULL OR status = ${status}::text)
      AND (${builder}::text IS NULL OR builder_name = ${builder}::text)
      AND (${featured}::boolean IS NULL OR featured = ${featured}::boolean)
      AND (${homeTypeIsNullOrCommunity}::boolean = false
           OR home_type IS NULL OR home_type = 'community')
      AND (${homeTypeExact}::text IS NULL OR home_type = ${homeTypeExact}::text)
    ORDER BY
      featured DESC NULLS LAST,
      builder_name ASC,
      community_name ASC NULLS LAST,
      created_at DESC
    LIMIT ${limit}
  `) as Record<string, unknown>[];

  return rows.map(rowToBuilderInventoryRow);
}

/**
 * Return the distinct list of builder_name values for active rows in a
 * publication. Used to render builder chip strips (e.g. on /inventory and
 * /communities) so the strip can't be silently truncated by a row-LIMIT.
 */
export async function listActiveBuilderNames(
  publication: 'all' | Publication = 'all',
): Promise<string[]> {
  await ensureBuilderInventorySchema();
  const rows = (await sql`
    SELECT DISTINCT builder_name
    FROM builder_inventory
    WHERE status = 'active'
      AND (${publication} = 'all'
        OR publication = ${publication}::text
        OR publication = 'both')
    ORDER BY builder_name ASC
  `) as Record<string, unknown>[];
  return rows
    .map((r) => String(r.builder_name ?? ''))
    .filter((s) => s.length > 0 && s.toLowerCase() !== 'test');
}

export async function getBuilderInventoryById(
  id: number,
): Promise<BuilderInventoryRow | null> {
  await ensureBuilderInventorySchema();
  const rows = (await sql`
    SELECT * FROM builder_inventory WHERE id = ${id} LIMIT 1
  `) as Record<string, unknown>[];
  return rows[0] ? rowToBuilderInventoryRow(rows[0]) : null;
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
};

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
      gallery_urls   = ${(m.galleryUrls ?? null) as string[] | null}
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
