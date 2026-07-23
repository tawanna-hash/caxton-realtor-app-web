// lib/server/agreement-upload-extract.ts
//
// Best-effort field extraction from a manually-uploaded signed agreement
// PDF so the admin drawer opens pre-filled with advertiser + ad details
// instead of just a filename-derived company name.
//
// Uses `unpdf` (serverless/edge-friendly pdfjs wrapper) to read the PDF
// text layer and reconstructs visual lines from text-item EOL flags so
// labels ("Ad Size: 1/2 page") land on their own line.
//
// FAIL-OPEN by design: any parse/extract error returns an empty `fields`
// object so the upload route still creates the signed record. Only PDFs
// with a real text layer are parsed. Scanned images / image-only PDFs
// return status 'no_text' (OCR is deferred).
//
// Regexes target the labels emitted by lib/agreement-pdf.ts, where
// drawLabelValue() draws "Label: value" on a single line, e.g.
// "Ad Size: 1/2 page", "Ad Rate: $1,234.56".

export type ExtractedAgreementFields = {
  company_name?: string;
  advertiser_email?: string;
  advertiser_phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  ad_size?: string;
  frequency?: string;
  page_position?: string;
  ad_rate_cents?: number;
  discount_cents?: number;
  ad_premium_cents?: number;
  total_monthly_rate_cents?: number;
  ad_timing_months?: Record<string, string>; // { january: '2026', ... }
  bill_to?: string;
  billing_email?: string;
  billing_contact_name?: string;
  billing_contact_phone?: string;
  exp_date?: string; // ISO YYYY-MM-DD
  start_date?: string;
  end_date?: string;
  sign_date?: string;
};

export type ExtractResult = {
  status: 'ok' | 'no_text' | 'not_attempted_image_ocr' | 'error';
  fields: ExtractedAgreementFields;
  warnings: string[];
  textPreview?: string;
};

type PdfDoc = {
  numPages: number;
  getPage: (n: number) => Promise<{
    getTextContent: () => Promise<{ items: Array<{ str?: string; hasEOL?: boolean }> }>;
  }>;
  destroy?: () => Promise<void>;
};

const MAX_BYTES = 8 * 1024 * 1024; // skip parsing huge PDFs (avoid long parses / OOM)

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8,
  sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Match "Label: value" on a single line; capture value to end of line. */
function lineValue(text: string, label: string): string | undefined {
  const re = new RegExp(`^${escapeRe(label)}:[ \\t]*([^\\n\\r]+)`, 'm');
  const m = text.match(re);
  if (!m) return undefined;
  const v = m[1].trim();
  return v || undefined;
}

