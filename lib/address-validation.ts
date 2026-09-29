// Server-only Google Address Validation API adapter. Never expose the API key
// to the browser or treat a suggested/partially matched address as deliverable.
const ADDRESS_URL = 'https://addressvalidation.googleapis.com/v1:validateAddress';

export interface NormalizedAddress {
  streetAddress: string;
  secondaryAddress: string | null;
  city: string;
  state: string;
  zip5: string;
  zip4: string | null;
}

export interface AddressInput {
  streetAddress: string;
  secondaryAddress?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

export type AddressResult =
  | { ok: true; status: 'Valid'; normalized: NormalizedAddress; detail: string; evidence: Record<string, unknown> }
  | { ok: true; status: 'Pending' | 'Invalid'; detail: string; evidence: Record<string, unknown> }
  | { ok: false; error: string };

export function formatValidatedAddress(n: NormalizedAddress): string {
  return `${n.streetAddress}${n.secondaryAddress ? ` ${n.secondaryAddress}` : ''}, ${n.city}, ${n.state} ${n.zip5}${n.zip4 ? `-${n.zip4}` : ''}`;
}

export async function verifyAddressGoogle(input: AddressInput): Promise<AddressResult> {
  if (!input.streetAddress?.trim() || !input.state?.trim() || (!input.city?.trim() && !input.zip?.trim())) {
    return { ok: true, status: 'Invalid', detail: 'Street, state, and city or ZIP are required.', evidence: {} };
  }
  const key = process.env.GOOGLE_ADDRESS_VALIDATION_API_KEY;
  if (!key) return { ok: false, error: 'Google Address Validation is not configured. Set GOOGLE_ADDRESS_VALIDATION_API_KEY on the server.' };

  let response: Response;
  try {
    response = await fetch(ADDRESS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
      body: JSON.stringify({
        address: {
          regionCode: 'US',
          addressLines: [input.streetAddress.trim(), input.secondaryAddress?.trim()].filter(Boolean),
          locality: input.city?.trim() || undefined,
          administrativeArea: input.state.trim().toUpperCase(),
          postalCode: input.zip?.trim() || undefined,
        },
        enableUspsCass: true,
      }),
      signal: AbortSignal.timeout(12000),
    });
  } catch (error) {
    return { ok: false, error: `Google Address Validation could not be reached: ${error instanceof Error ? error.message : 'network error'}` };
  }
  if (!response.ok) {
    return { ok: false, error: `Google Address Validation returned HTTP ${response.status}. Check that the API is enabled and the key permits this server-side API.` };
  }

  let body: {
    result?: {
      verdict?: {
        possibleNextAction?: string;
        addressComplete?: boolean;
        validationGranularity?: string;
        hasUnconfirmedComponents?: boolean;
      };
      address?: {
        postalAddress?: {
          addressLines?: string[];
          locality?: string;
          administrativeArea?: string;
          postalCode?: string;
        };
        missingComponentTypes?: string[];
      };
      uspsData?: { dpvConfirmation?: string };
    };
  };
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: 'Google Address Validation returned unreadable data.' };
  }

  const verdict = body.result?.verdict;
  const postal = body.result?.address?.postalAddress;
  if (!verdict || !postal) return { ok: false, error: 'Google Address Validation returned an incomplete response.' };

  const dpv = body.result?.uspsData?.dpvConfirmation || '';
  const action = verdict.possibleNextAction || '';
  const lines = postal.addressLines || [];
  const zipMatch = (postal.postalCode || '').match(/^(\d{5})(?:-?(\d{4}))?$/);
  const hasCompleteStandardAddress = Boolean(
    lines[0] && postal.locality && postal.administrativeArea && zipMatch,
  );
  const evidence = {
    source: 'google-address-validation',
    action,
    granularity: verdict.validationGranularity || null,
    addressComplete: verdict.addressComplete === true,
    dpvConfirmation: dpv || null,
    missingComponentTypes: body.result?.address?.missingComponentTypes || [],
  };

  if (action === 'FIX' || dpv === 'N' || verdict.validationGranularity === 'OTHER') {
    return { ok: true, status: 'Invalid', detail: 'Google could not confirm this mailing address. Check the street, unit, city, state, and ZIP.', evidence };
  }
  if (action === 'CONFIRM_ADD_SUBPREMISES' || dpv === 'D' || dpv === 'S') {
    return { ok: true, status: 'Pending', detail: 'Confirm the apartment or suite number before mailing.', evidence };
  }
  if (!hasCompleteStandardAddress) {
    return { ok: true, status: 'Pending', detail: 'Google did not return a complete standardized mailing address.', evidence };
  }
  if (dpv === 'Y') {
    return {
      ok: true,
      status: 'Valid',
      detail: 'Validated by Google Address Validation and USPS DPV.',
      normalized: {
        streetAddress: lines[0],
        secondaryAddress: lines.slice(1).join(', ') || null,
        city: postal.locality!,
        state: postal.administrativeArea!,
        zip5: zipMatch![1],
        zip4: zipMatch![2] || null,
      },
      evidence,
    };
  }
  if (action === 'CONFIRM' || verdict.hasUnconfirmedComponents || verdict.addressComplete !== true ||
      !['PREMISE', 'SUB_PREMISE'].includes(verdict.validationGranularity || '')) {
    return { ok: true, status: 'Pending', detail: 'Google found a possible address, but it needs review before mailing.', evidence };
  }
  if (action && action !== 'ACCEPT') {
    return { ok: true, status: 'Pending', detail: 'Google recommends reviewing this address before mailing.', evidence };
  }
  return {
    ok: true,
    status: 'Valid',
    detail: 'Validated by Google Address Validation.',
    normalized: {
      streetAddress: lines[0],
      secondaryAddress: lines.slice(1).join(', ') || null,
      city: postal.locality!,
      state: postal.administrativeArea!,
      zip5: zipMatch![1],
      zip4: zipMatch![2] || null,
    },
    evidence,
  };
}
