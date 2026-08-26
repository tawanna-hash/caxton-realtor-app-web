import { randomBytes, randomUUID } from 'crypto';
import { exec, query } from '@/lib/server/db/neon';
import { getRealtorMe } from '@/lib/server/realtors-store';
import type { PublicationId } from '@/lib/publications';

export type TestimonialStatus = 'pending' | 'published' | 'archived';
export type TestimonialFormat = 'text' | 'video';

export type TestimonialProfile = {
  realtor_id: string;
  slug: string;
  collection_token: string;
  display_name: string;
  professional_title: string | null;
  company: string | null;
  bio: string | null;
  headshot_url: string | null;
  default_market: PublicationId;
  default_global: boolean;
  is_published: boolean;
  created_at: Date;
  updated_at: Date;
};

export type Testimonial = {
  id: string;
  realtor_id: string;
  quote: string;
  client_name: string;
  client_title: string | null;
  client_company: string | null;
  rating: number | null;
  format: TestimonialFormat;
  video_url: string | null;
  image_url: string | null;
  transcript: string | null;
  source_url: string | null;
  tags: string[];
  markets: PublicationId[];
  is_global: boolean;
  status: TestimonialStatus;
  sort_order: number;
  submitted_via: 'owner' | 'collection_link' | 'admin';
  created_at: Date;
  updated_at: Date;
};

export type TestimonialInput = {
  quote: string;
  clientName: string;
  clientTitle?: string | null;
  clientCompany?: string | null;
  rating?: number | null;
  format: TestimonialFormat;
  videoUrl?: string | null;
  imageUrl?: string | null;
  transcript?: string | null;
  sourceUrl?: string | null;
  tags: string[];
  markets: PublicationId[];
  isGlobal: boolean;
  status: TestimonialStatus;
  sortOrder?: number;
};

let schemaPromise: Promise<void> | null = null;

