/**
 * Sign in with Apple — OAuth 2.0 / OpenID Connect web flow.
 *
 * This is the cross-platform implementation (iOS Capacitor, Android Capacitor,
 * and web). It follows Apple's documented OAuth pattern at
 * https://developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_js
 * and https://developer.apple.com/documentation/signinwithapplerestapi
 *
 * Flow:
 *   1.  Client hits /api/auth/apple/start
 *       → server generates `state` + `nonce`, stashes their HMACs in a
 *         short-lived cookie, and 302-redirects to
 *         appleid.apple.com/auth/authorize?response_type=code&response_mode=form_post&...
 *   2.  User authenticates on Apple's domain (or grants consent if first time).
 *   3.  Apple POSTs back to /api/auth/apple/callback with `code`, `state`,
 *       and `id_token`. Optionally `user` (name/email JSON) on FIRST auth.
 *   4.  Callback verifies `state` (against cookie HMAC), exchanges `code` at
 *       Apple's token endpoint using a freshly-minted ES256 client_secret JWT
 *       signed with our .p8 key, verifies the returned id_token against
 *       Apple's JWKS, then either looks up an existing realtor (by apple_sub
 *       or email) or creates a new one. Sets the realtor session cookie and
 *       302-redirects to /dashboard.
 *
 * Required env vars:
 *   APPLE_SERVICES_ID   — Services ID from Apple Developer Portal (e.g.
 *                         app.realtynewsnow.web). NOT the App ID.
 *   APPLE_TEAM_ID       — 10-char team ID (3JU7K7AMUY).
 *   APPLE_KEY_ID        — 10-char Key ID of the Sign in with Apple .p8 key.
 *   APPLE_PRIVATE_KEY   — Full contents of the .p8 file, including
 *                         BEGIN/END markers, newlines preserved.
 *   APPLE_REDIRECT_URI  — Must EXACTLY match one of the Return URLs
 *                         configured on the Services ID, e.g.
 *                         https://realtynewsnow.app/api/auth/apple/callback
 *   APPLE_STATE_SECRET  — Random string used to HMAC the state cookie so
 *                         the client can't forge it.
 */

import { createHmac, randomBytes } from 'crypto';
import { SignJWT, importPKCS8, jwtVerify, createRemoteJWKSet } from 'jose';

// ---------------------------------------------------------------------------
// Env access — fail loudly at request time, NOT at module import time.
// (Module import happens during Next.js build where these may not be set.)
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Sign in with Apple is not configured: missing ${name}`);
  return v;
}

export function isAppleOAuthConfigured(): boolean {
  return Boolean(
    process.env.APPLE_SERVICES_ID &&
      process.env.APPLE_TEAM_ID &&
      process.env.APPLE_KEY_ID &&
      process.env.APPLE_PRIVATE_KEY &&
      process.env.APPLE_REDIRECT_URI &&
      process.env.APPLE_STATE_SECRET,
  );
}

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_AUTHORIZE_URL = 'https://appleid.apple.com/auth/authorize';
const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';

// ---------------------------------------------------------------------------
// State + nonce HMAC helpers
//
// We don't put the raw state/nonce in the cookie; we put their HMAC. That way
// the cookie can't be replayed or forged by the client, and we don't have to
// persist anything server-side.
// ---------------------------------------------------------------------------

export function generateStateAndNonce(): { state: string; nonce: string } {
  return {
    state: randomBytes(24).toString('hex'),
    nonce: randomBytes(24).toString('hex'),
  };
}

function hmac(value: string): string {
  return createHmac('sha256', requireEnv('APPLE_STATE_SECRET'))
    .update(value)
    .digest('hex');
}

export function buildStateCookieValue(state: string, nonce: string): string {
  // Cookie payload: stateHmac + ":" + nonceHmac. No raw values stored.
  return `${hmac(state)}:${hmac(nonce)}`;
}

export function verifyStateAgainstCookie(
  receivedState: string,
  cookieValue: string,
): { ok: boolean; nonceHmac: string | null } {
  if (!cookieValue || !cookieValue.includes(':')) {
    return { ok: false, nonceHmac: null };
  }
  const [storedStateHmac, storedNonceHmac] = cookieValue.split(':');
  const candidateHmac = hmac(receivedState);
  // Constant-time-ish compare — both values are hex of equal length.
  if (
    candidateHmac.length !== storedStateHmac.length ||
    candidateHmac !== storedStateHmac
  ) {
    return { ok: false, nonceHmac: null };
  }
  return { ok: true, nonceHmac: storedNonceHmac };
}

// ---------------------------------------------------------------------------
// Authorize URL construction
// ---------------------------------------------------------------------------

/**
 * Build the URL we redirect the user's browser to in order to start the
 * Apple sign-in flow. response_mode=form_post is required when we request
 * `name` or `email` scopes — Apple posts the result rather than appending
 * it to the URL.
 */
export function buildAppleAuthorizeUrl(state: string, nonce: string): string {
  const params = new URLSearchParams({
    response_type: 'code id_token',
    response_mode: 'form_post',
    client_id: requireEnv('APPLE_SERVICES_ID'),
    redirect_uri: requireEnv('APPLE_REDIRECT_URI'),
    scope: 'name email',
    state,
    nonce,
  });
  return `${APPLE_AUTHORIZE_URL}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Client secret JWT (ES256, signed with the .p8 key)
