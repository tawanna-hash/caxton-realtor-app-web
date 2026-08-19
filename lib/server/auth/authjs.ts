import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { getPool } from "@/lib/server/db/neon";
import { verifyAndClaimInternalTrustToken } from "./internal-trust-token";
import { verifyCredentials, EmailNotVerifiedError } from "./verify-credentials";
import { realtorAdapter } from "./adapter";
import { logger } from "@/lib/server/logger";

// Provider id for the internal-trusted Credentials provider below. Exported
// so app/api/auth/[...nextauth]/route.ts can filter it out of the
// /api/auth/providers listing by id rather than a hardcoded string.
export const INTERNAL_TRUSTED_PROVIDER_ID = "internal-trusted";

// Re-exported so existing call sites (app/api/auth/password-login/route.ts)
// don't need to know it actually lives in ./verify-credentials.
export { EmailNotVerifiedError };

// -----------------------------------------------------------------------

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: realtorAdapter(),
  // Trust the request Host header. Required on Vercel (and any reverse-proxied
  // deployment) so Auth.js doesn't throw UntrustedHost on every auth() call.
  // Without this, getCurrentUser() returned null in production for signed-in
  // users → /api/auth/me returned { realtor: null } → the drawer showed LOGIN.
  // https://authjs.dev/getting-started/deployment#securing-a-preview-deployment
  trustHost: true,
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
        if (typeof creds?.email !== "string" || typeof creds?.password !== "string") {
          return null;
        }
        const result = await verifyCredentials(creds.email, creds.password);
        if (!result) return null;

        return {
          id: result.realtorId,
          email: result.email,
          emailVerified: result.emailVerified,
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
  ],

  callbacks: {
    async signIn() {
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
    signIn: "/dashboard",
    error: "/dashboard",
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
