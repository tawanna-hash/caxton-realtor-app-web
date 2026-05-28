/**
 * Distributed rate limiting via Upstash Redis. Replaces the in-memory
 * `express-rate-limit` middleware which doesn't work on serverless.
 *
 * Usage:
 *
 *   import { rateLimit, rateLimitConfigs } from '@/lib/server/rate-limit';
 *
 *   export const POST = withErrorHandling(async () => {
 *     await rateLimit('auth');           // throws ApiError(429) if over limit
 *     // ... handler
 *   });
 *
 * If Upstash env vars are not set, all calls become no-ops with a single
 * warning log. This keeps preview deploys working without forcing every
 * branch deploy to provision rate limits.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { ApiError } from './error';
import { logger } from './logger';
import { headers } from 'next/headers';

type ConfigName = 'general' | 'auth' | 'passwordReset';

const configs: Record<ConfigName, { tokens: number; window: `${number}${'s' | 'm' | 'h'}` }> = {
  // Matches Express defaults from src/middleware/rate-limit.ts
  general: { tokens: 100, window: '1m' },
  auth: { tokens: 5, window: '15m' },
  passwordReset: { tokens: 20, window: '15m' },
};

let cachedRedis: Redis | null = null;
let warnedMissing = false;
const limiters: Partial<Record<ConfigName, Ratelimit>> = {};

function getRedis(): Redis | null {
  if (cachedRedis) return cachedRedis;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    if (!warnedMissing) {
      logger.warn({}, 'Upstash credentials missing; rate limiting disabled.');
      warnedMissing = true;
    }
    return null;
  }
  cachedRedis = new Redis({ url, token });
  return cachedRedis;
}

function getLimiter(name: ConfigName): Ratelimit | null {
  if (limiters[name]) return limiters[name]!;
  const redis = getRedis();
  if (!redis) return null;
  const { tokens, window } = configs[name];
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(tokens, window),
    prefix: `rl:${name}`,
    analytics: false,
  });
  limiters[name] = limiter;
  return limiter;
}

/**
 * Apply the named rate limit, keyed by client IP. Throws ApiError(429) when
 * the limit is exceeded. Silently no-ops if Upstash is not configured.
 */
export async function rateLimit(name: ConfigName, extraKey?: string): Promise<void> {
  const limiter = getLimiter(name);
  if (!limiter) return;

  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const key = extraKey ? `${ip}:${extraKey}` : ip;

  const { success, limit, reset, remaining } = await limiter.limit(key);
  if (!success) {
    throw new ApiError(429, 'Too many requests', { limit, remaining, resetAt: reset });
  }
}