//
// Apple's token endpoint requires a JWT as the client_secret. It must be
// signed with the ES256 algorithm using the private key from the .p8 file,
// have `kid` set to the Key ID, `iss` set to the Team ID, `sub` set to the
// Services ID, `aud` set to https://appleid.apple.com, and a short lifetime
// (Apple allows up to 6 months, we use 5 minutes — they're single-use).
// ---------------------------------------------------------------------------

async function makeClientSecret(): Promise<string> {
  // Normalize the .p8: env-var stores may collapse \n into a literal `\n`.
  const raw = requireEnv('APPLE_PRIVATE_KEY').replace(/\\n/g, '\n');
  const privateKey = await importPKCS8(raw, 'ES256');

  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: requireEnv('APPLE_KEY_ID') })
    .setIssuer(requireEnv('APPLE_TEAM_ID'))
    .setSubject(requireEnv('APPLE_SERVICES_ID'))
    .setAudience(APPLE_ISSUER)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}

// ---------------------------------------------------------------------------
// Token exchange + id_token verification
// ---------------------------------------------------------------------------

interface AppleTokenResponse {
  access_token: string;
  expires_in: number;
  id_token: string;
  refresh_token?: string;
  token_type: 'Bearer';
}

export async function exchangeCodeForTokens(
  code: string,
): Promise<AppleTokenResponse> {
  const clientSecret = await makeClientSecret();
  const body = new URLSearchParams({
    client_id: requireEnv('APPLE_SERVICES_ID'),
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: requireEnv('APPLE_REDIRECT_URI'),
  });
  const res = await fetch(APPLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Apple token exchange failed: ${res.status} ${text.slice(0, 200)}`,
    );
  }
  return JSON.parse(text) as AppleTokenResponse;
}

export interface AppleIdTokenClaims {
  sub: string; // Stable per-team Apple user identifier
  email?: string;
  email_verified?: boolean | string;
  is_private_email?: boolean | string;
  nonce?: string;
  iss: string;
  aud: string;
  exp: number;
  iat: number;
}

// Cache the JWKS fetcher (jose handles its own internal caching).
const JWKS = createRemoteJWKSet(new URL(APPLE_JWKS_URL));

export async function verifyAppleIdToken(
  idToken: string,
  expectedNonceHmac: string | null,
): Promise<AppleIdTokenClaims> {
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: APPLE_ISSUER,
    audience: requireEnv('APPLE_SERVICES_ID'),
  });
  const claims = payload as unknown as AppleIdTokenClaims;

  if (!claims.sub) throw new Error('Apple id_token missing sub claim');

  // Nonce binding: Apple echoes back exactly the nonce we sent in the
  // authorize URL. We HMAC'd it and stored that in the cookie; now we HMAC
  // the echoed nonce and compare to the cookie value.
  if (expectedNonceHmac) {
    if (!claims.nonce) throw new Error('Apple id_token missing nonce claim');
    const echoedHmac = createHmac('sha256', requireEnv('APPLE_STATE_SECRET'))
      .update(claims.nonce)
      .digest('hex');
    if (echoedHmac !== expectedNonceHmac) {
      throw new Error('Apple id_token nonce mismatch');
    }
  }

  return claims;
}

// ---------------------------------------------------------------------------
// First-authorization name parsing
//
// On the FIRST authorization (and only the first) Apple posts a `user`
// form field containing JSON like:
//   { "name": { "firstName": "Tawanna", "lastName": "Verock" }, "email": "..." }
// On subsequent authorizations Apple does NOT send this — we must rely on
// what we stored at first sign-in.
// ---------------------------------------------------------------------------

export interface AppleFirstAuthName {
  firstName: string;
  lastName: string;
}

export function parseAppleUserField(userField: string | null): AppleFirstAuthName {
  if (!userField) return { firstName: '', lastName: '' };
  try {
    const parsed = JSON.parse(userField) as {
      name?: { firstName?: string; lastName?: string };
    };
    return {
      firstName: parsed.name?.firstName ?? '',
      lastName: parsed.name?.lastName ?? '',
    };
  } catch {
    return { firstName: '', lastName: '' };
  }
}
