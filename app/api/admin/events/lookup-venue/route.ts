// app/api/admin/events/lookup-venue/route.ts
//
// POST { query, publication? } — admin-only venue lookup via Google Places
// API (New) Text Search. Returns up to 5 matches with name, formatted
// address and lat/lng so the event form can fill Address + coordinates.
//
// Key: GOOGLE_PLACES_API_KEY, falling back to the existing
// GOOGLE_ADDRESS_VALIDATION_API_KEY (same Google Cloud project).

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';

// Bias results toward each market (50 km radius around the city center).
const MARKET_CENTER: Record<string, { lat: number; lng: number }> = {
  austin:      { lat: 30.2672, lng: -97.7431 },
  san_antonio: { lat: 29.4241, lng: -98.4936 },
  houston:     { lat: 29.7604, lng: -95.3698 },
  dallas:      { lat: 32.7767, lng: -96.7970 },
};

type PlacesResponse = {
  places?: Array<{
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
  }>;
  error?: { message?: string; status?: string };
};

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_ADDRESS_VALIDATION_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'Google Places is not configured on the server.' }, { status: 500 });
  }

  let body: { query?: unknown; publication?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (query.length < 3) return NextResponse.json({ error: 'Enter a venue name or address first.' }, { status: 400 });
  const center = MARKET_CENTER[typeof body.publication === 'string' ? body.publication : 'austin'] ?? MARKET_CENTER.austin;

  const res = await fetch(PLACES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location',
    },
    body: JSON.stringify({
      textQuery: query,
      pageSize: 5,
      regionCode: 'US',
      locationBias: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: 50000 } },
    }),
    cache: 'no-store',
  });
  const j = (await res.json().catch(() => ({}))) as PlacesResponse;
  if (!res.ok) {
    return NextResponse.json(
      { error: j.error?.message || `Google Places error (HTTP ${res.status})` },
      { status: 502 },
    );
  }
  const results = (j.places ?? [])
    .map((p) => ({
      name: p.displayName?.text ?? '',
      address: (p.formattedAddress ?? '').replace(/, USA$/, ''),
      lat: p.location?.latitude ?? null,
      lng: p.location?.longitude ?? null,
    }))
    .filter((p) => p.address);
  return NextResponse.json({ results });
}
