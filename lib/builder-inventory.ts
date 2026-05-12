// lib/builder-inventory.ts
// Builder Inventory & Promotions data layer.
// Reads/writes to Neon `builder_inventory` table.
//
// Migrations are tracked in a `schema_migrations` table (per Session 9 GOTCHAS:
// don't use module-level "*Ensured" boolean flags — they short-circuit on warm
// function instances when the migration code changes between deploys).

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export type Kind = 'listing' | 'promotion';
export type Status = 'pending' | 'active' | 'rejected';
export type Publication = 'realtyline' | 'newsline' | 'both';
export type PromoType =
  | 'rate_buydown'
  | 'incentive'
  | 'event'
  | 'broker_bonus'
  | 'other';

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
  expiresAt: string | null;
  tags: string[] | null;
  flyerPdfUrl: string | null;
  thumbnailUrl: string | null;
  sourceIp: string | null;
  userAgent: string | null;
  reviewedBy: string | null;
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
  expiresAt?: string | null;
  tags?: string[] | null;
  flyerPdfUrl?: string | null;
  thumbnailUrl?: string | null;
  sourceIp?: string | null;
  userAgent?: string | null;
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
    expiresAt: (r.expires_at as string) ?? null,
    tags: (r.tags as string[]) ?? null,
    flyerPdfUrl: (r.flyer_pdf_url as string) ?? null,
    thumbnailUrl: (r.thumbnail_url as string) ?? null,
    sourceIp: (r.source_ip as string) ?? null,
    userAgent: (r.user_agent as string) ?? null,
    reviewedBy: (r.reviewed_by as string) ?? null,
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
      promo_type, expires_at, tags,
      flyer_pdf_url, thumbnail_url,
      source_ip, user_agent
    ) VALUES (
      ${input.kind}, ${input.publication},
      ${input.submittedByName}, ${input.submittedByEmail}, ${input.submittedByPhone ?? null},
      ${input.builderName}, ${input.title}, ${input.city}, ${input.state ?? 'TX'}, ${input.description ?? null},
      ${input.bedsMin ?? null}, ${input.bedsMax ?? null}, ${input.bathsMin ?? null}, ${input.bathsMax ?? null},
      ${input.sqftMin ?? null}, ${input.sqftMax ?? null}, ${input.priceMin ?? null}, ${input.priceMax ?? null},
      ${input.promoType ?? null}, ${input.expiresAt ?? null}, ${input.tags ?? null},
      ${input.flyerPdfUrl ?? null}, ${input.thumbnailUrl ?? null},
      ${input.sourceIp ?? null}, ${input.userAgent ?? null}
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
    ORDER BY
      featured DESC NULLS LAST,
      created_at DESC
    LIMIT ${limit}
  `) as Record<string, unknown>[];

  return rows.map(rowToBuilderInventoryRow);
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
  expiresAt?: string | null;
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
      status        = ${m.status},
      featured      = ${m.featured},
      publication   = ${m.publication},
      reviewed_by   = ${m.reviewedBy ?? null},
      reviewed_at   = ${reviewedAt},
      builder_name  = ${m.builderName},
      title         = ${m.title},
      city          = ${m.city},
      state         = ${m.state},
      description   = ${m.description},
      beds_min      = ${m.bedsMin},
      beds_max      = ${m.bedsMax},
      baths_min     = ${m.bathsMin},
      baths_max     = ${m.bathsMax},
      sqft_min      = ${m.sqftMin},
      sqft_max      = ${m.sqftMax},
      price_min     = ${m.priceMin},
      price_max     = ${m.priceMax},
      promo_type    = ${m.promoType},
      expires_at    = ${m.expiresAt}
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
