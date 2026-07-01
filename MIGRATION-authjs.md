# Migration: Custom Auth → Auth.js v5 (NextAuth)

**Status**: Ready to execute.
**Estimated effort**: 6 hours of Claude Code, split across 5 independently-deployable phases.
**Cost**: $0 (Auth.js is MIT licensed; keeps existing Vercel + Neon).
**Repo**: `tawanna-hash/caxton-realtor-app-web`
**Runtime target**: Next.js 16 App Router, React 19, Node runtime routes only.

---

## Table of contents

1. [Why we're doing this](#1-why-were-doing-this)
2. [Design decisions](#2-design-decisions)
3. [Constraints & standing rules](#3-constraints--standing-rules)
4. [Phase 1 — Install & adapter](#phase-1--install--adapter-2-hours)
5. [Phase 2 — Credentials provider (email/password)](#phase-2--credentials-provider-emailpassword-1-hour)
6. [Phase 3 — Apple provider + signup-first rule](#phase-3--apple-provider--signup-first-rule-2-hours)
7. [Phase 4 — Session-consumer sweep](#phase-4--session-consumer-sweep-30-min)
8. [Phase 5 — Delete dead code](#phase-5--delete-dead-code-30-min)
9. [Rollback strategy](#9-rollback-strategy)
10. [Post-migration verification checklist](#10-post-migration-verification-checklist)

---

## 1. Why we're doing this

The custom auth stack has cost us multiple production incidents:

- **Magic-link jar split** on iOS Capacitor (WKWebView vs Safari) — required emergency auto-sign-in path in `/api/auth/signup`.
- **42P08 ambiguous_parameter** on Neon pooled connections — required INSERT rewrite in commit `86929ab`.
- **Apple OAuth complexity** — 593 lines of hand-rolled JWT signing, JWKS verification, state/nonce HMAC, and callback handling in `lib/server/apple-oauth.ts` + `app/api/auth/apple/*`.
- **Ongoing "Internal server error"** on manual signup (unresolved as of 2026-07-01).

Auth.js replaces all of that with a maintained library that:

- Owns the session cookie in the same jar as the WebView's `fetch()` — no more magic-link redirects out to Safari.
- Handles Apple's `client_secret` JWT + JWKS verification + state/nonce natively.
- Has an official Postgres adapter (`@auth/pg-adapter`) that maps to our existing `realtors` table via a custom shim.
- Is free, MIT licensed, runs on our existing infra.

## 2. Design decisions

### D1: Keep the `realtors` table as-is

We will NOT migrate to Auth.js's default `users` / `accounts` / `sessions` / `verification_tokens` tables. Reasons:

- 40+ downstream tables reference `realtors.id` as FK.
- Admin CRM, mailing lists, invoices, giveaways all query `realtors` directly.
- Column layout (TREC/NMLS licenses, market, subscriptions, consent tracking) is domain-specific.

Instead, we write a **custom adapter** that implements the Auth.js `Adapter` interface but reads/writes `realtors` + a new small `realtor_oauth_accounts` table. The Auth.js library sees a standard adapter; our code sees the existing schema.

### D2: JWT session strategy, not database session

We use `session: { strategy: "jwt" }` in the Auth.js config. Reasons:

- No DB roundtrip on every request — matches current architecture where session verification is a signed cookie read.
- Fewer moving parts. No `sessions` table to add.
- Works fine with the "signup-first" rule because that's enforced at the `signIn` callback (before the JWT is issued).

### D3: Manual signup remains a plain POST endpoint

The signup form does NOT go through Auth.js. It hits our existing `/api/auth/signup` route which:
1. Runs Zod validation.
2. Hashes password with bcrypt.
3. INSERTs into `realtors`.
4. Calls Auth.js's `signIn("credentials")` server-side to establish the session cookie.
5. Returns the auto-sign-in response.

This preserves the auto-sign-in fix (WKWebView cookie jar) and keeps all Zod validation intact.

### D4: Apple sign-in enforces "must sign up first"

Per user rule: *"Each user must manually sign up before using Apple to sign in."*

The Auth.js `signIn` callback rejects any Apple sign-in whose email has no matching `realtors` row, and redirects the user to the signup form with the email pre-filled. On first successful signup, they can then use Apple sign-in normally.

### D5: We keep magic-link for password reset only

The `magic_link_tokens` table stays. The endpoint stays. But its purpose narrows to **password reset only** — no more using magic links for initial email verification (which was the source of the WKWebView bug). Email verification is handled by:
- Users who set a password at signup → auto-verified (as today, commit `86929ab`).
- Users who need to re-verify → password reset flow.

### D6: Admin auth is NOT migrated in this phase

`app/admin/*` uses a separate `caxton_admin_session_v2` cookie signed by `ADMIN_JWT_SECRET`. Leave it alone. Migrating admin auth is a separate future project. This spec only touches realtor auth.

## 3. Constraints & standing rules

- **ALWAYS `confirm_action` before pushing to `main`.** (User standing rule.)
- **NEVER combine `["github", "vercel"]` in one bash call.**
- **Use `api_credentials=["github"]` for `git push`.**
- **ALWAYS typecheck + lint before commit; use `--no-verify`.**
- **Every change or addition must be iOS-preferred going forward.**
- **Sign in with Apple uses OAuth web flow (path 2) — NOT the Capacitor plugin.**
- **Apple Team**: Tawanna Verock personal only (Team ID `3JU7K7AMUY`, DBA "Caxton Publications"). Apple ID: `tawanna@verock.com`.
- **Realtor cookie name**: `caxton_session_v2` (must stay identical — used by Capacitor `fetch()` in the iOS app).
- **After each phase**: run `pnpm typecheck && pnpm lint`. If clean, commit. Push at end of phase after `confirm_action`.

---

## Phase 1 — Install & adapter (2 hours)

Goal: Auth.js installed, custom adapter written and unit-tested. **No behavior change** to production yet. Both auth systems coexist. Deployable safely.

### 1.1 Install dependencies

```bash
pnpm add next-auth@beta @auth/core
```

Auth.js v5 for Next.js is published as `next-auth@beta` (this is intentional; v5 is production-ready). `@auth/core` provides adapter types.

### 1.2 Add a small OAuth-account table (Neon)

Create a migration file `neon/migrations/2026-07-01_authjs_oauth_accounts.sql`:

```sql
-- Auth.js requires a table to link OAuth provider identities to our
-- existing realtor rows. We keep this table intentionally minimal —
-- everything else lives on realtors.
CREATE TABLE IF NOT EXISTS realtor_oauth_accounts (
  realtor_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,              -- 'apple', 'google', etc.
  provider_account_id TEXT NOT NULL,   -- Apple's `sub` claim
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, provider_account_id),
  UNIQUE (realtor_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_realtor_oauth_realtor
  ON realtor_oauth_accounts (realtor_id);
```

Apply via existing migration mechanism (check `lib/server/db.ts` or run against Neon directly with `psql`).

### 1.3 Create the custom adapter

`lib/server/auth/adapter.ts`:

```ts
import type { Adapter, AdapterUser, AdapterAccount } from "@auth/core/adapters";
import { pool } from "@/lib/server/db";

/**
 * Custom Auth.js adapter that maps the standard `users` / `accounts` shape
 * to our existing `realtors` + `realtor_oauth_accounts` tables.
 *
 * We do NOT implement session methods because we use JWT session strategy.
 * We do NOT implement verification token methods because we handle magic
 * links ourselves for password reset only.
 */
export function realtorAdapter(): Adapter {
  return {
    async getUser(id) {
      const { rows } = await pool.query(
        `SELECT id, email, email_verified_at, first_name, last_name
           FROM realtors WHERE id = $1::uuid`,
        [id]
      );
      const r = rows[0];
      if (!r) return null;
      return {
        id: r.id,
        email: r.email,
        emailVerified: r.email_verified_at,
        name: `${r.first_name} ${r.last_name}`,
      };
    },

    async getUserByEmail(email) {
      const { rows } = await pool.query(
        `SELECT id, email, email_verified_at, first_name, last_name
           FROM realtors WHERE lower(email) = lower($1::text)`,
        [email]
      );
      const r = rows[0];
      if (!r) return null;
      return {
        id: r.id,
        email: r.email,
        emailVerified: r.email_verified_at,
        name: `${r.first_name} ${r.last_name}`,
      };
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const { rows } = await pool.query(
        `SELECT r.id, r.email, r.email_verified_at, r.first_name, r.last_name
           FROM realtor_oauth_accounts oa
           JOIN realtors r ON r.id = oa.realtor_id
          WHERE oa.provider = $1::text AND oa.provider_account_id = $2::text`,
        [provider, providerAccountId]
      );
      const r = rows[0];
      if (!r) return null;
      return {
        id: r.id,
        email: r.email,
        emailVerified: r.email_verified_at,
        name: `${r.first_name} ${r.last_name}`,
      };
    },

    async linkAccount(account: AdapterAccount) {
      await pool.query(
        `INSERT INTO realtor_oauth_accounts (realtor_id, provider, provider_account_id)
         VALUES ($1::uuid, $2::text, $3::text)
         ON CONFLICT (provider, provider_account_id) DO NOTHING`,
        [account.userId, account.provider, account.providerAccountId]
      );
      return account;
    },

    // -- Intentionally NOT implemented --------------------------------------
    // We use JWT session strategy, so createSession/getSessionAndUser/etc.
    // are never called. We create realtor rows via our own /api/auth/signup
    // route, so createUser is never called by Auth.js. If any of these are
    // called something has gone wrong — throw to surface the bug.
    async createUser() {
      throw new Error(
        "realtorAdapter.createUser called — realtor creation must go through /api/auth/signup"
      );
    },
    async updateUser() {
      throw new Error("realtorAdapter.updateUser called — not implemented");
    },
    async deleteUser() {
      throw new Error("realtorAdapter.deleteUser called — not implemented");
    },
    async unlinkAccount() {
      throw new Error("realtorAdapter.unlinkAccount called — not implemented");
    },
  };
}
```

### 1.4 Create the Auth.js config file (dormant)

`lib/server/auth/authjs.ts`:

```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Apple from "next-auth/providers/apple";
import bcrypt from "bcryptjs";
import { pool } from "@/lib/server/db";
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

        const { rows } = await pool.query(
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
      clientSecret: {
        // Auth.js will build the client_secret JWT from these — no more
        // hand-rolled JWT signing in apple-oauth.ts.
        teamId: process.env.APPLE_TEAM_ID!,
        privateKey: process.env.APPLE_PRIVATE_KEY!,
        keyId: process.env.APPLE_KEY_ID!,
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
        const { rows } = await pool.query(
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
      if (user) {
        token.realtorId = user.id;
        token.email = user.email;
      }
      return token;
    },

    async session({ session, token }) {
      // Expose realtorId on the session for API routes / pages.
      if (session.user) {
        (session.user as any).realtorId = token.realtorId;
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
```

### 1.5 Wire the API route handler (dormant)

`app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/lib/server/auth/authjs";

export const { GET, POST } = handlers;
export const runtime = "nodejs";
```

At this point Auth.js endpoints exist at `/api/auth/*` (which is the same namespace as our custom routes — Next.js prefers explicit routes over catch-alls, so our existing `/api/auth/signup`, `/api/auth/login`, `/api/auth/apple/*` all still win). The Auth.js routes that ARE now live:

- `/api/auth/session` — used by client-side session hooks (not yet used).
- `/api/auth/csrf` — CSRF token endpoint (Auth.js internal).
- `/api/auth/callback/apple` — Apple's new callback URL (see phase 3 note below).
- `/api/auth/callback/credentials` — internal.

**Important**: We do NOT yet update the Apple Developer Portal callback URL. Apple still posts to `/api/auth/apple/callback` (the old custom route). Phase 3 handles the swap.

### 1.6 Env vars — none new

Auth.js reuses:
- `JWT_SECRET` (already set) — signs the JWT session cookie.
- `APPLE_SERVICES_ID`, `APPLE_TEAM_ID`, `APPLE_PRIVATE_KEY`, `APPLE_KEY_ID` (already set) — Apple provider config.
- `APPLE_REDIRECT_URI` — will change in Phase 3. Leave as-is for now.

No new Vercel env vars in Phase 1.

### 1.7 Phase 1 verification

```bash
pnpm typecheck && pnpm lint
```

Both must be clean. Also verify:

```bash
curl https://realtynewsnow.app/api/auth/csrf
# Should return {"csrfToken":"..."} — proves Auth.js is wired.

curl https://realtynewsnow.app/api/auth/signup -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
# Should return the SAME error as before — proves our custom route still wins.
```

### 1.8 Phase 1 commit

```
feat(auth): install Auth.js v5 and custom realtors adapter (dormant)

- Add next-auth@beta + @auth/core
- Create realtor_oauth_accounts table (Neon migration)
- Add realtorAdapter mapping to existing realtors table
- Wire /api/auth/[...nextauth] handler (dormant — existing routes win)
- Configure JWT session strategy, cookie name matches caxton_session_v2
- No behavior change to production yet

Migration spec: MIGRATION-authjs.md
```

Confirm + push. Phase 1 complete.

---

## Phase 2 — Credentials provider (email/password) (1 hour)

Goal: Manual signup and email/password login go through Auth.js. The custom session cookie code is deleted from those routes.

### 2.1 Rewrite `/api/auth/signup/route.ts`

Replace the manual `signSessionToken` + `setRealtorSessionCookie` calls with a server-side call to Auth.js's `signIn`. Shrink the file from 186 lines to ~90.

`app/api/auth/signup/route.ts` (new):

```ts
/**
 * /api/auth/signup  POST
 *
 * Creates the realtor record (or finds existing) and signs the user in
 * via Auth.js Credentials provider. Idempotent for enumeration protection.
 */

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { withErrorHandling } from "@/lib/server/error";
import { rateLimit } from "@/lib/server/rate-limit";
import { signupSchema } from "@/lib/server/schemas/auth";
import { createAndSendMagicLink } from "@/lib/server/magic-link";
import {
  findRealtorByEmailTx,
  insertRealtor,
  withNeonTransaction,
  type SignupRow,
} from "@/lib/server/realtors-store";
import { getRequestIp } from "@/lib/server/auth/admin";
import { signIn } from "@/lib/server/auth/authjs";
import { logger } from "@/lib/server/logger";

export const runtime = "nodejs";
const MAGIC_LINK_EXPIRY_MINUTES = Number(process.env.MAGIC_LINK_EXPIRY_MINUTES ?? 15);
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export const POST = withErrorHandling(async (req: Request) => {
  await rateLimit("auth");

  const input = signupSchema.parse(await req.json());
  const ipAddress = await getRequestIp();
  const userAgent = (await headers()).get("user-agent") ?? undefined;

  // ...license type normalization, birthday parsing, etc. — SAME AS TODAY...
  const normalizedLicenseType: "TREC" | "NMLS" | null = !input.licenseNumber
    ? null
    : input.licenseType?.startsWith("NMLS")
      ? "NMLS"
      : input.licenseType?.startsWith("TREC")
        ? "TREC"
        : null;
  const trecNumber = normalizedLicenseType === "TREC" ? (input.licenseNumber ?? null) : null;
  const nmlsNumber = normalizedLicenseType === "NMLS" ? (input.licenseNumber ?? null) : null;

  const monthIdx = input.birthdayMonth ? MONTH_NAMES.indexOf(input.birthdayMonth) : -1;
  const birthdayMonth = monthIdx >= 0 ? monthIdx + 1 : null;
  const birthdayDayRaw = input.birthdayDay ? parseInt(input.birthdayDay, 10) : NaN;
  const birthdayDay =
    Number.isFinite(birthdayDayRaw) && birthdayDayRaw >= 1 && birthdayDayRaw <= 31
      ? birthdayDayRaw
      : null;
  const safeBirthdayMonth = birthdayMonth !== null && birthdayDay !== null ? birthdayMonth : null;
  const safeBirthdayDay = birthdayMonth !== null && birthdayDay !== null ? birthdayDay : null;

  const passwordHash = input.password ? await bcrypt.hash(input.password, 12) : null;
  const autoSignIn = !!passwordHash;

  let newRealtorId: string | null = null;
  let existedAlready = false;
  let alreadyVerified = false;

  await withNeonTransaction(async (client) => {
    const existing = await findRealtorByEmailTx(client, input.email);
    if (existing) {
      existedAlready = true;
      alreadyVerified = !!existing.email_verified_at;
      return;
    }

    const row: SignupRow = {
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      market: input.market,
      consentText: input.consentText,
      ipAddress,
      normalizedLicenseType,
      trecNumber,
      nmlsNumber,
      title: input.title ?? null,
      mobile: input.mobile ?? null,
      mailingAddress: input.mailingAddress ?? null,
      mailingAddress2: input.mailingAddress2 ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      zip: input.zip ?? null,
      birthdayMonth: safeBirthdayMonth,
      birthdayDay: safeBirthdayDay,
      subscriptions: input.subscriptions ?? [],
      fbHandle: input.fbHandle ?? null,
      igHandle: input.igHandle ?? null,
      liHandle: input.liHandle ?? null,
      passwordHash,
    };
    const inserted = await insertRealtor(client, row, { autoVerifyEmail: autoSignIn });
    newRealtorId = inserted.id;
  });

  // -- Auto-sign-in path via Auth.js ---------------------------------------
  if (autoSignIn && newRealtorId && input.password) {
    try {
      // redirect: false → do not throw a NEXT_REDIRECT; return the response
      // so we can also return JSON. Auth.js sets the cookie on the response.
      await signIn("credentials", {
        email: input.email,
        password: input.password,
        redirect: false,
      });
      logger.info({ realtorId: newRealtorId }, "Signup auto-sign-in succeeded (Auth.js)");
      return NextResponse.json({
        success: true,
        autoSignedIn: true,
        message: "Account created. You are signed in.",
      });
    } catch (err) {
      logger.error({ err, realtorId: newRealtorId }, "Signup succeeded but auto-sign-in failed");
      return NextResponse.json({
        success: true,
        autoSignedIn: false,
        message: "Account created. Please sign in.",
      });
    }
  }

  // -- Magic-link path (existing user or password-less signup) -------------
  const purpose: "login" | "signup_verification" =
    existedAlready && alreadyVerified ? "login" : "signup_verification";
  try {
    await createAndSendMagicLink({
      email: input.email,
      firstName: input.firstName,
      purpose,
      ipAddress: ipAddress ?? undefined,
      userAgent,
    });
  } catch (err) {
    logger.error(
      { err, email: input.email, purpose, realtorId: newRealtorId },
      "Signup completed but magic-link send failed; account is intact"
    );
  }

  return NextResponse.json({
    success: true,
    autoSignedIn: false,
    message: `Check your email for a verification link. It expires in ${MAGIC_LINK_EXPIRY_MINUTES} minutes.`,
  });
});
```

### 2.2 Rewrite `/api/auth/password-login/route.ts`

Replace manual bcrypt compare + cookie set with a call to `signIn("credentials")`:

```ts
import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/server/error";
import { rateLimit } from "@/lib/server/rate-limit";
import { signIn } from "@/lib/server/auth/authjs";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const runtime = "nodejs";

export const POST = withErrorHandling(async (req: Request) => {
  await rateLimit("auth");
  const { email, password } = loginSchema.parse(await req.json());

  try {
    await signIn("credentials", { email, password, redirect: false });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid email or password" },
      { status: 401 }
    );
  }
});
```

### 2.3 Rewrite `/api/auth/logout/route.ts`

```ts
import { NextResponse } from "next/server";
import { signOut } from "@/lib/server/auth/authjs";

export const runtime = "nodejs";

export async function POST() {
  await signOut({ redirect: false });
  return NextResponse.json({ success: true });
}
```

### 2.4 Phase 2 verification

- Manual signup on the deployed site with a fresh email → returns `autoSignedIn: true`, `caxton_session_v2` cookie set.
- Manual login → returns 200, cookie set.
- `/api/auth/me` → returns the realtor (still using the manual session read; Phase 4 fixes this).
- Logout → cookie cleared.

If `/api/auth/me` breaks in Phase 2, jump to Phase 4 early to fix session reads. Otherwise, defer.

### 2.5 Phase 2 commit

```
feat(auth): migrate signup + login + logout to Auth.js Credentials

- /api/auth/signup: replace signSessionToken + setRealtorSessionCookie
  with server-side signIn("credentials", { redirect: false })
- /api/auth/password-login: same replacement
- /api/auth/logout: use Auth.js signOut()
- All 3 routes shrink significantly; cookie name unchanged (caxton_session_v2)

Migration spec: MIGRATION-authjs.md (Phase 2)
```

---

## Phase 3 — Apple provider + signup-first rule (2 hours)

Goal: Replace `lib/server/apple-oauth.ts` (269 lines) and both `/api/auth/apple/*` routes (324 lines) with Auth.js's built-in Apple provider. Signup-first rule is enforced in the `signIn` callback (already written in Phase 1's `authjs.ts`).

### 3.1 Update the Apple button destinations

The Apple sign-in button currently POSTs to `/api/auth/apple/start`. Change it to redirect to Auth.js's built-in URL:

- **Old**: `<a href="/api/auth/apple/start?mode=signin">`
- **New**: `<a href="/api/auth/signin/apple">` (Auth.js's signin route)

Files to update (search for `apple/start`):
- `app/(dashboard)/dashboard/page.tsx` — signup + login screens
- `app/page.tsx` — landing (if the button lives there)
- Anywhere else grep hits

### 3.2 Update the Apple Developer Portal callback URL

**Before**: `https://realtynewsnow.app/api/auth/apple/callback`
**After**: `https://realtynewsnow.app/api/auth/callback/apple` (Auth.js convention)

Update at [developer.apple.com](https://developer.apple.com/account/resources/identifiers/serviceId/list) → Services IDs → `app.realtynewsnow.web` → Sign In with Apple → Configure → change the Return URL.

Apple caches this — allow ~1 minute after saving.

### 3.3 Update the Vercel env var

```bash
vercel env rm APPLE_REDIRECT_URI production --yes
printf "%s" "https://realtynewsnow.app/api/auth/callback/apple" | \
  vercel env add APPLE_REDIRECT_URI production
```

Repeat for `preview` and `development` scopes. Auth.js reads it as `AUTH_APPLE_REDIRECT_URI` if set, but the Apple provider default matches the URL structure automatically. Setting it explicitly avoids ambiguity.

### 3.4 Verify the signup-first rule

Two test paths:

**Path A — new user tries Apple first (should be rejected):**
1. Sign out completely.
2. Tap "Sign in with Apple" on the login screen.
3. Complete the Apple prompt with an email that has NO realtor row.
4. Expected: redirected to `/dashboard?auth=signup&apple_email=<that email>`.
5. Expected: signup form pre-fills that email.
6. Complete manual signup with password.
7. Now tap "Sign in with Apple" again with the same email → succeeds.

**Path B — existing user uses Apple (should succeed):**
1. Sign out.
2. Tap "Sign in with Apple" with an email that already has a verified realtor row.
3. Expected: signed in, `caxton_session_v2` cookie set, redirect to feed.
4. Expected: a row appears in `realtor_oauth_accounts` linking the Apple `sub` to the realtor id.

### 3.5 Handle the `apple_email` query param on the signup form

`app/(dashboard)/dashboard/page.tsx` — in the signup form JSX, pre-fill the email input from `useSearchParams()`:

```tsx
"use client";
import { useSearchParams } from "next/navigation";
// ... inside component
const searchParams = useSearchParams();
const prefillEmail = searchParams.get("apple_email") ?? "";
// pass to <input defaultValue={prefillEmail} ... />
```

Also show a small banner: *"Complete your signup to enable Sign in with Apple."*

### 3.6 Phase 3 commit

```
feat(auth): migrate Apple sign-in to Auth.js provider

- Delete custom Apple OAuth: apple-oauth.ts, apple/start, apple/callback
- Auth.js Apple provider handles client_secret JWT, JWKS, state, nonce
- signIn callback enforces "must signup first" rule (redirects new emails
  to /dashboard?auth=signup&apple_email=...)
- Update Apple button hrefs to /api/auth/signin/apple
- Apple Developer Portal Return URL changed to
  https://realtynewsnow.app/api/auth/callback/apple (documented)
- APPLE_REDIRECT_URI env var updated on Vercel

Migration spec: MIGRATION-authjs.md (Phase 3)
```

---

## Phase 4 — Session-consumer sweep (30 min)

Goal: Replace all `readRealtorSessionCookie()` / manual cookie parse calls with Auth.js's `auth()` helper.

### 4.1 Files to sweep

Search:

```bash
grep -rln "readRealtorSessionCookie\|signSessionToken\|caxton_session_v2" \
  app/ lib/ --include="*.ts" --include="*.tsx"
```

Excluding `authjs.ts` (which legitimately references the cookie name), every hit needs to change to:

```ts
import { auth } from "@/lib/server/auth/authjs";

const session = await auth();
if (!session?.user?.realtorId) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
const realtorId = session.user.realtorId;
```

### 4.2 Expected files

Based on 2026-07-01 grep:
- `app/api/auth/me/route.ts`
- `app/api/auth/account/route.ts`
- `app/api/auth/set-password/route.ts`
- Any admin CRM route that reads realtor context (unlikely — admin has its own cookie)
- Any dashboard server component that reads `caxton_session_v2` directly

### 4.3 Do NOT touch

- `caxton_admin_session_v2` (admin cookie — separate migration project).
- `caxton_portal_session` (portal cookie — separate migration project).
- Anything in `app/admin/*`.

### 4.4 Phase 4 commit

```
refactor(auth): replace manual session reads with Auth.js auth() helper

- app/api/auth/me: use auth() instead of readRealtorSessionCookie
- app/api/auth/account: same
- app/api/auth/set-password: same
- (list every file changed here)

No behavior change. All routes still return the same shapes.

Migration spec: MIGRATION-authjs.md (Phase 4)
```

---

## Phase 5 — Delete dead code (30 min)

Goal: Delete every file that Auth.js has replaced. Update docs. Ship.

### 5.1 Files to DELETE

```
lib/server/apple-oauth.ts                       # 269 lines — Apple JWT + JWKS
app/api/auth/apple/start/route.ts               # 76 lines
app/api/auth/apple/callback/route.ts            # 248 lines
lib/server/auth/cookies.ts                      # setRealtorSessionCookie helpers
```

If `lib/server/jwt.ts` only exports `signSessionToken` for realtor sessions (admin uses a different function), also delete the realtor-session functions from that file. Keep admin JWT helpers.

Also delete the Apple button legacy component if it still exists:
```
components/LandingAppleButton.tsx               # already deleted in 8201adf but check
lib/native/apple-sign-in.ts                     # already deleted, verify gone
```

### 5.2 Update `ios/DISTRIBUTION_CHECKLIST.md`

Replace the "Sign in with Apple uses OAuth web flow" paragraph with:

```
### Sign in with Apple

Sign in with Apple uses Auth.js v5 with the built-in Apple provider (web
OAuth flow, response_mode=form_post). The callback URL is
https://realtynewsnow.app/api/auth/callback/apple. Apple Services ID is
`app.realtynewsnow.web`. The Capacitor plugin
`@capacitor-community/apple-sign-in` is NOT used and NOT installed.

**Standing rule**: each user must complete manual signup before Apple
sign-in is allowed. The signIn callback in lib/server/auth/authjs.ts
rejects Apple sign-ins whose email has no matching realtors row and
redirects to /dashboard?auth=signup&apple_email=<email>.
```

### 5.3 Update `README.md` auth section (if it exists)

Point contributors to `lib/server/auth/authjs.ts` as the single source of truth. Delete any mention of `apple-oauth.ts`.

### 5.4 Phase 5 commit

```
chore(auth): delete legacy custom auth code post Auth.js migration

Removed (all functionality replaced by Auth.js):
- lib/server/apple-oauth.ts (269 lines)
- app/api/auth/apple/start/route.ts (76 lines)
- app/api/auth/apple/callback/route.ts (248 lines)
- lib/server/auth/cookies.ts (setRealtorSessionCookie helper)
- Realtor-session helpers from lib/server/jwt.ts

Updated:
- ios/DISTRIBUTION_CHECKLIST.md Apple sign-in section
- README.md auth section

Total: ~600 lines removed. Auth.js is now the sole source of truth for
realtor authentication. Admin auth (caxton_admin_session_v2) remains
untouched and will be migrated separately.

Migration spec: MIGRATION-authjs.md (Phase 5)
```

---

## 9. Rollback strategy

Each phase is designed to be independently reversible via `git revert`:

- **Phase 1 revert**: removes Auth.js install + adapter. No behavior change → safe revert.
- **Phase 2 revert**: signup/login/logout return to manual cookie handling. Users with existing sessions unaffected (cookie name unchanged).
- **Phase 3 revert**: Apple sign-in reverts to `apple-oauth.ts` path. Restore Apple Developer Portal callback URL.
- **Phase 4 revert**: session reads return to manual parse. Cookie contents are Auth.js JWT format now — may mismatch. Roll back Phase 2 too if reverting Phase 4.
- **Phase 5 revert**: `git revert` restores deleted files.

**Nuclear rollback**: `git revert` all 5 commits, redeploy, restore Apple Portal callback URL to `/api/auth/apple/callback`. Total downtime: ~2 min.

## 10. Post-migration verification checklist

Run through ALL of these before declaring the migration complete:

- [ ] Fresh manual signup with password → `autoSignedIn: true` returned, immediately shows feed.
- [ ] Fresh manual signup without password → magic link email arrives, click opens verification.
- [ ] Email/password login → succeeds, feed loads.
- [ ] Email/password login with wrong password → 401 returned, no cookie set.
- [ ] Apple sign-in with brand-new email → redirected to signup with `?apple_email=` populated.
- [ ] Apple sign-in with existing verified email → succeeds, row appears in `realtor_oauth_accounts`.
- [ ] Apple sign-in with existing unverified email → redirected to `/dashboard?auth=login&apple_error=unverified_email`.
- [ ] Logout → cookie cleared, `/api/auth/me` returns 401.
- [ ] `/api/auth/me` on a signed-in session → returns realtor data.
- [ ] iOS Capacitor app: sign up in the WebView → session persists (Capacitor `fetch()` sees `caxton_session_v2`).
- [ ] iOS Capacitor app: Sign in with Apple → OAuth flow opens Safari, returns to app, session established.
- [ ] Admin login (`/admin/login`) → unaffected, works as before.
- [ ] Neon `realtor_oauth_accounts` table exists, has correct FK to `realtors.id`.
- [ ] Vercel logs: no 500 errors on `/api/auth/*` for 24 hours.
- [ ] No references to `apple-oauth.ts`, `readRealtorSessionCookie`, or `signSessionToken` for realtor sessions anywhere in `app/` or `lib/`.

---

## Appendix A — Full list of files touched

**Added** (Phase 1):
- `neon/migrations/2026-07-01_authjs_oauth_accounts.sql`
- `lib/server/auth/adapter.ts`
- `lib/server/auth/authjs.ts`
- `app/api/auth/[...nextauth]/route.ts`

**Modified** (Phases 2-4):
- `app/api/auth/signup/route.ts`
- `app/api/auth/password-login/route.ts`
- `app/api/auth/logout/route.ts`
- `app/api/auth/me/route.ts`
- `app/api/auth/account/route.ts`
- `app/api/auth/set-password/route.ts`
- `app/(dashboard)/dashboard/page.tsx` (Apple button href + signup email prefill)
- `app/page.tsx` (Apple button href, if present)
- `ios/DISTRIBUTION_CHECKLIST.md`
- `README.md` (auth section)

**Deleted** (Phase 5):
- `lib/server/apple-oauth.ts`
- `app/api/auth/apple/start/route.ts`
- `app/api/auth/apple/callback/route.ts`
- `lib/server/auth/cookies.ts`
- Realtor-session exports from `lib/server/jwt.ts`

## Appendix B — Claude Code invocation prompts (copy-paste ready)

Each phase has a suggested prompt for Claude Code running locally on your Mac:

**Phase 1**:
> Read MIGRATION-authjs.md, then execute Phase 1 exactly as specified. Install next-auth@beta and @auth/core with pnpm. Create the neon migration file, run it against the production Neon branch. Create lib/server/auth/adapter.ts and lib/server/auth/authjs.ts and app/api/auth/[...nextauth]/route.ts from the spec's code snippets verbatim. Run pnpm typecheck && pnpm lint. Show me the git diff before committing.

**Phase 2**:
> Read MIGRATION-authjs.md Phase 2. Rewrite app/api/auth/signup/route.ts, app/api/auth/password-login/route.ts, and app/api/auth/logout/route.ts using the spec's code snippets. Preserve every Zod validation, license/birthday normalization, and error path from the current signup route. Run pnpm typecheck && pnpm lint. Test locally against the Neon preview branch. Show me the diff.

**Phase 3**:
> Read MIGRATION-authjs.md Phase 3. Update every Apple button href to /api/auth/signin/apple. Add the apple_email prefill logic to the signup form in app/(dashboard)/dashboard/page.tsx. Do NOT delete the old apple/* routes yet — that's Phase 5. Do NOT change the Vercel env var — I'll do that manually. Do NOT change the Apple Developer Portal — I'll do that manually. Just do the code changes.

**Phase 4**:
> Read MIGRATION-authjs.md Phase 4. Replace every readRealtorSessionCookie call with `const session = await auth()`. Do NOT touch anything in app/admin/*. Show me the list of files changed.

**Phase 5**:
> Read MIGRATION-authjs.md Phase 5. Delete the files listed in section 5.1. Update ios/DISTRIBUTION_CHECKLIST.md per section 5.2. Run pnpm typecheck && pnpm lint — anything that fails means we missed a reference somewhere and I need to know before you delete.

---

**End of spec.**
