/**
 * Shared email/password verification logic — used by BOTH the Credentials
 * provider's authorize() in lib/server/auth/authjs.ts (so Auth.js's own
 * /api/auth/callback/credentials endpoint and signIn("credentials", ...)
 * keep working) and app/api/auth/password-login/route.ts (which mints its
 * own session cookie directly via encode(), bypassing signIn()'s cookie
 * mechanism — see that file for why). One implementation, no drift risk.
 */

import bcrypt from "bcryptjs";
import { CredentialsSignin } from "next-auth";
import { findRealtorForPasswordLogin, bumpLoginNow } from "@/lib/server/realtors-store";
import { passwordLoginSchema } from "@/lib/server/schemas/auth";

// Thrown when the password is correct but the account hasn't completed
// email verification. A CredentialsSignin subclass so it survives
// signIn({ redirect: false }) as a catchable error when thrown from
// authorize() — plain Error instances do not (@auth/core only re-throws
// AuthError instances from a raw, non-redirect signIn() call and otherwise
// swallows them into a redirect-URL response). Doesn't matter for the
// direct verifyCredentials() call path, but harmless either way.
export class EmailNotVerifiedError extends CredentialsSignin {
  code = "email_not_verified";
}

// Matches the shape of a real bcrypt hash so the compare() below takes
// roughly the same time as a real check — prevents timing-based account
// enumeration on unknown emails / accounts with no password set yet.
const DUMMY_HASH = "$2b$12$0000000000000000000000.0000000000000000000000000000000";

export interface VerifiedCredentials {
  realtorId: string;
  email: string;
  emailVerified: Date;
}

/**
 * Returns null for invalid credentials (unknown email, wrong password —
 * intentionally the same generic outcome to prevent enumeration). Throws
 * EmailNotVerifiedError when the password is correct but the account is
 * unverified.
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<VerifiedCredentials | null> {
  const parsed = passwordLoginSchema.safeParse({ email, password });
  if (!parsed.success) return null;

  const realtor = await findRealtorForPasswordLogin(parsed.data.email);

  if (!realtor || !realtor.password_hash) {
    // Compare against a dummy hash so the response time is roughly the
    // same as a real password check, whether or not the account exists.
    await bcrypt.compare(parsed.data.password, DUMMY_HASH);
    return null;
  }

  const ok = await bcrypt.compare(parsed.data.password, realtor.password_hash);
  if (!ok) return null;

  if (!realtor.email_verified_at) {
    throw new EmailNotVerifiedError();
  }

  await bumpLoginNow(realtor.id);

  return { realtorId: realtor.id, email: realtor.email, emailVerified: realtor.email_verified_at };
}
