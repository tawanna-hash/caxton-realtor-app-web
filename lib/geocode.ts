// lib/geocode.ts
//
// Free geocoding via the US Census Geocoder. No API key required.
// Returns { lat, lon } in WGS-84 degrees.
//
//   https://geocoding.geo.census.gov/geocoder/locations/onelineaddress
//     ?address=...&benchmark=Public_AR_Current&format=json
//
// Also exposes anchor lat/lons and helpers to compute distance (miles)
// from a given point to the REALTOR boards we care about for the various
// mailing audiences:
//
//   ABoR        — Austin Board of Realtors
//                 4800 Spicewood Springs Rd, Austin, TX 78759
//   Five Points — Five Points Board of REALTORS
//                 123 E. Old Settler's Blvd., Round Rock, TX 78664
//   SABOR       — San Antonio Board of REALTORS (Manual Newsline San Antonio anchor)
//                 9110 IH-10 W, San Antonio, TX 78230
//
// A row is "near" a board when its great-circle distance is <= 60 mi.

export interface LatLon {
  lat: number;
  lon: number;
}

/** Austin Board of Realtors HQ. */
const ANCHOR_ABOR: LatLon = {
  lat: 30.40175,
  lon: -97.76889,
};

/**
 * Five Points Board of REALTORS
 * 123 E Old Settlers Blvd, Round Rock, TX 78664.
 * Coordinates verified against both the US Census geocoder and Nominatim;
 * both returned the same point to within ~30 ft.
 */
const ANCHOR_FIVE_POINTS: LatLon = {
  lat: 30.534815,
  lon: -97.683454,
};

/** San Antonio Board of REALTORS HQ (9110 IH-10 W, San Antonio, TX 78230). */
export const ANCHOR_SABOR: LatLon = {
  lat: 29.524318,
  lon: -98.557229,
};
const EARTH_RADIUS_MI = 3958.7613;

/**
 * Great-circle distance between two lat/lon points, in miles.
 */
function haversineMiles(a: LatLon, b: LatLon): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface GeocodeInput {
  address?: string | null;
  city?:    string | null;
  state?:   string | null;
  zip?:     string | null;
}

export interface GeocodeResult {
  ok:           boolean;
  lat?:         number;
  lon?:         number;
  matched?:     string;
  /** Miles to Austin Board of Realtors. */
  distAbor?:    number;
  /** Miles to Five Points Board of REALTORS. */
  distFivePoints?: number;
  /** Miles to San Antonio Board of REALTORS. */
  distSabor?:   number;
  error?:       string;
}

/**
 * Geocode a single address via the US Census onelineaddress endpoint.
 * Returns lat/lon plus pre-computed distances to both REALTOR boards.
 */
export async function geocodeAddress(input: GeocodeInput): Promise<GeocodeResult> {
  const oneline = [input.address, input.city, input.state, input.zip]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(', ');
  if (!oneline) {
    return { ok: false, error: 'empty address' };
  }

  const params = new URLSearchParams({
    address:   oneline,
    benchmark: 'Public_AR_Current',
    format:    'json',
  });
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${params.toString()}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method:  'GET',
      headers: { Accept: 'application/json' },
      signal:  AbortSignal.timeout(8000),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!res.ok) {
    return { ok: false, error: `census ${res.status}` };
  }

  let json: {
    result?: {
      addressMatches?: {
        matchedAddress?: string;
        coordinates?: { x: number; y: number };
      }[];
    };
  };
  try {
    json = await res.json();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'bad json' };
  }

  const match = json?.result?.addressMatches?.[0];
  if (match && match.coordinates) {
    const lat = match.coordinates.y;
    const lon = match.coordinates.x;
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const here: LatLon = { lat, lon };
      return {
        ok:             true,
        lat,
        lon,
        matched:        match.matchedAddress,
        distAbor:       haversineMiles(here, ANCHOR_ABOR),
        distFivePoints: haversineMiles(here, ANCHOR_FIVE_POINTS),
        distSabor:      haversineMiles(here, ANCHOR_SABOR),
      };
    }
  }

  // Census had no match — fall back to Nominatim (OpenStreetMap).
  // The same fallback was used to locate SABOR HQ itself.
  const expect = { state: input.state, zip: input.zip, city: input.city };
  const nomi = await geocodeViaNominatim(oneline, expect);
  if (nomi.ok) return nomi;

  // Final fallback — city+state+zip only. Loses street-level precision
  // but is still accurate within the 60-mile radius checks the app uses.
  const cityFallback = [input.city, input.state, input.zip]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(', ');
  if (cityFallback && cityFallback !== oneline) {
    const cityHit = await geocodeViaNominatim(cityFallback, expect);
    if (cityHit.ok) {
      return { ...cityHit, matched: `${cityHit.matched ?? cityFallback} (city-level)` };
    }
  }

  // ZIP-only as last resort. No state-check needed — the ZIP itself
  // pins the result to the right area.
  const zipOnly = (input.zip ?? '').trim();
  if (zipOnly && zipOnly.length >= 5) {
    const zipHit = await geocodeViaNominatim(`${zipOnly}, USA`);
    if (zipHit.ok) {
      return { ...zipHit, matched: `ZIP ${zipOnly} (zip-level)` };
    }
  }

  return { ok: false, error: 'no match' };
}

