# Data, API & UX Alignment Audit

**Date:** 2026-06-25  
**Repo:** caxton-realtor-app-web  
**Stack reality check:** This is a monorepo Next.js 16 app — admin and public surfaces ship from the same codebase, same `app/api/**` routes, same `lib/**`. So most of the "frontend vs backend team" alignment questions in the prompt collapse into "are admin pages and public pages using the same primitives?" That makes the gaps tractable.

---

## TL;DR scorecard

| Dimension | Today | Target | Priority |
|---|---|---|---|
| API schema doc | None (no OpenAPI/Swagger) | Generate from existing zod schemas | **P1** |
| Validation coverage | 43/258 routes use zod (~17%); 103/115 mutation routes use `withErrorHandling` (~90%) | 100% mutation routes use zod + wrapper | **P1** |
| Single Source of Truth for enums | Partial — `PubId`, `Market`, `Status` defined in `lib/`, but duplicated as literal unions in many components | Centralize all enums in `lib/types/` and re-export | **P2** |
| Error response shape | Already standardized via `lib/server/error.ts` → `{ error, details?, message? }` | Document the contract publicly | **P2** |
| Design tokens | Same Tailwind config across surfaces; brand color `#301D5D` used 519× as raw hex | Centralize as Tailwind theme tokens | **P2** |
| Role/permission model | Binary realtor vs admin (no granular permissions); enforced server-side via `requireAdmin()` | Granular admin roles in DB when we need delegation | **P3** |
| Feature flags | None — only an env-driven biometric gate | PostHog or Vercel Edge Config feature flags | **P3** |
| Integration tests | **Zero automated tests** in repo (no jest/vitest/playwright config) | Smoke E2E for critical journeys | **P1** |

---

## 1. Data & API alignment

### 1.1 Shared API documentation

**Current state:** No OpenAPI / Swagger / GraphQL spec exists. The 258 API routes in `app/api/**` are documented only via TypeScript types and inline comments. Frontend code consumes them via `lib/api-client.ts` and ad-hoc `fetch()` calls.

**Recommendation (P1):** Generate an OpenAPI 3.1 spec from the existing zod schemas. Concrete path:

1. Adopt `zod-to-openapi` (~5KB dep). For each route that already has a schema in `lib/server/schemas/`, register the schema with `.openapi({ ... })` metadata.
2. Add an `/api/openapi.json` route that emits the live spec.
3. Add an `/admin/api-docs` page that renders Swagger UI against that JSON.
4. **Acceptance:** every documented route returns 200 against the generated spec when probed with the example payload.

**Why this is high-impact:** The codebase already has 36 files using zod and a `lib/server/schemas/` directory. The data model is already declared — it just isn't published. This is mostly mechanical work.

### 1.2 Validation gaps (must close before publishing the spec)

Among **115 mutation routes** (POST/PUT/PATCH/DELETE), only **43 use zod**. Notable unvalidated routes:

- `app/api/portal/account/route.ts` (realtor self-service profile edits)
- `app/api/inventory/submit/route.ts`
- `app/api/admin/realtyline-mls/route.ts`
- `app/api/admin/renewal-reminders/[id]/route.ts`
- All `app/api/push/**` subscription writes

**Recommendation (P1):** Sweep these routes to use zod + `withErrorHandling`. The wrapper pattern is already established and well-documented in `lib/server/error.ts`. The remaining ~70 routes are a one-week chore.

### 1.3 Single Source of Truth for enums

**Already good:**

- `lib/publications.ts` is the canonical source for `PubId`, `PUB_ACTIVE`, `PUB_COMING_SOON`. The recent iOS HIG dedupe pass moved both admin and public callers to import from it.
- `lib/coming-soon-pubs.ts` re-exports for legacy callers.
- `lib/server/schemas/auth.ts` defines `market: z.enum(['austin', 'san_antonio', 'both'])`.

**Gaps:**

