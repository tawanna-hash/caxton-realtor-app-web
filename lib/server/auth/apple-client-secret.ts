/**
 * Shared Apple `client_secret` JWT signer.
 *
 * Apple's token endpoint requires a JWT as the client_secret, signed with
 * ES256 using the .p8 private key, `kid` = Key ID, `iss` = Team ID,
 * `sub` = Services ID, `aud` = https://appleid.apple.com.
 *
 * Extracted out of lib/server/apple-oauth.ts (which uses a fixed 5-minute
 * expiry for its per-request custom OAuth flow) so lib/server/auth/authjs.ts
 * can reuse the same signing logic with a longer expiry for its
 * module-scope cached client_secret (Auth.js's Apple provider reads
 * clientSecret as a plain string, not an async function).
 */

import { SignJWT, importPKCS8 } from 'jose';

const APPLE_ISSUER = 'https://appleid.apple.com';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Sign in with Apple is not configured: missing ${name}`);
  return v;
}

export async function signAppleClientSecret(expiresIn: string): Promise<string> {
  // Normalize the .p8: env-var stores may collapse \n into a literal `\n`.
  const raw = requireEnv('APPLE_PRIVATE_KEY').replace(/\\n/g, '\n');
  const privateKey = await importPKCS8(raw, 'ES256');

  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: requireEnv('APPLE_KEY_ID') })
    .setIssuer(requireEnv('APPLE_TEAM_ID'))
    .setSubject(requireEnv('APPLE_SERVICES_ID'))
    .setAudience(APPLE_ISSUER)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(privateKey);
}
