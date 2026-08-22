// lib/server/tabular-import.ts
//
// Parses CSV, Excel (.xlsx / .xls), and XML uploads into the same
// { locations, staff } shape produced by the screenshot extractor so
// both code paths can share the downstream DB-insert logic.
//
// Supported shapes:
//   * Single sheet / table of staff rows  -> staff[]
//   * Single sheet / table of location rows -> locations[]
//   * Workbook with two sheets named "locations" + "staff" -> both
//   * XML with <location> / <staff> elements (or <locations>/<staff>)
//
// Column detection is fuzzy: we lowercase and normalize the header
// names ("First Name", "first_name", "FIRST NAME" all map to first_name).
// Recognized column synonyms are listed in COLUMN_SYNONYMS below.

import ExcelJS from 'exceljs';
import { XMLParser } from 'fast-xml-parser';
import type { ExtractedLocation, ExtractedStaffMember } from './gemini-screenshot-extract';

interface TabularImportResult {
  locations: ExtractedLocation[];
  staff: ExtractedStaffMember[];
}

type TabularImportError =
  | { ok: false; reason: 'empty' | 'parse-error' | 'no-rows' | 'no-recognized-columns'; detail?: string };

export type TabularImportOutcome =
  | { ok: true; data: TabularImportResult }
  | TabularImportError;

// ── Column synonyms ─────────────────────────────────────────────────
// Map normalized header -> canonical field name.
const COLUMN_SYNONYMS: Record<string, string> = {
  // Staff name
  name: 'name',
  full_name: 'name',
  fullname: 'name',
  staff_name: 'name',
  agent_name: 'name',
  // Title / role
  title: 'title',
  role: 'title',
  position: 'title',
  job_title: 'title',
  // Email
  email: 'email',
  email_address: 'email',
  e_mail: 'email',
  // Phone
  phone: 'phone',
  phone_number: 'phone',
  mobile: 'phone',
  cell: 'phone',
  cellphone: 'phone',
  telephone: 'phone',
  tel: 'phone',
  // Photo
  photo: 'photo_url',
  photo_url: 'photo_url',
  image: 'photo_url',
  image_url: 'photo_url',
  avatar: 'photo_url',
  // Location label / branch
  label: 'label',
  branch: 'label',
  office: 'label',
  office_name: 'label',
  location: 'label',
  location_name: 'label',
  // Address
  address: 'address',
  street: 'address',
  street_address: 'address',
  address_1: 'address',
  address1: 'address',
  // Address 2
  address_2: 'address_2',
  address2: 'address_2',
  suite: 'address_2',
  unit: 'address_2',
  // City / state / zip
  city: 'city',
  town: 'city',
  state: 'state',
  province: 'state',
  region: 'state',
  zip: 'zip',
  zipcode: 'zip',
  zip_code: 'zip',
  postal: 'zip',
  postal_code: 'zip',
  // Hours
  hours: 'hours',
  business_hours: 'hours',
  office_hours: 'hours',
  // Primary flag
  primary: 'is_primary',
  is_primary: 'is_primary',
  hq: 'is_primary',
  headquarters: 'is_primary',
};

const LOCATION_FIELDS = new Set([
  'label', 'address', 'address_2', 'city', 'state', 'zip',
  'phone', 'email', 'hours', 'is_primary',
]);

const STAFF_FIELDS = new Set(['name', 'title', 'email', 'phone', 'photo_url']);

// ── Header normalization ────────────────────────────────────────────
function normalizeHeader(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function mapHeaders(rawHeaders: string[]): (string | null)[] {
  return rawHeaders.map((h) => {
    if (!h) return null;
    const norm = normalizeHeader(h);
    return COLUMN_SYNONYMS[norm] ?? null;
  });
}

// ── Row -> {locations,staff} classification ─────────────────────────
function emptyLocation(): ExtractedLocation {
  return {
    label: null, address: null, address_2: null, city: null, state: null,
    zip: null, phone: null, email: null, hours: null, is_primary: false,
  };
}

function emptyStaff(): ExtractedStaffMember {
  return {
    name: '', title: null, email: null, phone: null, photo_url: null,
    location_index: null,
  };
}

function parseBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v !== 'string') return false;
  const s = v.trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === 'y' || s === '1' || s === 'x' || s === 'primary' || s === 'hq';
}

