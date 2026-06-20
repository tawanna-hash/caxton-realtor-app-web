/**
 * Zod schemas for /api/admin/auth/* routes.
 *
 * Kept in a separate file from `auth.ts` so the realtor and admin schemas
 * can drift if/when product requires it (e.g. admins might one day need
 * a stricter password policy). Today they're effectively identical to the
 * realtor counterparts; consolidating here removes the three near-duplicate
 * inline definitions that used to live in each admin route handler.
 *
 * See sign-in-audit-2026-06-20.md L1 for context.
 */

import { z } from 'zod';

export const adminLoginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1).max(200),
});

export const adminForgotPasswordSchema = z.object({
  email: z.string().email().toLowerCase(),
});

export const adminResetPasswordSchema = z.object({
  token: z.string().min(1).max(200),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(200),
});
