/**
 * Zod schemas for /api/auth/webauthn/* routes.
 *
 * We do NOT validate the inner shape of the WebAuthn response with zod — its
 * fields are exhaustively checked by @simplewebauthn/server. We only validate
 * the outer envelope (the bit clients populate themselves).
 */

import { z } from 'zod';

export const finishRegistrationSchema = z.object({
  response: z.unknown(),
  deviceName: z.string().min(1).max(100).optional(),
});

export const beginAuthSchema = z.object({
  email: z.string().email().toLowerCase().optional(),
  // Conditional-UI prefetch from the browser. Bypasses rate limiting since
  // it can fire on every page load with no user gesture.
  autofill: z.boolean().optional(),
});

export const finishAuthSchema = z.object({
  response: z.unknown(),
});
