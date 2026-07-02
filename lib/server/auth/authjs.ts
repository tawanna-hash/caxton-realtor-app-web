import NextAuth, { CredentialsSignin, customFetch } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Apple from "next-auth/providers/apple";
import bcrypt from "bcryptjs";
import { getPool } from "@/lib/server/db/neon";
import { findRealtorForPasswordLogin, bumpLoginNow } from "@/lib/server/realtors-store";
import { passwordLoginSchema } from "@/lib/server/schemas/auth";
import { signAppleClientSecret } from "./apple-client-secret";
import { verifyAndClaimInternalTrustToken } from "./internal-trust-token";
import { realtorAdapter } from "./adapter";
import { logger } from "@/lib/server/logger";

// Provider id for the internal-trusted Credentials provider below. Exported
// so app/api/auth/[...nextauth]/route.ts can filter it out of the
// /api/auth/providers listing by id rather than a hardcoded string.
export const INTERNAL_TRUSTED_PROVIDER_ID = "internal-trusted";

// Thrown from the Credentials authorize() below when the password is
// correct but the account hasn't completed email verification. A
// CredentialsSignin subclass propagates through signIn({ redirect: false })
// as a catchable error (plain Error instances do not — @auth/core only
// re-throws AuthError instances from a raw, non-redirect signIn() call and
// otherwise swallows them into a redirect-URL response).
export class EmailNotVerifiedError extends CredentialsSignin {
  code = "email_not_verified";
}

// Matches the shape of a real bcrypt hash so the compare() below takes
// roughly the same time as a real check — prevents timing-based account
// enumeration on unknown emails / accounts with no password set yet.
const DUMMY_HASH = "$2b$12$0000000000000000000000.0000000000000000000000000000000";

// -----------------------------------------------------------------------
// Apple client_secret JWT — module-scope cache
//
// Auth.js's Apple provider reads `clientSecret` as a plain string at
// request time (@auth/core/lib/actions/callback/oauth/callback.js reads
// `provider.clientSecret` directly, not awaited), so it can't be an async
// function. We cache a long-lived (well under Apple's 6-month max) signed
// JWT at module scope and expose it via a getter so every read reflects
// the current cached value. The [customFetch] hook below regenerates and
// retries once if Apple ever rejects it (expired early, key rotated, etc).
// -----------------------------------------------------------------------

const APPLE_CLIENT_SECRET_TTL = "24h";
const APPLE_CLIENT_SECRET_TTL_MS = 24 * 60 * 60 * 1000;
const APPLE_CLIENT_SECRET_REFRESH_BUFFER_MS = 5 * 60 * 1000; // regenerate 5m before expiry
const APPLE_TOKEN_ENDPOINT = "https://appleid.apple.com/auth/token";

let cachedAppleClientSecret: { jwt: string; expiresAt: number } | null = null;

async function getAppleClientSecret(opts: { forceRefresh?: boolean } = {}): Promise<string> {
  const now = Date.now();
  if (
    !opts.forceRefresh &&
    cachedAppleClientSecret &&
    cachedAppleClientSecret.expiresAt - now > APPLE_CLIENT_SECRET_REFRESH_BUFFER_MS
  ) {
    return cachedAppleClientSecret.jwt;
  }
  const jwt = await signAppleClientSecret(APPLE_CLIENT_SECRET_TTL);
  cachedAppleClientSecret = { jwt, expiresAt: now + APPLE_CLIENT_SECRET_TTL_MS };
  return jwt;
}

// Best-effort warm-up so the clientSecret getter below has a value ready
// by the time a real Apple sign-in request comes in. Deliberately NOT
// awaited at module scope — this must not block or fail module load for
// environments (local dev, non-Apple flows) that lack Apple env vars;
// Credentials sign-in must keep working regardless. If this fails, or if
// a request arrives before it resolves, the getter below just returns ""
// and the [customFetch] retry-on-401 path (re)generates it on first use.
void getAppleClientSecret().catch((err) => {
  logger.warn({ err }, "Apple client_secret JWT warm-up failed (Apple sign-in is dormant)");
});

function isAppleTokenRequest(url: string | URL | Request): boolean {
  const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
  return href.startsWith(APPLE_TOKEN_ENDPOINT);
}

