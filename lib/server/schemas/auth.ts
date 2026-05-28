/**
 * Zod schemas for /api/auth/* (realtor auth) routes.
 */

import { z } from 'zod';

export const signupSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100),
  email: z.string().email().toLowerCase(),
  market: z.enum(['austin', 'san_antonio', 'both']),
  consentText: z.string().min(1).max(2000),

  // Optional during rollout; new clients always send it.
  password: z.string().min(8, 'Password must be at least 8 characters').max(200).optional(),

  // License info ("TREC #" / "NMLS #" radio in UI; normalized in handler)
  licenseType: z.string().max(20).optional(),
  licenseNumber: z.string().max(50).optional(),

  title: z.string().max(100).optional(),
  mobile: z.string().max(30).optional(),

  mailingAddress: z.string().max(200).optional(),
  mailingAddress2: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(2).optional(),
  zip: z.string().max(10).optional(),

  birthdayMonth: z.string().max(20).optional(),
  birthdayDay: z.string().max(2).optional(),

  subscriptions: z.array(z.string().max(50)).max(20).optional(),

  fbHandle: z.string().max(100).optional(),
  igHandle: z.string().max(100).optional(),
  liHandle: z.string().max(100).optional(),
});

export const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
});

export const verifySchema = z.object({
  token: z.string().min(1),
});

// -----------------------------------------------------------------------------
// Password auth
// -----------------------------------------------------------------------------

export const passwordLoginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1).max(200),
});

export const setPasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200).optional(),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().toLowerCase(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(200),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(200),
});
