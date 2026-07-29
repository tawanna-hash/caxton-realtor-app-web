// app/api/admin/inventory/extract-flyer/route.ts
//
// Auto-populate helper for the admin create form: accepts a builder/developer
// flyer PDF, extracts its text via `unpdf`, runs lightweight heuristics, and
// returns the best-guess fields so the admin only has to review/tweak instead
// of re-typing the whole flyer.
//
// Input:  multipart/form-data with a `flyerPdf` field (application/pdf).
// Output: { title, description, builderName, expiresAt, promoType,
//           priceMin, priceMax, bedsMin, bedsMax, sqftMin, sqftMax, text }
//
// This is intentionally best-effort — builder flyers vary wildly in layout,
// so every field is a suggestion. The admin form keeps the extracted PDF
// attached and the admin can correct anything before publishing.
//
// Auth: same admin-gate as the rest of /api/admin/inventory.

import { NextResponse, type NextRequest } from 'next/server';
import { getDocumentProxy, extractText } from 'unpdf';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB

async function isAdmin(): Promise<boolean> {
  try {
    const admin = await getCurrentAdmin();
    return admin !== null;
  } catch {
    return false;
  }
}

// ── Heuristics ────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  january: 0, february: 1, march: 2, april: 3,
  june: 5, july: 6, august: 7, september: 8,
  october: 9, november: 10, december: 11,
};

function iso(year: number, monthIdx: number, day: number): string | null {
  if (!Number.isFinite(year) || year < 2020 || year > 2099) return null;
  if (monthIdx < 0 || monthIdx > 11) return null;
  if (!Number.isFinite(day) || day < 1 || day > 31) return null;
  const mm = String(monthIdx + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

// "ends July 31" / "through June 30, 2026" / "expires Sep 30" / "by July 31"
function parseEndDate(text: string): string | null {
  const currentYear = new Date().getFullYear();
  const anchorRe =
    /(ends?|ending|until|through|by|expires?|valid\s+through|offer\s+ends?)\s+([A-Za-z]+)\s+(\d{1,2})(?:,?\s*(\d{4}))?/i;
  const am = text.match(anchorRe);
  if (am) {
    const mo = MONTHS[am[2].toLowerCase()];
    if (mo !== undefined) {
      const y = am[4] ? Number(am[4]) : currentYear;
      return iso(y, mo, Number(am[3]));
    }
  }
  return null;
}

// First dollar amount in the text → price (e.g. "$425,000", "$425k").
function parsePrice(text: string): { min: number | null; max: number | null } {
  const m = text.match(/\$\s*(\d{1,3}(?:,\d{3})+|\d+[kK])/);
  if (!m) return { min: null, max: null };
  let raw = m[1].replace(/,/g, '');
  if (/k$/i.test(raw)) raw = String(Number(raw.slice(0, -1)) * 1000);
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return { min: null, max: null };
  // "from $X" / "starting at $X" → min only; "$X–$Y" → min/max.
  const range = text.match(/\$\s*(\d{1,3}(?:,\d{3})+|\d+[kK])\s*(?:[-–to]+)\s*\$\s*(\d{1,3}(?:,\d{3})+|\d+[kK])/);
  if (range) {
    const lo = Number(range[1].replace(/,/g, '').replace(/k$/i, '000'));
    const hiRaw = range[2].replace(/,/g, '').replace(/k$/i, '000');
    const hi = Number(hiRaw);
    if (Number.isFinite(lo) && Number.isFinite(hi)) return { min: lo, max: hi };
  }
  return { min: n, max: null };
}

// "3-4 beds" / "3 beds" / "3 bed"
function parseBeds(text: string): { min: number | null; max: number | null } {
  const range = text.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})\s*bed/i);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const single = text.match(/(\d{1,2})\s*bed/i);
  if (single) return { min: Number(single[1]), max: Number(single[1]) };
  return { min: null, max: null };
}

// "2,400 sq ft" / "2,400 sqft" / "2400 sq. ft."
function parseSqft(text: string): { min: number | null; max: number | null } {
  const range = text.match(/(\d{1,2}(?:,\d{3})+)\s*(?:[-–to]+)\s*(\d{1,2}(?:,\d{3})+)\s*(?:sq\.?\s*ft|sqft)/i);
  if (range) {
    const lo = Number(range[1].replace(/,/g, ''));
    const hi = Number(range[2].replace(/,/g, ''));
    if (Number.isFinite(lo) && Number.isFinite(hi)) return { min: lo, max: hi };
  }
  const single = text.match(/(\d{1,2}(?:,\d{3})+)\s*(?:sq\.?\s*ft|sqft)/i);
  if (single) {
    const n = Number(single[1].replace(/,/g, ''));
    if (Number.isFinite(n)) return { min: n, max: n };
  }
  return { min: null, max: null };
}