/** "July 22, 2026" -> "2026-07-22". */
function parseHumanDate(s: string): string | undefined {
  const m = s.trim().match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (!m) return undefined;
  const mo = MONTHS[m[1].toLowerCase()];
  if (!mo) return undefined;
  const day = Number(m[2]);
  if (day < 1 || day > 31) return undefined;
  return `${m[3]}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "$1,234.56" -> 123456 (cents). */
function parseMoney(s: string): number | undefined {
  const cleaned = s.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return undefined;
  return Math.round(Number(cleaned) * 100);
}

function firstEmail(text: string): string | undefined {
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0].toLowerCase() : undefined;
}

function firstPhone(text: string): string | undefined {
  const m = text.match(/\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/);
  return m ? m[0].trim() : undefined;
}

/**
 * The ADVERTISER block (per agreement-pdf.ts) is unlabeled lines under an
 * "ADVERTISER" header: company_name, rep_name?, "street, city, ST zip",
 * email, phone. Email/phone are matched WITHIN this block only — the
 * PUBLISHER block (which contains tawanna@myrealtyline.com) is drawn
 * before the advertiser block, so a global email match would wrongly
 * capture the publisher's address.
 */
function extractAdvertiserBlock(text: string): {
  company_name?: string;
  advertiser_email?: string;
  advertiser_phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
} {
  const idx = text.search(/^ADVERTISER\s*$/m);
  if (idx < 0) return {};
  const after = text.slice(idx).split(/\r?\n/).slice(1);
  const lines: string[] = [];
  for (const raw of after) {
    const t = raw.trim();
    if (!t) {
      if (lines.length) break;
      continue;
    }
    if (/^(PUBLISHER|INSERTION ORDER|BILLING|TERMS|AGREEMENT ACCEPTANCE|SIGNATURE)/i.test(t)) break;
    lines.push(t);
    if (lines.length >= 6) break;
  }
  const out: {
    company_name?: string;
    advertiser_email?: string;
    advertiser_phone?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
  } = {};
  if (lines.length && lines[0] !== '—') out.company_name = lines[0];
  const blockText = lines.join('\n');
  out.advertiser_email = firstEmail(blockText);
  out.advertiser_phone = firstPhone(blockText);
  // "1200 Congress Ave, Austin, TX, 78701" (note: comma may follow the state)
  for (const ln of lines) {
    const m = ln.match(/^(.+),\s*([A-Za-z .]+),\s*([A-Z]{2}),?\s+(\d{5}(?:-\d{4})?)$/);
    if (m) {
      out.address = m[1].trim();
      out.city = m[2].trim();
      out.state = m[3];
      out.zip = m[4];
      break;
    }
  }
  return out;
}

const AD_TIMING_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/**
 * "Ad Timing: January 2026 · April 2026 · July 2026" -> { january:'2026', april:'2026', july:'2026' }.
 * The value wraps across multiple lines when many months are selected, so we
 * collect lines from "Ad Timing:" until the next label line and regex all
 * "MonthName YYYY" pairs in the joined text. Value is the year string — the
 * drawer reads ad_timing_months[k] as the year and !!ad_timing_months[k] as checked.
 */
function extractAdTiming(text: string): Record<string, string> | undefined {
  const startRe = /^Ad Timing:[ \t]*(.*)$/m;
  const sm = text.match(startRe);
  if (!sm) return undefined;
  const tail = text.slice(sm.index ?? 0).split('\n');
  let collected = tail[0] ?? '';
  for (let i = 1; i < tail.length; i++) {
    const t = (tail[i] ?? '').trim();
    if (!t) break;
    if (/^[A-Z][A-Za-z &]+:/.test(t)) break;                 // next label ("Ad Rate:")
    if (/^(PUBLISHER|ADVERTISER|INSERTION ORDER|BILLING|TERMS)/i.test(t)) break;
    collected += ' ' + tail[i];
  }
  const re = new RegExp(`\\b(${AD_TIMING_MONTHS.join('|')})\\s+(\\d{4})\\b`, 'g');
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  while ((m = re.exec(collected))) out[m[1].toLowerCase()] = m[2];
  return Object.keys(out).length ? out : undefined;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let h: ReturnType<typeof setTimeout> | undefined;
  const to = new Promise<never>((_, reject) => {
    h = setTimeout(() => reject(new Error('extraction timeout')), ms);
  });
  return Promise.race([p, to]).finally(() => {
    if (h) clearTimeout(h);
  });
}

/**
 * Read the PDF text layer via unpdf and reconstruct visual lines from
 * text-item EOL flags. The whole sequence (import + parse + read) is
 * wrapped by the caller's withTimeout so a hang can never block the
 * upload route beyond the budget. destroy() is fire-and-forget.
 */
async function parsePdfText(buffer: Buffer): Promise<{ text: string }> {
  const { getDocumentProxy } = await import('unpdf');
  const pdf = (await getDocumentProxy(new Uint8Array(buffer))) as PdfDoc;
  let text = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    for (const it of content.items) {
      if (typeof it.str === 'string') text += it.str;
      if (it.hasEOL) text += '\n';
    }
    text += '\n';
  }
  await pdf.destroy?.().catch(() => undefined);
  return { text };
}

export async function extractUploadedAgreementFields(opts: {
  fileName: string;
  mimeType?: string;
  buffer: Buffer;
}): Promise<ExtractResult> {
  const { fileName, buffer } = opts;
  const mime = opts.mimeType ?? '';
  const isPdf = /pdf$/i.test(fileName) || mime.includes('pdf');
  if (!isPdf) {
    return {
      status: 'not_attempted_image_ocr',
      fields: {},
      warnings: ['image/non-PDF upload — OCR not attempted'],
    };
  }
  if (buffer.length > MAX_BYTES) {
    return {
      status: 'error',
      fields: {},
      warnings: [`file too large to parse (${(buffer.length / 1024 / 1024).toFixed(1)}MB > 8MB)`],
    };
  }

  try {
    const result = await withTimeout(parsePdfText(buffer), 6000);
    const text = (result?.text ?? '').trim();
    if (!text) {
      return { status: 'no_text', fields: {}, warnings: ['no text layer (likely a scanned image)'] };
    }

    const fields: ExtractedAgreementFields = {};
    const set = (k: keyof ExtractedAgreementFields, v: unknown): void => {
      if (v !== undefined && v !== null && v !== '') {
        (fields as Record<string, unknown>)[k] = v;
      }
    };

    const advertiser = extractAdvertiserBlock(text);
    set('company_name', advertiser.company_name);
    set('advertiser_email', advertiser.advertiser_email);
    set('advertiser_phone', advertiser.advertiser_phone);
    set('address', advertiser.address);
    set('city', advertiser.city);
    set('state', advertiser.state);
    set('zip', advertiser.zip);
    set('ad_size', lineValue(text, 'Ad Size'));
    set('frequency', lineValue(text, 'Frequency'));
    set('page_position', lineValue(text, 'Page Position'));
    set('ad_rate_cents', parseMoney(lineValue(text, 'Ad Rate') ?? ''));
    set('discount_cents', parseMoney(lineValue(text, 'Discount') ?? ''));
    set('ad_premium_cents', parseMoney(lineValue(text, 'Page Position Premium') ?? ''));
    set('total_monthly_rate_cents', parseMoney(lineValue(text, 'Total Monthly Rate') ?? ''));
    set('ad_timing_months', extractAdTiming(text));
    set('bill_to', lineValue(text, 'Bill To'));
    set('billing_email', lineValue(text, 'Billing Email'));
    set('billing_contact_name', lineValue(text, 'Billing Contact'));
    set('billing_contact_phone', lineValue(text, 'Billing Phone'));
    set('exp_date', parseHumanDate(lineValue(text, 'Agreement Expiration') ?? ''));
    const signedOn = lineValue(text, 'Signed on');
    if (signedOn) set('sign_date', parseHumanDate(signedOn));
    const placement = lineValue(text, 'Placement Date');
    if (placement) {
      const parts = placement.split(/\s[–—-]\s/).map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        set('start_date', parseHumanDate(parts[0] ?? ''));
        set('end_date', parseHumanDate(parts[1] ?? ''));
      } else {
        set('start_date', parseHumanDate(parts[0] ?? ''));
      }
    }

    return { status: 'ok', fields, warnings: [], textPreview: text.slice(0, 200) };
  } catch (e) {
    return {
      status: 'error',
      fields: {},
      warnings: [e instanceof Error ? e.message : String(e)],
    };
  }
}
