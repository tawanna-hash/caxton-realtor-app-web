/**
 * Shared password hashing constants and helpers.
 *
 * Centralizes the bcrypt cost factor so realtor signup, realtor reset,
 * realtor set-password, and admin reset all hash at the same strength.
 * Prior to this module, the admin reset route was stuck at cost 10 while
 * everywhere else used 12 — meaning admins were the weakest accounts in
 * the system. See auth-audit/sign-in-audit-2026-06-20.md (H1).
 *
 * The DUMMY_HASH used by login routes for constant-time email enumeration
 * defense is also pinned at this cost so timing matches real hashes.
 */

import bcrypt from 'bcryptjs';

export const BCRYPT_ROUNDS = 12;

export function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
}

export function comparePassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}
