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

const configs: Record<ConfigName, { tokens: number; windowMs: number; window: `${number}${'s' | 'm' | 'h'}` }> = {
  // Matches Express defaults from src/middleware/rate-limit.ts
  general:       { tokens: 100, windowMs:  60_000, window: '1m'  },
  auth:          { tokens:   5, windowMs: 900_000, window: '15m' },
  passwordReset: { tokens:  20, windowMs: 900_000, window: '15m' },
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
      logger.warn({}, 'Upstash credentials missing; falling back to in-memory rate limiting (per-instance only).');
      warnedMissing = true;
    }
    return null;
  }
  cachedRedis = new Redis({ url, token });
  return cachedRedis;
}

// ---- In-memory sliding-window fallback ----
// Used when Upstash isn't configured. Keyed by `<config>:<ip>` so configs
// can't collide. State is per-lambda-instance, so an attacker hitting a
// cold start or different region gets a fresh bucket — this is a defense
// in depth measure, not a strong gate. Provision Upstash for real
// brute-force protection.
const memoryBuckets = new Map<string, number[]>();
const MEMORY_MAX_KEYS = 5_000; // hard cap to bound RAM in a runaway scenario

function memoryCheck(name: ConfigName, ip: string): { allowed: boolean; resetAt: number } {
  const { tokens, windowMs } = configs[name];
  const key = `${name}:${ip}`;
  const now = Date.now();
  const cutoff = now - windowMs;

  const arr = memoryBuckets.get(key) ?? [];
  // Drop timestamps outside the window
  let i = 0;
  while (i < arr.length && arr[i] <= cutoff) i++;
  const pruned = i === 0 ? arr : arr.slice(i);

  if (pruned.length >= tokens) {
    const resetAt = (pruned[0] ?? now) + windowMs;
    memoryBuckets.set(key, pruned);
    return { allowed: false, resetAt };
  }

  pruned.push(now);
  memoryBuckets.set(key, pruned);

  // Bound memory growth — drop the oldest keys when the map gets huge.
  // Not LRU, but good enough for an emergency overflow valve.
  if (memoryBuckets.size > MEMORY_MAX_KEYS) {
    const firstKey = memoryBuckets.keys().next().value;
    if (firstKey) memoryBuckets.delete(firstKey);
  }

  return { allowed: true, resetAt: now + windowMs };
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
 * Apply the named rate limit, keyed by client IP. Throws ApiError(429)
 * when the limit is exceeded.
 *
 * If Upstash is configured we use the distributed sliding window — the
 * canonical implementation. Otherwise we fall back to a per-instance
 * in-memory window so brute-force attempts at least hit a wall when they
 * land on the same warm lambda (which is most of the time for sustained
 * attacks from one IP).
 */
export async function rateLimit(name: ConfigName, extraKey?: string): Promise<void> {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const key = extraKey ? `${ip}:${extraKey}` : ip;

  const limiter = getLimiter(name);
  if (limiter) {
    const { success, limit, reset, remaining } = await limiter.limit(key);
    if (!success) {
      throw new ApiError(429, 'Too many requests', { limit, remaining, resetAt: reset });
    }
    return;
  }

  const { allowed, resetAt } = memoryCheck(name, key);
  if (!allowed) {
    throw new ApiError(429, 'Too many requests', {
      limit: configs[name].tokens,
      remaining: 0,
      resetAt,
    });
  }
}