- The literal union `'austin' | 'san_antonio'` appears inline in 40+ files. If we ever add Houston, that's 40 grep-and-replace sites.
- Status enums (e.g. `'pending' | 'active' | 'rejected' | 'expired'` for builder inventory) are declared per-feature in `lib/builder-inventory.ts` but re-typed in components.
- Verification statuses (`'valid' | 'invalid' | 'risky' | 'unknown' | 'pending' | 'unverified'`) appear in `app/admin/subscribers/page.tsx`, `app/admin/newsletter/page.tsx`, and `lib/email-verify.ts` independently.

**Recommendation (P2):** Move shared enums into `lib/types/` and re-export. Pattern:

```ts
// lib/types/markets.ts
export const MARKETS = ['austin', 'san_antonio'] as const;
export type Market = (typeof MARKETS)[number];
export const MARKET_LABELS: Record<Market, string> = {
  austin: 'Austin',
  san_antonio: 'San Antonio',
};
```

Then both the zod schema and the React `<select>` import from the same file. Adding Houston = one diff.

### 1.4 Error handling contract

**Already standardized.** `lib/server/error.ts` defines:

```json
// On validation failure
{ "error": "Validation failed", "details": { "field": ["message"] } }
// On business error
{ "error": "<message>", "details"?: <unknown> }
// On 5xx
{ "error": "Internal server error", "message"?: "<dev-only>" }
```

`lib/api-client.ts` already parses this shape. **Coverage gap:** routes not wrapped in `withErrorHandling` emit ad-hoc shapes (`{ error: 'invalid_json' }`, `{ error: 'invalid id' }`, lowercase `'not found'`). Closing the validation gap (§1.2) closes this gap too.

**Recommendation (P2):** Add a section to `docs/api-contract.md` describing the shape so the spec generator (§1.1) emits it as a shared `Error` schema component.

---

## 2. Visual & UX consistency

### 2.1 Design system

**Already shared:** Tailwind is the single styling primitive across `app/(public)/**`, `app/(dashboard)/**`, `app/admin/**`, and `components/**`. Same `globals.css`, same Tailwind config, same fonts.

**Gap — color sprawl:** 54 distinct hex values appear in components. The brand purple `#301D5D` appears **519 times as a raw hex literal**. If we ever rebrand, that's 519 diffs.

**Recommendation (P2):**

