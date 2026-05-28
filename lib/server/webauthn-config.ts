/**
 * WebAuthn RP configuration. Driven by env so we can run dev/staging without
 * touching code.
 *
 *   WEBAUTHN_RP_ID                 — primary RP ID (e.g. realtynewsnow.app)
 *   WEBAUTHN_RP_NAME               — human-readable RP name shown in OS dialogs
 *   WEBAUTHN_ORIGIN                — primary origin (e.g. https://realtynewsnow.app)
 *   WEBAUTHN_ADDITIONAL_RP_IDS     — comma-separated extra accepted RP IDs
 *   WEBAUTHN_ADDITIONAL_ORIGINS    — comma-separated extra accepted origins
 *
 * Extras only affect *verify*; new registrations always use the primary so
 * a future RP ID change requires a documented migration.
 */

function splitCSV(s: string | undefined): string[] {
  return (s ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export function getRpId(): string {
  return process.env.WEBAUTHN_RP_ID || 'realtynewsnow.app';
}

export function getRpName(): string {
  return process.env.WEBAUTHN_RP_NAME || 'Realty News Now';
}

export function getOrigin(): string {
  return process.env.WEBAUTHN_ORIGIN || 'https://realtynewsnow.app';
}

export function getExpectedRPIDs(): string[] {
  return [getRpId(), ...splitCSV(process.env.WEBAUTHN_ADDITIONAL_RP_IDS)];
}

export function getExpectedOrigins(): string[] {
  return [getOrigin(), ...splitCSV(process.env.WEBAUTHN_ADDITIONAL_ORIGINS)];
}