async function appleTokenFetchWithRetry(
  ...args: Parameters<typeof fetch>
): ReturnType<typeof fetch> {
  const [url, init] = args;
  const res = await fetch(url, init);

  if (!isAppleTokenRequest(url) || res.status !== 401) return res;

  // Apple rejected our client_secret (401). Could be our cache is stale
  // (clock skew, unexpectedly long-lived warm instance) or Apple rotated
  // something. Regenerate once and retry exactly once — do not loop; a
  // second failure means a real config problem (wrong key/team/services
  // ID), and we want that to surface as an error, not retry forever.
  logger.warn("Apple token endpoint returned 401; regenerating client_secret and retrying once");

  const freshSecret = await getAppleClientSecret({ forceRefresh: true });
  let retryInit = init;
  if (init?.body && typeof init.body === "string" && init.body.includes("client_secret=")) {
    const params = new URLSearchParams(init.body);
    params.set("client_secret", freshSecret);
    retryInit = { ...init, body: params.toString() };
  }
  return fetch(url, retryInit);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: realtorAdapter(),
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
  cookies: {
    sessionToken: {
      // CRITICAL: must match caxton_session_v2 so the iOS Capacitor app's
      // existing fetch() keeps working. Do not change without also updating
      // every ios/App/App/*.swift reference and the Capacitor config.
      name: "caxton_session_v2",
      options: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      },
    },
  },
  secret: process.env.JWT_SECRET, // reuse existing secret — no env churn
  providers: [
    Credentials({
      name: "email-password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        const parsed = passwordLoginSchema.safeParse(creds);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const realtor = await findRealtorForPasswordLogin(email);

        if (!realtor || !realtor.password_hash) {
          // Compare against a dummy hash so the response time is roughly
          // the same as a real password check, whether or not the account
          // exists — this is the same anti-enumeration measure the manual
          // password-login route used before this migration.
          await bcrypt.compare(password, DUMMY_HASH);
          return null;
        }

        const ok = await bcrypt.compare(password, realtor.password_hash);
        if (!ok) return null;

        if (!realtor.email_verified_at) {
          throw new EmailNotVerifiedError();
        }

        await bumpLoginNow(realtor.id);

        return {
          id: realtor.id,
          email: realtor.email,
          emailVerified: realtor.email_verified_at,
        };
      },
    }),

    // -----------------------------------------------------------------
    // Internal-trusted sign-in — NOT a real credentials provider.
    //
    // Lets a route that has already verified the user by some other means
    // (magic-link token in verify/route.ts, reset-token in
    // reset-password/route.ts) hand off to Auth.js without a password.
    // The "password" here is a short-lived, single-use, signed token (see
    // lib/server/auth/internal-trust-token.ts) — never a real credential.
    //
    // SECURITY: this provider must NEVER be reachable from client code.
    // No form, button, or fetch() in app/ may reference provider id
    // "internal-trusted" or POST to /api/auth/callback/internal-trusted.
    // It's also stripped from the /api/auth/providers listing in
    // app/api/auth/[...nextauth]/route.ts so it isn't discoverable there.
    // Only server-side signIn("internal-trusted", { realtorId, token,
    // redirect: false }) calls are legitimate.
    // -----------------------------------------------------------------
    Credentials({
      id: INTERNAL_TRUSTED_PROVIDER_ID,
      name: "internal-trusted",
      credentials: { realtorId: {}, token: {} },
      async authorize(creds) {
        if (typeof creds?.realtorId !== "string" || typeof creds?.token !== "string") {
          return null;
        }
        const claim = await verifyAndClaimInternalTrustToken(creds.token);
        if (!claim || claim.realtorId !== creds.realtorId) return null;

        const { rows } = await getPool().query(
          `SELECT id, email, email_verified_at FROM realtors WHERE id = $1::uuid`,
          [claim.realtorId]
        );
        const realtor = rows[0];
        if (!realtor) return null;

        return {
          id: realtor.id,
          email: realtor.email,
          emailVerified: realtor.email_verified_at,
        };
      },
    }),

    Apple({
      clientId: process.env.APPLE_SERVICES_ID!, // app.realtynewsnow.web
      // A live getter, not a static string: always reflects the current
      // module-scope cached JWT (see getAppleClientSecret above). Returns
      // "" before the first successful generation — Apple will reject that
      // with 401, which [customFetch] below catches, regenerates, and
      // retries once.
      get clientSecret() {
        return cachedAppleClientSecret?.jwt ?? "";
      },
      [customFetch]: appleTokenFetchWithRetry,
      // Apple posts back to /api/auth/callback/apple with form_post + code + id_token.
      // Auth.js handles verification, JWKS fetch, and state/nonce internally.
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      // -- Apple provider: enforce "must sign up first" rule ---------------
      if (account?.provider === "apple") {
        if (!user.email) {
          // Apple did not release the email (private relay revoked, or
          // second sign-in where we asked for `name email` scope again).
          // Reject — we cannot match to a realtor without an email.
          logger.warn({ providerAccountId: account.providerAccountId },
            "Apple sign-in rejected: no email in id_token");
          return "/dashboard?auth=login&apple_error=no_email";
        }

        // Look up an existing realtor by email.
        const { rows } = await getPool().query(
          `SELECT id, email_verified_at
             FROM realtors
            WHERE lower(email) = lower($1::text)`,
          [user.email]
        );
        const existing = rows[0];

        if (!existing) {
          // No realtor row — bounce to signup with email pre-filled.
          // The signup form should read ?apple_email= and pre-populate.
          return `/dashboard?auth=signup&apple_email=${encodeURIComponent(user.email)}`;
        }

        if (!existing.email_verified_at) {
          // Realtor exists but never verified. Reject until they finish.
          return `/dashboard?auth=login&apple_error=unverified_email&email=${encodeURIComponent(user.email)}`;
        }

        // Realtor exists and is verified — allow the sign-in.
        // The adapter will attach the Apple identity via linkAccount().
        return true;
      }

      // -- Credentials provider: always allow (auth already verified) -----
      return true;
    },

    async jwt({ token, user }) {
      // First call after sign-in: `user` is populated. Persist realtor id.
      if (user?.id) {
        token.realtorId = user.id;
        token.email = user.email;
      }
      return token;
    },

    async session({ session, token }) {
      // Expose realtorId on the session for API routes / pages.
      if (session.user) {
        session.user.realtorId = token.realtorId;
      }
      return session;
    },
  },

  pages: {
    signIn: "/dashboard?auth=login",
    error: "/dashboard?auth=login",
  },

  events: {
    async signIn({ user, account }) {
      logger.info(
        { realtorId: user.id, provider: account?.provider },
        "Auth.js sign-in succeeded"
      );
    },
  },
});

// Extend the default Session type so `session.user.realtorId` is typed.
declare module "next-auth" {
  interface Session {
    user: {
      realtorId: string;
      email: string;
      name?: string | null;
    };
  }
}

// Extend the default JWT type so `token.realtorId` is typed.
declare module "@auth/core/jwt" {
  interface JWT {
    realtorId: string;
  }
}