/**
 * Nominatim fallback. Free, no API key. ~1 req/sec rate limit per the
 * usage policy — callers should serialize calls (the backfill route
 * already iterates rows sequentially).
 *
 * The optional `expect` argument is the input the caller wants the
 * match to be located in. If the matched result has a state or ZIP that
 * disagrees, the hit is rejected. This protects against fuzzy matches
 * like "CEDAR PARK, TX 78630" returning a residential road named
 * "Cedar" in Deer Park, Harris County — which haversines to ~165 mi
 * from the real Cedar Park and was the reason a contact's proximity
 * displayed as "Outside 60 mi" when she lives 15 mi from ABoR.
 */
async function geocodeViaNominatim(
  oneline: string,
  expect?: { state?: string | null; zip?: string | null; city?: string | null },
): Promise<GeocodeResult> {
  const params = new URLSearchParams({
    q:               oneline,
    format:          'json',
    limit:           '1',
    countrycodes:    'us',
    addressdetails:  '1',
  });
  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method:  'GET',
      headers: {
        Accept:       'application/json',
        // Nominatim policy requires a descriptive UA.
        'User-Agent': 'CaxtonRealtorApp/1.0 (contact: tawanna@realtynewsnow.app)',
      },
      signal:  AbortSignal.timeout(8000),
    });
  } catch (err) {
    return { ok: false, error: `nominatim ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!res.ok) {
    return { ok: false, error: `nominatim ${res.status}` };
  }

  let arr: {
    lat?: string;
    lon?: string;
    display_name?: string;
    address?: {
      state?: string;
      'ISO3166-2-lvl4'?: string;
      postcode?: string;
      city?: string;
      town?: string;
      village?: string;
      county?: string;
    };
  }[];
  try {
    arr = await res.json();
  } catch {
    return { ok: false, error: 'nominatim bad json' };
  }
  const hit = arr[0];
  if (!hit || !hit.lat || !hit.lon) {
    return { ok: false, error: 'no match' };
  }
  const lat = Number(hit.lat);
  const lon = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { ok: false, error: 'bad coords' };
  }

  // Reject hits that disagree with the input state/ZIP. This is what
  // catches the "Cedar (road) in Deer Park" case described above.
  if (expect) {
    const wantState = (expect.state ?? '').trim().toUpperCase();
    if (wantState) {
      const iso = (hit.address?.['ISO3166-2-lvl4'] ?? '').toUpperCase();
      const isoState = iso.startsWith('US-') ? iso.slice(3) : '';
      const gotState = (hit.address?.state ?? '').trim();
      // Accept full state name ("Texas") OR ISO2 ("TX") match.
      const stateOk =
        (isoState && isoState === wantState) ||
        (gotState && gotState.toUpperCase().startsWith(wantState));
      if (!stateOk) {
        return { ok: false, error: `nominatim state mismatch (got ${gotState || isoState || '?'} want ${wantState})` };
      }
    }
    const wantZip = (expect.zip ?? '').trim().slice(0, 5);
    if (wantZip.length === 5) {
      const gotZip = (hit.address?.postcode ?? '').trim().slice(0, 5);
      // Allow no postcode on the hit (road-level matches don't always carry one),
      // but if it IS present and the first three digits disagree, reject —
      // 786xx (Austin metro) vs 775xx (east Houston) etc.
      if (gotZip && gotZip.slice(0, 3) !== wantZip.slice(0, 3)) {
        return { ok: false, error: `nominatim zip mismatch (got ${gotZip} want ${wantZip})` };
      }
    }
  }

  const here: LatLon = { lat, lon };
  return {
    ok:             true,
    lat,
    lon,
    matched:        hit.display_name ?? oneline,
    distAbor:       haversineMiles(here, ANCHOR_ABOR),
    distFivePoints: haversineMiles(here, ANCHOR_FIVE_POINTS),
    distSabor:      haversineMiles(here, ANCHOR_SABOR),
  };
}
