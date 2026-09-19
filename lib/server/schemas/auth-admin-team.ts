// lib/server/schemas/auth-admin-team.ts
//
// Zod schemas for /api/admin/team/* — owner-only admin account management.

import { z } from 'zod';

export const createAdminSchema = z.object({
  email: z.string().email().toLowerCase(),
  fullName: z.string().min(1).max(200),
});

export const updateAdminStatusSchema = z.object({
  active: z.boolean(),
});

export const updateAdminProfileSchema = z.object({
  email: z.string().email().toLowerCase(),
  fullName: z.string().min(1).max(200),
});