function asString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

/**
 * Given a row keyed by canonical field name, return either a location, a
 * staff member, or null if the row is empty.
 *
 * We treat a row as "staff" if it has a `name`; otherwise if it has any
 * location field set, treat it as a location.
 */
function classifyRow(row: Record<string, unknown>): { kind: 'staff'; data: ExtractedStaffMember } | { kind: 'location'; data: ExtractedLocation } | null {
  const name = asString(row.name);
  const hasAnyStaffField = STAFF_FIELDS.has('name') && (
    name || asString(row.title) || asString(row.photo_url)
  );

  if (hasAnyStaffField && name) {
    const s = emptyStaff();
    s.name = name;
    s.title = asString(row.title);
    s.email = asString(row.email);
    s.phone = asString(row.phone);
    s.photo_url = asString(row.photo_url);
    return { kind: 'staff', data: s };
  }

  // Otherwise check for location fields
  const locFields = ['label', 'address', 'city', 'state', 'zip', 'hours', 'address_2'];
  const hasLocationField = locFields.some((k) => asString(row[k]));
  if (hasLocationField) {
    const l = emptyLocation();
    l.label = asString(row.label);
    l.address = asString(row.address);
    l.address_2 = asString(row.address_2);
    l.city = asString(row.city);
    l.state = asString(row.state);
    l.zip = asString(row.zip);
    l.phone = asString(row.phone);
    l.email = asString(row.email);
    l.hours = asString(row.hours);
    l.is_primary = parseBool(row.is_primary);
    return { kind: 'location', data: l };
  }

  return null;
}

function rowsToResult(rows: Record<string, unknown>[]): TabularImportResult {
  const result: TabularImportResult = { locations: [], staff: [] };
  for (const row of rows) {
    const cls = classifyRow(row);
    if (!cls) continue;
    if (cls.kind === 'staff') result.staff.push(cls.data);
    else result.locations.push(cls.data);
  }
  // Ensure at most one primary location flag survives
  let primarySet = false;
  for (const l of result.locations) {
    if (l.is_primary) {
      if (primarySet) l.is_primary = false;
      else primarySet = true;
    }
  }
  return result;
}

// ── CSV parser (small, dependency-free) ─────────────────────────────
// Handles quoted fields, escaped quotes ("" inside a quoted field), CRLF.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (i + 1 < n && text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    // not in quotes
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r') {
      // skip; \n will end the row
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // flush last field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // strip fully-empty trailing rows
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c.trim() === '')) {
    rows.pop();
  }
  return rows;
}

function parseCsvBuffer(buf: Buffer): TabularImportOutcome {
  const text = buf.toString('utf8').replace(/^\uFEFF/, ''); // strip BOM
  if (!text.trim()) return { ok: false, reason: 'empty' };

  const cells = parseCsv(text);
  if (cells.length < 2) {
    return { ok: false, reason: 'no-rows', detail: 'need a header row + at least one data row' };
  }

  const rawHeaders = cells[0];
  const mapped = mapHeaders(rawHeaders);
  const anyKnown = mapped.some((m) => m !== null);
  if (!anyKnown) {
    return {
      ok: false,
      reason: 'no-recognized-columns',
      detail: `recognized none of: ${rawHeaders.join(', ')}`,
    };
  }

  const rows: Record<string, unknown>[] = [];
  for (let r = 1; r < cells.length; r++) {
    const row: Record<string, unknown> = {};
    for (let c = 0; c < mapped.length; c++) {
      const key = mapped[c];
      if (!key) continue;
      row[key] = cells[r][c] ?? '';
    }
    rows.push(row);
  }

  return { ok: true, data: rowsToResult(rows) };
}

