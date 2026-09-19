import type Stripe from 'stripe';
import { query } from '@/lib/server/db/neon';

export type PlatinumAccess = {
  realtor_id: string;
  status: 'active' | 'inactive' | 'canceled';
  source: 'admin' | 'stripe' | 'trial';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: Date | null;
  trial_started_at: Date | null;
  created_at: Date;
  updated_at: Date;
  active: boolean;
};

let schemaPromise: Promise<void> | null = null;

export function ensurePlatinumSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise;
  schemaPromise = query(`
    CREATE TABLE IF NOT EXISTS rnn_platinum_entitlements (
      realtor_id UUID PRIMARY KEY REFERENCES realtors(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'inactive',
      source TEXT NOT NULL DEFAULT 'admin',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT UNIQUE,
      current_period_end TIMESTAMPTZ,
      trial_started_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT rnn_platinum_status_check CHECK (status IN ('active', 'inactive', 'canceled')),
      CONSTRAINT rnn_platinum_source_check CHECK (source IN ('admin', 'stripe', 'trial'))
    )
  `).then(async () => {
    await query('ALTER TABLE rnn_platinum_entitlements ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ');
    await query('ALTER TABLE rnn_platinum_entitlements DROP CONSTRAINT IF EXISTS rnn_platinum_source_check');
    await query("ALTER TABLE rnn_platinum_entitlements ADD CONSTRAINT rnn_platinum_source_check CHECK (source IN ('admin', 'stripe', 'trial'))");
    await query('CREATE INDEX IF NOT EXISTS rnn_platinum_customer_idx ON rnn_platinum_entitlements (stripe_customer_id)');
  }).catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

function withActive(row: Omit<PlatinumAccess, 'active'> | undefined, realtorId: string): PlatinumAccess {
  const fallback: Omit<PlatinumAccess, 'active'> = {
    realtor_id: realtorId,
    status: 'inactive',
    source: 'admin',
    stripe_customer_id: null,
    stripe_subscription_id: null,
    current_period_end: null,
    trial_started_at: null,
    created_at: new Date(0),
    updated_at: new Date(0),
  };
  const value = row ?? fallback;
  const active = value.status === 'active'
    && (value.source === 'admin'
      || !value.current_period_end
      || new Date(value.current_period_end).getTime() > Date.now());
  return { ...value, active };
}

export async function getPlatinumAccess(realtorId: string): Promise<PlatinumAccess> {
  await ensurePlatinumSchema();
  const rows = await query<Omit<PlatinumAccess, 'active'>>(
    'SELECT * FROM rnn_platinum_entitlements WHERE realtor_id = $1 LIMIT 1',
    [realtorId],
  );
  return withActive(rows[0], realtorId);
}

export async function setAdminPlatinumAccess(
  realtorId: string,
  enabled: boolean,
): Promise<PlatinumAccess> {
  await ensurePlatinumSchema();
  const rows = await query<Omit<PlatinumAccess, 'active'>>(
    `INSERT INTO rnn_platinum_entitlements (realtor_id, status, source)
     VALUES ($1, $2, 'admin')
     ON CONFLICT (realtor_id) DO UPDATE SET
       status = EXCLUDED.status,
       source = 'admin',
       current_period_end = NULL,
       updated_at = NOW()
     RETURNING *`,
    [realtorId, enabled ? 'active' : 'inactive'],
  );
  return withActive(rows[0], realtorId);
}

export async function startPlatinumTrial(
  realtorId: string,
): Promise<{ access: PlatinumAccess; started: boolean }> {
  await ensurePlatinumSchema();
  const rows = await query<Omit<PlatinumAccess, 'active'>>(
    `INSERT INTO rnn_platinum_entitlements (
       realtor_id, status, source, current_period_end, trial_started_at
     ) VALUES ($1, 'active', 'trial', NOW() + INTERVAL '30 days', NOW())
     ON CONFLICT (realtor_id) DO UPDATE SET
       status = 'active',
       source = 'trial',
       current_period_end = NOW() + INTERVAL '30 days',
       trial_started_at = NOW(),
       updated_at = NOW()
     WHERE rnn_platinum_entitlements.trial_started_at IS NULL
     RETURNING *`,
    [realtorId],
  );
  if (rows[0]) return { access: withActive(rows[0], realtorId), started: true };
  return { access: await getPlatinumAccess(realtorId), started: false };
}

function periodEnd(subscription: Stripe.Subscription): Date | null {
  const itemEnds = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === 'number');
  const seconds = itemEnds.length ? Math.max(...itemEnds) : null;
  return seconds ? new Date(seconds * 1000) : null;
}

export async function syncStripePlatinumSubscription(
  realtorId: string,
  subscription: Stripe.Subscription,
): Promise<PlatinumAccess> {
  await ensurePlatinumSchema();
  const activeStatuses = new Set(['active', 'trialing', 'past_due']);
  const status = activeStatuses.has(subscription.status) ? 'active' : 'canceled';
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer.id;
  const rows = await query<Omit<PlatinumAccess, 'active'>>(
    `INSERT INTO rnn_platinum_entitlements (
       realtor_id, status, source, stripe_customer_id,
       stripe_subscription_id, current_period_end
     ) VALUES ($1, $2, 'stripe', $3, $4, $5)
     ON CONFLICT (realtor_id) DO UPDATE SET
       status = EXCLUDED.status,
       source = 'stripe',
       stripe_customer_id = EXCLUDED.stripe_customer_id,
       stripe_subscription_id = EXCLUDED.stripe_subscription_id,
       current_period_end = EXCLUDED.current_period_end,
       updated_at = NOW()
     RETURNING *`,
    [realtorId, status, customerId, subscription.id, periodEnd(subscription)],
  );
  return withActive(rows[0], realtorId);
}

export async function syncStripePlatinumBySubscription(
  subscription: Stripe.Subscription,
): Promise<PlatinumAccess | null> {
  const realtorId = subscription.metadata?.realtor_id;
  if (realtorId) return syncStripePlatinumSubscription(realtorId, subscription);

  await ensurePlatinumSchema();
  const rows = await query<{ realtor_id: string }>(
    'SELECT realtor_id FROM rnn_platinum_entitlements WHERE stripe_subscription_id = $1 LIMIT 1',
    [subscription.id],
  );
  if (!rows[0]) return null;
  return syncStripePlatinumSubscription(rows[0].realtor_id, subscription);
}