// Known builders (case-insensitive substring match) so we don't fall back to a
// promo headline as the builder name. Extend as new builders come on.
const KNOWN_BUILDERS = [
  'Drees', 'M/I Homes', 'MI Homes', 'Lennar', 'KB Home', 'Brookfield',
  'David Weekley', 'Newmark', 'Giddens', 'Santa Rita', 'La Cima',
  'Ashton Woods', 'Taylor Morrison', 'Meritage', 'Pulte', 'Century',
  'Highland Homes', 'Perry Homes', 'CastleRock', 'Grand Haven', 'Wilshire',
  'Trophy Signature', 'History Maker', 'First Floor Living', 'Kolter',
  'Pacesetter', 'Sitterle', 'Lifestyle', 'Epic', 'CastleRock Communities',
];

function guessBuilder(text: string): string | null {
  const lower = text.toLowerCase();
  for (const b of KNOWN_BUILDERS) {
    if (lower.includes(b.toLowerCase())) return b;
  }
  return null;
}

// First non-trivial line as the title. Skip URLs, phones, emails, and lines
// that are obviously boilerplate (www., ©, etc.). If the first candidate is a
// long merged paragraph (some PDFs collapse line breaks), take just the
// first sentence / first ~80 chars at a word boundary.
function guessTitle(lines: string[]): string | null {
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length < 4) continue;
    if (/^www\./i.test(line) || /^https?:\/\//i.test(line)) continue;
    if (/^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/.test(line)) continue; // phone
    if (/^[^@]+@[^@]+\.[^@]+$/.test(line)) continue; // email
    if (/©|all rights reserved/i.test(line)) continue;
    if (/^\d+\s*(%|percent)/i.test(line)) continue; // rate line
    if (/^\$/.test(line)) continue;
    if (line.length > 80) {
      // Merged paragraph — take the first sentence, capped at 100 chars.
      const sentence = line.split(/(?<=[.!?])\s+/)[0];
      const cap = (sentence.length > 100 ? sentence.slice(0, 100) : sentence);
      // Trim to a word boundary if we truncated mid-word.
      const out = cap.length >= 100 ? cap.replace(/\s+\S*$/, '').trim() : cap.trim();
      return out || line.slice(0, 80);
    }
    return line.slice(0, 100);
  }
  return null;
}

function classifyPromoType(text: string): 'rate_buydown' | 'incentive' | 'broker_bonus' | 'event' | 'other' {
  const blob = text.toLowerCase();
  if (/\b(realtor|broker|commission)\b/.test(blob)) return 'broker_bonus';
  if (/\b(buydown|buy-down|rate|apr|interest rate)\b/.test(blob)) return 'rate_buydown';
  if (/\b(grand opening|event|celebration|weekend)\b/.test(blob)) return 'event';
  if (/\b(closing cost|credit|flex cash|save \$|saving|upgrade|price)\b/.test(blob)) return 'incentive';
  return 'other';
}

// ── Route ─────────────────────────────────────────────────────────────────

export const POST = withAdminTracking(async function POST(request: NextRequest) {
  const ok = await isAdmin();
  if (!ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let fd: FormData;
  try {
    fd = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const entry = fd.get('flyerPdf');
  if (!(entry instanceof File)) {
    return NextResponse.json({ error: 'Missing flyerPdf file' }, { status: 400 });
  }
  if (entry.type !== 'application/pdf') {
    return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 });
  }
  if (entry.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: 'PDF must be under 25 MB' }, { status: 413 });
  }

  let text: string;
  try {
    const buf = new Uint8Array(await entry.arrayBuffer());
    const pdf = await getDocumentProxy(buf);
    const out = await extractText(pdf, { mergePages: true });
    text = (out.text ?? '').trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json(
      { error: `Could not extract text from PDF: ${msg}` },
      { status: 422 },
    );
  }

  if (!text) {
    return NextResponse.json(
      { error: 'No selectable text found in this PDF (it may be a scanned image).' },
      { status: 422 },
    );
  }

  // Normalize whitespace into lines for title guessing + a single-string body.
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);
  const body = lines.join(' ').replace(/\s+/g, ' ').trim();

  const title = guessTitle(lines);
  const builderName = guessBuilder(body);
  const description = body.slice(0, 1200) || null;
  const expiresAt = parseEndDate(body);
  const promoType = classifyPromoType(body);
  const price = parsePrice(body);
  const beds = parseBeds(body);
  const sqft = parseSqft(body);

  return NextResponse.json({
    title,
    description,
    builderName,
    expiresAt,
    promoType,
    priceMin: price.min,
    priceMax: price.max,
    bedsMin: beds.min,
    bedsMax: beds.max,
    sqftMin: sqft.min,
    sqftMax: sqft.max,
    text: body.slice(0, 4000),
  });
});
