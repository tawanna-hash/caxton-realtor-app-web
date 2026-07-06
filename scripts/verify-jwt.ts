/**
 * One-off diagnostic: decode a caxton_session_v2 cookie value the same way
 * Auth.js itself would (proxy.ts's getToken(), lib/server/auth/authjs.ts's
 * auth()) to prove a cookie minted by encode() in
 * app/api/auth/password-login/route.ts is byte-compatible with what the
 * rest of the app expects to read.
 *
 * Usage (JWT_SECRET must be in the environment — e.g. after
 * `source .env.production.local`):
 *   node <transpiled-output>.js "<cookie value>"
 */

import { decode } from 'next-auth/jwt';

async function main() {
  const token = process.argv[2];
  if (!token) {
    console.error('Usage: verify-jwt.ts "<cookie value>"');
    process.exit(1);
  }
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('JWT_SECRET not set in environment');
    process.exit(1);
  }

  // salt must match authjs.ts's cookies.sessionToken.name — same
  // requirement as the encode() call in password-login/route.ts.
  const payload = await decode({
    token,
    secret,
    salt: 'caxton_session_v2',
  });

  if (!payload) {
    console.error('DECODE FAILED — token is invalid, expired, or salt/secret mismatch');
    process.exit(1);
  }

  console.log('DECODED PAYLOAD:');
  console.log(JSON.stringify(payload, null, 2));
}

main();