// ── Excel parser ────────────────────────────────────────────────────
async function parseExcelBuffer(buf: Buffer): Promise<TabularImportOutcome> {
  const wb = new ExcelJS.Workbook();
  try {
    // Cast: exceljs types want ArrayBuffer; Node Buffer is a Uint8Array, OK at runtime.
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch (err) {
    return {
      ok: false,
      reason: 'parse-error',
      detail: err instanceof Error ? err.message : 'xlsx parse error',
    };
  }

  if (wb.worksheets.length === 0) {
    return { ok: false, reason: 'empty', detail: 'no worksheets' };
  }

  const aggregate: TabularImportResult = { locations: [], staff: [] };

  for (const ws of wb.worksheets) {
    // Pull rows as arrays
    const sheetRows: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (excelRow) => {
      const values = excelRow.values;
      if (!Array.isArray(values)) return;
      // exceljs row.values is 1-indexed (index 0 is undefined)
      const arr: string[] = [];
      for (let i = 1; i < values.length; i++) {
        const v = values[i];
        if (v === null || v === undefined) {
          arr.push('');
        } else if (typeof v === 'object') {
          // exceljs returns rich values for formulas, hyperlinks, rich-text, etc.
          const obj = v as unknown as Record<string, unknown>;
          if ('text' in obj) arr.push(String(obj.text ?? ''));
          else if ('result' in obj) arr.push(String(obj.result ?? ''));
          else if ('richText' in obj && Array.isArray(obj.richText)) {
            arr.push((obj.richText as Array<{ text?: string }>).map((r) => r.text ?? '').join(''));
          } else if (v instanceof Date) {
            arr.push(v.toISOString());
          } else {
            arr.push('');
          }
        } else {
          arr.push(String(v));
        }
      }
      sheetRows.push(arr);
    });

    if (sheetRows.length < 2) continue;

    const rawHeaders = sheetRows[0];
    const mapped = mapHeaders(rawHeaders);
    if (!mapped.some((m) => m !== null)) continue;

    // Sheet-name hint: if the sheet is explicitly named locations/staff,
    // force classification accordingly.
    const sheetName = ws.name.toLowerCase().trim();
    const forceLocations = sheetName.includes('location') || sheetName.includes('office') || sheetName.includes('branch');
    const forceStaff = sheetName.includes('staff') || sheetName.includes('agent') || sheetName.includes('people') || sheetName.includes('team');

    for (let r = 1; r < sheetRows.length; r++) {
      const row: Record<string, unknown> = {};
      for (let c = 0; c < mapped.length; c++) {
        const key = mapped[c];
        if (!key) continue;
        row[key] = sheetRows[r][c] ?? '';
      }
      const cls = classifyRow(row);
      if (!cls) continue;
      // Force-classify by sheet name when applicable
      if (forceLocations && cls.kind === 'staff') {
        // Demote: try interpreting same row as a location instead
        const loc = emptyLocation();
        loc.label = asString(row.label) ?? asString(row.name);
        loc.address = asString(row.address);
        loc.city = asString(row.city);
        loc.state = asString(row.state);
        loc.zip = asString(row.zip);
        loc.phone = asString(row.phone);
        loc.email = asString(row.email);
        loc.hours = asString(row.hours);
        loc.is_primary = parseBool(row.is_primary);
        if (loc.label || loc.address || loc.city) aggregate.locations.push(loc);
        continue;
      }
      if (forceStaff && cls.kind === 'location') {
        const s = emptyStaff();
        s.name = asString(row.name) ?? asString(row.label) ?? '';
        if (s.name) {
          s.title = asString(row.title);
          s.email = asString(row.email);
          s.phone = asString(row.phone);
          aggregate.staff.push(s);
        }
        continue;
      }
      if (cls.kind === 'staff') aggregate.staff.push(cls.data);
      else aggregate.locations.push(cls.data);
    }
  }

  if (aggregate.locations.length === 0 && aggregate.staff.length === 0) {
    return {
      ok: false,
      reason: 'no-recognized-columns',
      detail: 'none of the sheets had recognizable headers (name, email, phone, address, city, etc.)',
    };
  }

  return { ok: true, data: aggregate };
}