1. Add a `theme.extend.colors` block to a `tailwind.config.ts` (file doesn't currently exist — Tailwind v4 picks up `@theme` directly from CSS, so add tokens there):
   ```css
   /* app/globals.css */
   @theme {
     --color-brand-700: #301D5D;
     --color-brand-600: #493676;
     --color-ink-900:   #111827;
     --color-ink-700:   #374151;
     --color-ink-500:   #6b7280;
   }
   ```
2. Use `bg-brand-700` / `text-brand-700` everywhere. Codemod `#301D5D` → `bg-brand-700` (where used as bg) in one pass.
3. Keep `lib/publications.ts > color` as-is for per-pub theming (each pub has its own brand).

### 2.2 Role/permission UI parity

**Server-side enforcement is sound:** every `app/admin/**` page and `app/api/admin/**` route calls `requireAdmin()` or `getCurrentAdmin()`. Cookie `caxton_admin_session_v2` is signed with a dedicated `ADMIN_JWT_SECRET`. The JWT payload is binary — `{ adminId, email, type: 'admin' }` — no per-feature permissions.

**Gap:** No granular role model. Every admin sees every admin page. Today this is fine (one admin user), but as soon as a sales hire needs ad-only access without DB ops, we'll need:

- A `admin_roles` table: `(admin_id, role)` with roles like `'super' | 'sales' | 'editor'`.
- A `hasPermission(admin, permission)` helper used by both route handlers AND the UI navigation in `lib/admin-nav.ts`.

**Recommendation (P3):** Defer until a second admin user is onboarded. When we do it, the UI-vs-server parity contract is: every nav item declares the permission it requires, and `requirePermission()` enforces it on the matching route — both read from the same `lib/types/permissions.ts`.

---

## 3. Workflow & feature parity

### 3.1 Feature flag strategy

**Current state:** None. There is one env-driven gate (`lib/native/biometric-gate.ts`) and one URL-param toggle (`?notify=` for the bottom sheet). No staged rollouts, no kill switches.

**Risk this creates:** Any change to a shared component (e.g., the iOS HIG dedupe wave) ships to 100% of users simultaneously. If a regression slips through, the only rollback is a redeploy.

**Recommendation (P3):** Pick one:

| Option | Pros | Cons |
|---|---|---|
| **PostHog feature flags** | Already a connector candidate; supports % rollouts and user-property targeting | Adds runtime dependency |
| **Vercel Edge Config** | Native to existing Vercel hosting; near-zero latency | No targeting UI — flags are flat KV |
| **DB-backed flags table** | Auditable from existing admin panel | We build the targeting logic ourselves |

For our scale (one app, two markets, hundreds of users) Edge Config is the lightest. Add `lib/feature-flags.ts` reading from `await get('flags')`, expose values to the client via a small server component.

### 3.2 Integration testing

**Current state:** **Zero automated tests.** No `__tests__/`, no `tests/`, no `playwright.config.*`, no `vitest.config.*`, no test runners in `package.json` (only `dev`, `build`, `start`, `lint`, `prepare`).

The codebase relies on manual TestFlight + Vercel preview testing. This has so far worked because the team is small and iteration is hand-driven.

**Recommendation (P1):** Stand up a minimal Playwright smoke suite covering the **5 critical journeys** that ship daily:

1. **Sign-up → email verification → dashboard** (the broken-link risk from this audit's earlier work — the `/auth/verify` queueMicrotask fix).
2. **Switch publication via header → see new feed** (the dedupe surface).
3. **Tap coming-soon market → see Notify-Me sheet → submit email** (the bug we just fixed today).
4. **Public advertise inquiry → admin sees the lead in CRM** (cross-team handoff).
5. **Admin uploads magazine → realtor sees it in `/magazine`** (Neon → S3 → CDN integration).

These five take ~2-3 days of Playwright authoring and would have caught both the redundant banner and the broken Get Notified flow before they reached the user.

---

## Suggested execution order

| Sprint | Work | Outcome |
|---|---|---|
| **Sprint 1 (this week)** | Close the 72 unvalidated mutation routes (§1.2). Lift status/market/verification enums into `lib/types/` (§1.3). | Every mutation route returns a consistent error shape. SSoT for enums. |
| **Sprint 2** | Generate OpenAPI from zod (§1.1). Add `/admin/api-docs` Swagger UI. Write `docs/api-contract.md`. | Public, navigable API surface. |
| **Sprint 3** | Add 5-test Playwright smoke suite (§3.2). Wire to GitHub Actions on every PR. | Regression net. |
| **Sprint 4** | Centralize brand tokens in `@theme` (§2.1). Codemod `#301D5D` → `bg-brand-700`. | One-diff rebrand. |
| **Backlog** | Granular admin roles (§2.2). Feature flag system (§3.1). | When second admin / staged rollout becomes a real need. |

---

## What's already aligned (don't fix)

- **Publication catalog** — `lib/publications.ts` is the single source of truth for both admin and public surfaces (post iOS HIG dedupe).
- **Auth model** — admin and realtor JWTs use separate secrets and separate cookies; verification has zero-downtime rotation built in.
- **API error wrapper** — `withErrorHandling` + `ApiError` + zod auto-coercion is well-designed and covers 90% of mutation routes.
- **Tailwind everywhere** — same styling primitive across all surfaces; no Material UI vs custom CSS split.
- **Capacitor packaging** — single WebView ships the full app; no separate iOS/Android codebase to drift.
