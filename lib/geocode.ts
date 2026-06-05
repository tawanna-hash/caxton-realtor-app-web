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
//   SABOR       — San Antonio Board of REALTORS (Manual Newsline anchor)
//                 9110 IH-10 W, San Antonio, TX 78230
//
// A row is "near" a board when its great-circle distance is <= 60 mi.

export interface LatLon {
  lat: number;
  lon: number;
}

/** Austin Board of Realtors HQ. */
export const ANCHOR_ABOR: LatLon = {
  lat: 30.40175,
  lon: -97.76889,
};

/** Five Points Board of REALTORS (Round Rock). */
export const ANCHOR_FIVE_POINTS: LatLon = {
  lat: 30.516893,
  lon: -97.665878,
};

/** San Antonio Board of REALTORS HQ (9110 IH-10 W, San Antonio, TX 78230). */
export const ANCHOR_SABOR: LatLon = {
  lat: 29.524318,
  lon: -98.557229,
};

export const NEAR_RADIUS_MI = 60;

const EARTH_RADIUS_MI = 3958.7613;

/**
 * Great-circle distance between two lat/lon points, in miles.
 */
export function haversineMiles(a: LatLon, b: LatLon): number {
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
  return geocodeViaNominatim(oneline);
}

/**
 * Nominatim fallback. Free, no API key. ~1 req/sec rate limit per the
 * usage policy — callers should serialize calls (the backfill route
 * already iterates rows sequentially).
 */
async function geocodeViaNominatim(oneline: string): Promise<GeocodeResult> {
  const params = new URLSearchParams({
    q:               oneline,
    format:          'json',
    limit:           '1',
    countrycodes:    'us',
    addressdetails:  '0',
  });
  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method:  'GET',
      headers: {
        Accept:       'application/json',
        // Nominatim policy requires a descriptive UA.
        'User-Agent': 'CaxtonRealtorApp/1.0 (contact: tawanna@myrealtyline.com)',
      },
      signal:  AbortSignal.timeout(8000),
    });
  } catch (err) {
    return { ok: false, error: `nominatim ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!res.ok) {
    return { ok: false, error: `nominatim ${res.status}` };
  }

  let arr: { lat?: string; lon?: string; display_name?: string }[];
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

/**
 * Convenience helper: given pre-computed distances, return which boards
 * a row is "near" (within 60 mi).
 */
export function nearBoards(
  distAbor: number | null,
  distFivePoints: number | null,
): { abor: boolean; fivePoints: boolean } {
  return {
    abor:        distAbor       !== null && distAbor       <= NEAR_RADIUS_MI,
    fivePoints:  distFivePoints !== null && distFivePoints <= NEAR_RADIUS_MI,
  };
}
