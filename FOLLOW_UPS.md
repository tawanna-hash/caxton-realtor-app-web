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
