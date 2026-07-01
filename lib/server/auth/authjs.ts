import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Apple from "next-auth/providers/apple";
import bcrypt from "bcryptjs";
import { getPool } from "@/lib/server/db/neon";
import { realtorAdapter } from "./adapter";
import { logger } from "@/lib/server/logger";

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
        if (!creds?.email || !creds?.password) return null;

        const { rows } = await getPool().query(
          `SELECT id, email, password_hash, email_verified_at, first_name, last_name
             FROM realtors
            WHERE lower(email) = lower($1::text)`,
          [creds.email]
        );
        const r = rows[0];
        if (!r || !r.password_hash) return null;

        const ok = await bcrypt.compare(String(creds.password), r.password_hash);
        if (!ok) return null;

        return {
          id: r.id,
          email: r.email,
          emailVerified: r.email_verified_at,
          name: `${r.first_name} ${r.last_name}`,
        };
      },
    }),

    Apple({
      clientId: process.env.APPLE_SERVICES_ID!, // app.realtynewsnow.web
      // TODO(Phase 3): @auth/core's Apple provider takes a pre-built JWT
      // string here, NOT {teamId, privateKey, keyId} — it does not build
      // the client_secret JWT for you (verified against
      // node_modules/@auth/core/providers/apple.d.ts). Provider is dormant
      // until Phase 3, so this is a placeholder pending real JWT generation.
      clientSecret: {
        teamId: process.env.APPLE_TEAM_ID!,
        privateKey: process.env.APPLE_PRIVATE_KEY!,
        keyId: process.env.APPLE_KEY_ID!,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
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
