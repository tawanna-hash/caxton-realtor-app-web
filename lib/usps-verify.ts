// lib/usps-verify.ts
//
// USPS Address API v3 (OAuth2 client_credentials).
//
//   Env:
//     USPS_CLIENT_ID
//     USPS_CLIENT_SECRET
//
// Endpoints (US production):
//   POST https://apis.usps.com/oauth2/v3/token
//   GET  https://apis.usps.com/addresses/v3/address
//        ?streetAddress=&secondaryAddress=&city=&state=&ZIPCode=&ZIPPlus4=
//
// The token is cached in-process (per Node lambda) until ~60s before
// expiry. The verify function returns one of three outcomes:
//
//   { ok: true,  status: 'Valid',   normalized: {...} }
//   { ok: true,  status: 'Invalid', detail: '...'    }
//   { ok: false, error: '...' }   // 5xx / network / no creds
//
// Caller decides what to persist. We never throw on a "Valid/Invalid"
// answer — only on transport failures.

const OAUTH_URL = 'https://apis.usps.com/oauth2/v3/token';
const ADDR_URL  = 'https://apis.usps.com/addresses/v3/address';

interface CachedToken {
  access_token: string;
  expires_at_ms: number;
}

let cachedToken: CachedToken | null = null;

async function getAccessToken(): Promise<string> {
  const id     = process.env.USPS_CLIENT_ID;
  const secret = process.env.USPS_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error('USPS_CLIENT_ID / USPS_CLIENT_SECRET not set');
  }

  // Reuse cached token if it has >60s of life left
  const now = Date.now();
  if (cachedToken && cachedToken.expires_at_ms - now > 60_000) {
    return cachedToken.access_token;
  }

  const credentials = Buffer.from(`${id}:${secret}`).toString('base64');

  const res = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: id,
      client_secret: secret,
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`USPS oauth ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    expires_in:   number;
  };
  cachedToken = {
    access_token:  json.access_token,
    expires_at_ms: now + (json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.access_token;
}

export interface UspsNormalizedAddress {
  streetAddress: string;
  secondaryAddress: string | null;
  city: string;
  state: string;
  zip5: string;
  zip4: string | null;
}

export type UspsVerifyResult =
  | { ok: true;  status: 'Valid';   normalized: UspsNormalizedAddress }
  | { ok: true;  status: 'Invalid'; detail: string }
  | { ok: false; error: string };

export interface UspsVerifyInput {
  streetAddress: string;
  secondaryAddress?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

/**
 * Verify a single address against USPS Address API v3. Returns a discriminated
 * union — see UspsVerifyResult. Never throws on a Valid/Invalid answer;
 * only on transport / auth failures.
 */
export async function verifyAddressUsps(input: UspsVerifyInput): Promise<UspsVerifyResult> {
  if (!input.streetAddress || !input.streetAddress.trim()) {
    return { ok: true, status: 'Invalid', detail: 'Missing street address.' };
  }
  if (!input.state || !input.state.trim()) {
    return { ok: true, status: 'Invalid', detail: 'Missing state.' };
  }
  if ((!input.city || !input.city.trim()) && (!input.zip || !input.zip.trim())) {
    return { ok: true, status: 'Invalid', detail: 'Need city or ZIP.' };
  }

  let token: string;
  try {
    token = await getAccessToken();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // Split ZIP into 5 / 4 if a ZIP+4 was supplied
  const zipRaw = (input.zip ?? '').trim();
  const zipMatch = zipRaw.match(/^(\d{5})(?:-?(\d{4}))?$/);
  const zip5 = zipMatch ? zipMatch[1] : zipRaw.slice(0, 5);
  const zip4 = zipMatch && zipMatch[2] ? zipMatch[2] : '';

  const params = new URLSearchParams();
  params.set('streetAddress', input.streetAddress.trim());
  if (input.secondaryAddress && input.secondaryAddress.trim()) {
    params.set('secondaryAddress', input.secondaryAddress.trim());
  }
  if (input.city && input.city.trim()) params.set('city', input.city.trim());
  params.set('state', input.state.trim().toUpperCase());
  if (zip5) params.set('ZIPCode', zip5);
  if (zip4) params.set('ZIPPlus4', zip4);

  const res = await fetch(`${ADDR_URL}?${params.toString()}`, {
    method:  'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept:        'application/json',
    },
  });

  if (res.status === 400 || res.status === 404) {
    // USPS returns 400 for unparseable / 404 for "no matching address"
    const text = await res.text().catch(() => '');
    let detail = `USPS could not match address (${res.status}).`;
    try {
      const j = JSON.parse(text) as { error?: { message?: string } };
      if (j?.error?.message) detail = j.error.message;
    } catch {}
    return { ok: true, status: 'Invalid', detail };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, error: `USPS ${res.status}: ${text.slice(0, 200)}` };
  }

  const json = (await res.json()) as {
    address?: {
      streetAddress?:    string;
      secondaryAddress?: string;
      city?:             string;
      state?:            string;
      ZIPCode?:          string;
      ZIPPlus4?:         string;
    };
  };
  const a = json.address;
  if (!a || !a.streetAddress || !a.state || !a.ZIPCode) {
    return { ok: true, status: 'Invalid', detail: 'USPS returned no usable address.' };
  }
  return {
    ok: true,
    status: 'Valid',
    normalized: {
      streetAddress:    a.streetAddress,
      secondaryAddress: a.secondaryAddress?.trim() || null,
      city:             (a.city ?? '').trim(),
      state:            (a.state ?? '').trim().toUpperCase(),
      zip5:             (a.ZIPCode ?? '').trim(),
      zip4:             a.ZIPPlus4?.trim() || null,
    },
  };
}

/**
 * Format the normalized address as a single human-readable string
 * suitable for storing in addr_usps_normalized.
 */
export function formatUspsAddress(n: UspsNormalizedAddress): string {
  const line1 = n.secondaryAddress
    ? `${n.streetAddress} ${n.secondaryAddress}`
    : n.streetAddress;
  const zip = n.zip4 ? `${n.zip5}-${n.zip4}` : n.zip5;
  return `${line1}, ${n.city}, ${n.state} ${zip}`;
}