export function ensureTestimonialsSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS testimonial_profiles (
        realtor_id UUID PRIMARY KEY REFERENCES realtors(id) ON DELETE CASCADE,
        slug TEXT NOT NULL UNIQUE,
        collection_token TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        professional_title TEXT,
        company TEXT,
        bio TEXT,
        headshot_url TEXT,
        default_market TEXT NOT NULL DEFAULT 'austin',
        default_global BOOLEAN NOT NULL DEFAULT false,
        is_published BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS testimonials (
        id UUID PRIMARY KEY,
        realtor_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE,
        quote TEXT NOT NULL,
        client_name TEXT NOT NULL,
        client_title TEXT,
        client_company TEXT,
        rating SMALLINT,
        format TEXT NOT NULL DEFAULT 'text',
        video_url TEXT,
        image_url TEXT,
        transcript TEXT,
        source_url TEXT,
        tags TEXT[] NOT NULL DEFAULT '{}'::text[],
        markets TEXT[] NOT NULL DEFAULT '{}'::text[],
        is_global BOOLEAN NOT NULL DEFAULT false,
        status TEXT NOT NULL DEFAULT 'pending',
        sort_order INTEGER NOT NULL DEFAULT 0,
        submitted_via TEXT NOT NULL DEFAULT 'owner',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT testimonials_rating_check CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
        CONSTRAINT testimonials_format_check CHECK (format IN ('text', 'video')),
        CONSTRAINT testimonials_status_check CHECK (status IN ('pending', 'published', 'archived')),
        CONSTRAINT testimonials_source_check CHECK (submitted_via IN ('owner', 'collection_link', 'admin'))
      )
    `);
    await query('CREATE INDEX IF NOT EXISTS testimonials_owner_idx ON testimonials (realtor_id, status, sort_order, created_at DESC)');
    await query('CREATE INDEX IF NOT EXISTS testimonials_status_idx ON testimonials (status, created_at DESC)');
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 56) || 'realtor';
}

export async function getOrCreateTestimonialProfile(realtorId: string): Promise<TestimonialProfile> {
  await ensureTestimonialsSchema();
  const existing = await query<TestimonialProfile>(
    'SELECT * FROM testimonial_profiles WHERE realtor_id = $1 LIMIT 1',
    [realtorId],
  );
  if (existing[0]) return existing[0];

  const realtor = await getRealtorMe(realtorId);
  const fullName = [realtor?.first_name, realtor?.last_name].filter(Boolean).join(' ').trim();
  const displayName = fullName || realtor?.email?.split('@')[0] || 'Real Estate Professional';
  const market = realtor?.market === 'san_antonio'
    || realtor?.market === 'houston'
    || realtor?.market === 'dallas'
    ? realtor.market
    : 'austin';
  const slug = `${slugify(displayName)}-${randomBytes(3).toString('hex')}`;
  const token = randomBytes(24).toString('hex');
  const rows = await query<TestimonialProfile>(
    `INSERT INTO testimonial_profiles
      (realtor_id, slug, collection_token, display_name, company, default_market)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (realtor_id) DO UPDATE SET realtor_id = EXCLUDED.realtor_id
     RETURNING *`,
    [realtorId, slug, token, displayName, realtor?.brokerage_name ?? null, market],
  );
  return rows[0];
}

export async function updateTestimonialProfile(
  realtorId: string,
  input: Pick<TestimonialProfile, 'display_name' | 'professional_title' | 'company' | 'bio' | 'headshot_url' | 'default_market' | 'default_global' | 'is_published'>,
): Promise<TestimonialProfile> {
  await getOrCreateTestimonialProfile(realtorId);
  const rows = await query<TestimonialProfile>(
    `UPDATE testimonial_profiles SET
       display_name = $2, professional_title = $3, company = $4, bio = $5,
       headshot_url = $6, default_market = $7, default_global = $8,
       is_published = $9, updated_at = NOW()
     WHERE realtor_id = $1
     RETURNING *`,
    [
      realtorId,
      input.display_name,
      input.professional_title,
      input.company,
      input.bio,
      input.headshot_url,
      input.default_market,
      input.default_global,
      input.is_published,
    ],
  );
  return rows[0];
}

export async function rotateCollectionToken(realtorId: string): Promise<TestimonialProfile> {
  await getOrCreateTestimonialProfile(realtorId);
  const rows = await query<TestimonialProfile>(
    `UPDATE testimonial_profiles
     SET collection_token = $2, updated_at = NOW()
     WHERE realtor_id = $1
     RETURNING *`,
    [realtorId, randomBytes(24).toString('hex')],
  );
  return rows[0];
}

export async function listOwnerTestimonials(realtorId: string): Promise<Testimonial[]> {
  await ensureTestimonialsSchema();
  return query<Testimonial>(
    `SELECT * FROM testimonials
     WHERE realtor_id = $1
     ORDER BY sort_order ASC, created_at DESC`,
    [realtorId],
  );
}

export async function createTestimonial(
  realtorId: string,
  input: TestimonialInput,
  submittedVia: Testimonial['submitted_via'],
): Promise<Testimonial> {
  await ensureTestimonialsSchema();
  const rows = await query<Testimonial>(
    `INSERT INTO testimonials (
       id, realtor_id, quote, client_name, client_title, client_company,
       rating, format, video_url, image_url, transcript, source_url, tags,
       markets, is_global, status, sort_order, submitted_via
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
       $14, $15, $16, $17, $18
     ) RETURNING *`,
    [
      randomUUID(), realtorId, input.quote, input.clientName,
      input.clientTitle ?? null, input.clientCompany ?? null, input.rating ?? null,
      input.format, input.videoUrl ?? null, input.imageUrl ?? null,
      input.transcript ?? null, input.sourceUrl ?? null, input.tags, input.markets,
      input.isGlobal, input.status, input.sortOrder ?? 0, submittedVia,
    ],
  );
  return rows[0];
}

export async function updateOwnerTestimonial(
  id: string,
  realtorId: string,
  input: TestimonialInput,
): Promise<Testimonial | null> {
  const rows = await query<Testimonial>(
    `UPDATE testimonials SET
       quote = $3, client_name = $4, client_title = $5, client_company = $6,
       rating = $7, format = $8, video_url = $9, image_url = $10,
       transcript = $11, source_url = $12, tags = $13, markets = $14,
       is_global = $15, status = $16, sort_order = $17, updated_at = NOW()
     WHERE id = $1 AND realtor_id = $2
     RETURNING *`,
    [
      id, realtorId, input.quote, input.clientName, input.clientTitle ?? null,
      input.clientCompany ?? null, input.rating ?? null, input.format,
      input.videoUrl ?? null, input.imageUrl ?? null, input.transcript ?? null,
      input.sourceUrl ?? null, input.tags, input.markets, input.isGlobal,
      input.status, input.sortOrder ?? 0,
    ],
  );
  return rows[0] ?? null;
}

export async function deleteOwnerTestimonial(id: string, realtorId: string): Promise<boolean> {
  const result = await exec('DELETE FROM testimonials WHERE id = $1 AND realtor_id = $2', [id, realtorId]);
  return result.rowCount > 0;
}

export async function findProfileByToken(token: string): Promise<TestimonialProfile | null> {
  await ensureTestimonialsSchema();
  const rows = await query<TestimonialProfile>(
    'SELECT * FROM testimonial_profiles WHERE collection_token = $1 LIMIT 1',
    [token],
  );
  return rows[0] ?? null;
}

export async function getPublicShowcase(slug: string): Promise<{
  profile: TestimonialProfile;
  testimonials: Testimonial[];
} | null> {
  await ensureTestimonialsSchema();
  const profiles = await query<TestimonialProfile>(
    'SELECT * FROM testimonial_profiles WHERE slug = $1 AND is_published = true LIMIT 1',
    [slug],
  );
  const profile = profiles[0];
  if (!profile) return null;
  const testimonials = await query<Testimonial>(
    `SELECT * FROM testimonials
     WHERE realtor_id = $1 AND status = 'published'
     ORDER BY sort_order ASC, created_at DESC`,
    [profile.realtor_id],
  );
  return { profile, testimonials };
}

export async function listAdminTestimonials(filters: {
  status?: TestimonialStatus;
  market?: PublicationId;
  q?: string;
}): Promise<Array<Testimonial & { owner_name: string; owner_email: string; owner_slug: string }>> {
  await ensureTestimonialsSchema();
  const values: unknown[] = [];
  const where: string[] = [];
  if (filters.status) {
    values.push(filters.status);
    where.push(`t.status = $${values.length}`);
  }
  if (filters.market) {
    values.push(filters.market);
    where.push(`(t.is_global = true OR $${values.length} = ANY(t.markets))`);
  }
  if (filters.q) {
    values.push(`%${filters.q}%`);
    where.push(`(
      t.quote ILIKE $${values.length}
      OR t.client_name ILIKE $${values.length}
      OR p.display_name ILIKE $${values.length}
    )`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return query(
    `SELECT t.*, p.display_name AS owner_name, p.slug AS owner_slug,
            COALESCE(r.email, '') AS owner_email
     FROM testimonials t
     JOIN testimonial_profiles p ON p.realtor_id = t.realtor_id
     LEFT JOIN realtors r ON r.id = t.realtor_id
     ${clause}
     ORDER BY
       CASE t.status WHEN 'pending' THEN 0 WHEN 'published' THEN 1 ELSE 2 END,
       t.created_at DESC
     LIMIT 500`,
    values,
  );
}

export async function updateAdminTestimonial(
  id: string,
  input: { status: TestimonialStatus; markets: PublicationId[]; isGlobal: boolean; sortOrder: number },
): Promise<Testimonial | null> {
  const rows = await query<Testimonial>(
    `UPDATE testimonials
     SET status = $2, markets = $3, is_global = $4, sort_order = $5, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, input.status, input.markets, input.isGlobal, input.sortOrder],
  );
  return rows[0] ?? null;
}

export async function deleteAdminTestimonial(id: string): Promise<boolean> {
  const result = await exec('DELETE FROM testimonials WHERE id = $1', [id]);
  return result.rowCount > 0;
}