// ── XML parser ──────────────────────────────────────────────────────
function parseXmlBuffer(buf: Buffer): TabularImportOutcome {
  const text = buf.toString('utf8').replace(/^\uFEFF/, '');
  if (!text.trim()) return { ok: false, reason: 'empty' };

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    trimValues: true,
    parseTagValue: true,
    parseAttributeValue: false,
  });

  let parsed: unknown;
  try {
    parsed = parser.parse(text);
  } catch (err) {
    return {
      ok: false,
      reason: 'parse-error',
      detail: err instanceof Error ? err.message : 'xml parse error',
    };
  }

  // Walk the parsed object collecting any tag whose name normalizes
  // to a "staff"-ish or "location"-ish singular noun.
  const STAFF_TAGS = new Set(['staff', 'staffmember', 'employee', 'agent', 'person', 'member', 'contact']);
  const LOCATION_TAGS = new Set(['location', 'office', 'branch', 'address']);

  const staffRowsRaw: Record<string, unknown>[] = [];
  const locRowsRaw: Record<string, unknown>[] = [];

  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const obj = node as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      const tag = normalizeHeader(k);
      if (STAFF_TAGS.has(tag)) {
        if (Array.isArray(v)) {
          for (const item of v) {
            if (item && typeof item === 'object') staffRowsRaw.push(item as Record<string, unknown>);
          }
        } else if (v && typeof v === 'object') {
          staffRowsRaw.push(v as Record<string, unknown>);
        }
      } else if (LOCATION_TAGS.has(tag)) {
        if (Array.isArray(v)) {
          for (const item of v) {
            if (item && typeof item === 'object') locRowsRaw.push(item as Record<string, unknown>);
          }
        } else if (v && typeof v === 'object') {
          locRowsRaw.push(v as Record<string, unknown>);
        }
      } else if (v && typeof v === 'object') {
        visit(v);
      }
    }
  };
  visit(parsed);

  // Apply column synonyms to each element's keys
  const mapRow = (raw: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      const norm = normalizeHeader(k);
      const canonical = COLUMN_SYNONYMS[norm];
      if (canonical) out[canonical] = v;
    }
    return out;
  };

  const result: TabularImportResult = { locations: [], staff: [] };

  for (const raw of staffRowsRaw) {
    const row = mapRow(raw);
    const name = asString(row.name);
    if (!name) continue;
    const s = emptyStaff();
    s.name = name;
    s.title = asString(row.title);
    s.email = asString(row.email);
    s.phone = asString(row.phone);
    s.photo_url = asString(row.photo_url);
    result.staff.push(s);
  }

  for (const raw of locRowsRaw) {
    const row = mapRow(raw);
    if (!asString(row.label) && !asString(row.address) && !asString(row.city)) continue;
    const l = emptyLocation();
    l.label = asString(row.label);
    l.address = asString(row.address);
    l.address_2 = asString(row.address_2);
    l.city = asString(row.city);
    l.state = asString(row.state);
    l.zip = asString(row.zip);
    l.phone = asString(row.phone);
    l.email = asString(row.email);
    l.hours = asString(row.hours);
    l.is_primary = parseBool(row.is_primary);
    result.locations.push(l);
  }

  if (result.locations.length === 0 && result.staff.length === 0) {
    return {
      ok: false,
      reason: 'no-recognized-columns',
      detail: 'no <staff>, <agent>, <location>, or <office> elements with recognizable child tags',
    };
  }

  return { ok: true, data: result };
}

// ── Public entry point ──────────────────────────────────────────────
export type TabularKind = 'csv' | 'xlsx' | 'xml';

export function detectTabularKind(mime: string, filename: string): TabularKind | null {
  const m = (mime || '').toLowerCase();
  const f = (filename || '').toLowerCase();
  if (m.includes('csv') || f.endsWith('.csv')) return 'csv';
  if (
    m.includes('spreadsheetml') ||
    m.includes('ms-excel') ||
    m === 'application/vnd.ms-excel' ||
    f.endsWith('.xlsx') ||
    f.endsWith('.xls')
  ) return 'xlsx';
  if (m.includes('xml') || f.endsWith('.xml')) return 'xml';
  return null;
}

export async function parseTabularUpload(args: {
  buf: Buffer;
  kind: TabularKind;
}): Promise<TabularImportOutcome> {
  const { buf, kind } = args;
  if (buf.length === 0) return { ok: false, reason: 'empty' };

  if (kind === 'csv') return parseCsvBuffer(buf);
  if (kind === 'xml') return parseXmlBuffer(buf);
  if (kind === 'xlsx') return parseExcelBuffer(buf);

  return { ok: false, reason: 'parse-error', detail: `unsupported kind: ${String(kind)}` };
}

// Re-export for tests / debugging.
const _internal = {
  parseCsv,
  normalizeHeader,
  mapHeaders,
  classifyRow,
  rowsToResult,
  LOCATION_FIELDS,
  STAFF_FIELDS,
};
