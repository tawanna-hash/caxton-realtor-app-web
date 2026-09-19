// lib/server/schemas/push.ts
//
// Zod schemas for /api/push/* endpoints.

import { z } from 'zod';
import { MARKETS } from '@/lib/types/markets';

/** Web Push subscription envelope (browser PushSubscription JSON shape). */
const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});
const marketOrNull = z.enum(MARKETS).nullish();

export const pushSubscribeBodySchema = z.object({
  subscription: pushSubscriptionSchema,
  realtorId: z.string().uuid().nullish(),
  market: marketOrNull,
  userAgent: z.string().max(1024).optional(),
});
export const pushUnsubscribeBodySchema = z.object({
  endpoint: z.string().url(),
});

export const pushResubscribeBodySchema = z.object({
  oldEndpoint: z.string().nullish(),
  subscription: pushSubscriptionSchema,
});

export const pushNativeRegisterBodySchema = z.object({
  token: z.string().min(1).max(512),
  platform: z.enum(['ios', 'android']),
  realtorId: z.string().uuid().nullish(),
  market: z.string().max(64).nullish(),
  userAgent: z.string().max(1024).nullish(),
});

export const pushNativeDisableBodySchema = z.object({
  token: z.string().nullish(),
  userAgent: z.string().nullish(),
});
