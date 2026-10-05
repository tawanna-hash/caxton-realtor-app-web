## [S15+] Add biometric authentication option for returning users

**Severity:** Low — UX enhancement, not blocking
**Created:** S14, 2026-05-15

**Idea:** Currently users authenticate via magic link sent to email. Consider adding biometric authentication (Face ID, Touch ID, fingerprint) as an alternative or supplement to magic link for returning users who have already created an account.

**Why:** Magic links require email roundtrip every login — friction-heavy for daily users. Biometrics is one-tap on supported devices and feels native.

**Implementation path (WebAuthn / Passkeys):**
- WebAuthn API is the web standard for biometric auth (Apple Passkeys, Android device biometrics, hardware security keys all use it)
- Flow: user creates account via magic link first time → on next login, prompt to register a passkey → subsequent logins use passkey (Face ID / Touch ID prompt)
- Magic link remains as fallback for new devices, lost passkeys, recovery

**Considerations:**
- Requires backend changes to `/api/auth/*` routes to handle WebAuthn registration + assertion challenges
- Need a new `webauthn_credentials` table (user_id, credential_id, public_key, counter, transports)
- Magic link must stay functional as fallback / new-device flow
- iOS Safari and modern Android both support this natively — no app install needed
- Native app wrapper would benefit later: native biometric APIs (e.g. expo-local-authentication) are simpler than WebAuthn for native

**Recommended approach:** WebAuthn for the web app, add it as an opt-in setting under user profile. Magic link stays the primary "first login" path.

**Estimated effort:** Medium — ~6-10 hours for a working WebAuthn flow including migration, registration endpoint, assertion endpoint, settings UI, and graceful fallback when biometrics fail.


---

## Closing Time: Public Rollout Readiness (flagged 2026-10-05)

Status: ready for a closed beta (5 to 10 trusted agents). Not ready for general public launch.
This list comes from a code skim plus live testing, not a formal security audit.

### Blockers (do before any public launch)
- [ ] Workspace history: each agent's workspace is one JSON row, last save wins after a version check, no history, deletes are permanent (a data loss already happened). Add per-deal storage or version history.
- [ ] Confirm Neon backups and point-in-time restore are on, and test a restore.
- [ ] Texas REALTORS (TXR) forms are member-only. Get written permission or a license before offering them to other agents.
- [ ] Attorney review of first-party e-signature (ESIGN/UETA consent, audit trail, tamper evidence) and of the privacy policy and terms for transaction and client data.
- [ ] Outside security review or penetration test.

### Security hardening
- [ ] Flip Content-Security-Policy from Report-Only to enforced.
- [ ] Rate limits on /api/agent-command-center/* (account, property-lookup, extract-contract, form-pdf). Lookup calls outside services.
- [ ] Cron route: stop accepting the x-vercel-cron header alone; require the CRON_SECRET bearer.
- [ ] Audit log review: who viewed or changed client data. Consider field-level encryption for sensitive deal data.
- [ ] Per-agent data export and delete.

### Storage
- [ ] E-sign PDFs are stored as base64 text in Postgres (closing_time_sign_requests). Move to file storage.
- [ ] Retention: TREC requires brokers to keep transaction records four years; make sure Lock Record and deletes match.

### Quality and operations
- [ ] No automated tests exist. Add tests for deals, contract autofill, deadlines and notifications, signing.
- [ ] No error monitoring (e.g. Sentry). Add it.
- [ ] No staging environment. Add a preview or staging database.
- [ ] Load test with many concurrent agents.
- [ ] Support inbox, onboarding, billing, and App Store and Play review rules for the mobile builds.
- [ ] Disclaimer: not legal advice; agents must review every form.

### Verified this session
- Deadline job: closing date counts as a key deadline; urgent email and push sent once (4 emails, 4 pushes on a test contract); re-run sent 0 (no duplicates).
