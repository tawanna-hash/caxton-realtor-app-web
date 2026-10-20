// lib/agreements-v2/placement.ts
//
// Agreements (Beta): the extra details non-print products need before signing,
// matching what the full signing form collects. e-Blast lines need a preferred
// send date (plus up to three alternates); app lines need a run start date and
// get their end date from the run length. Digital placements need nothing here.
// Pure helpers; the server re-derives everything from the stored agreement.

export type PlacementLine = {
  line_no: number;
  label: string;
  channel: 'email' | 'app';
  frequency: string | null;
  quantity: number;
  start_date: string | null;
  preferred_send_dates: string[];
};

export type PlacementInput = {
  lines?: Array<{ line_no: number; start_date?: string; preferred_send_dates?: string[] }>;
  single?: { start_date?: string; preferred_send_dates?: string[] };
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const asIso = (v: unknown): string | null => {
  if (!v) return null;
  const s = v instanceof Date ? v.toISOString() : String(v);
  return ISO.test(s.slice(0, 10)) ? s.slice(0, 10) : null;
};

/** Mirror of the full form's run-length rule: weekly = start + weeks*7 - 1 days, monthly = end of the last month. */
export function computeAppEnd(startIso: string, li: { frequency?: string | null; quantity?: number | null }): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startIso);
  if (!m) return startIso;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const freq = (li.frequency ?? '').trim();
  const qty = Math.max(1, li.quantity ?? 1);
  if (/mo$/i.test(freq)) return new Date(Date.UTC(y, mo - 1 + qty, 0)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(y, mo - 1, d));
  end.setUTCDate(end.getUTCDate() + qty * 7 - 1);
  return end.toISOString().slice(0, 10);
}

export function parseAppQty(freq: string | null | undefined): number {
  const m = /^\s*(\d+)/.exec(freq ?? '');
  return m ? Number(m[1]) : 1;
}

type LineRow = { line_no: number; package_label: string; channel: string; frequency: string | null; quantity: number | null; start_date: unknown; preferred_send_dates?: unknown };
type AgRow = { channel: 'print' | 'email' | 'digital' | 'app' | string; frequency: string | null; start_date: unknown; preferred_send_dates?: unknown };

/** What the partner can still fill in. Empty when nothing is needed. */
export function placementNeeds(ag: AgRow, lines: LineRow[]): { lines: PlacementLine[]; single: PlacementLine | null } {
  const out: PlacementLine[] = lines
    .filter((l) => l.channel === 'email' || l.channel === 'app')
    .map((l) => ({
      line_no: l.line_no,
      label: l.package_label,
      channel: l.channel as 'email' | 'app',
      frequency: l.frequency,
      quantity: Math.max(1, Number(l.quantity ?? 1)),
      start_date: asIso(l.start_date),
      preferred_send_dates: Array.isArray(l.preferred_send_dates) ? (l.preferred_send_dates as unknown[]).map(asIso).filter((x): x is string => Boolean(x)) : [],
    }));
  let single: PlacementLine | null = null;
  if (lines.length === 0 && (ag.channel === 'email' || ag.channel === 'app')) {
    single = {
      line_no: 0,
      label: ag.channel === 'email' ? 'e-Blast' : 'App placement',
      channel: ag.channel,
      frequency: ag.frequency,
      quantity: parseAppQty(ag.frequency),
      start_date: asIso(ag.start_date),
      preferred_send_dates: Array.isArray(ag.preferred_send_dates) ? (ag.preferred_send_dates as unknown[]).map(asIso).filter((x): x is string => Boolean(x)) : [],
    };
  }
  return { lines: out, single };
}

const cleanDates = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)).filter((x) => ISO.test(x)).slice(0, 4) : []);

/**
 * Validate the partner's dates and build the patches the live signing endpoint
 * understands (line_item_dates, preferred_send_dates, start_date, end_date).
 */
export function buildPlacementPatches(
  needs: { lines: PlacementLine[]; single: PlacementLine | null },
  input: PlacementInput | undefined,
  todayIso: string,
): { ok: true; patches: Record<string, unknown> } | { ok: false; error: string } {
  const patches: Record<string, unknown> = {};
  const lineDates: Array<Record<string, unknown>> = [];

  const resolve = (n: PlacementLine, given: { start_date?: string; preferred_send_dates?: string[] } | undefined) => {
    const alt = cleanDates(given?.preferred_send_dates);
    const start = given?.start_date && ISO.test(given.start_date) ? given.start_date : alt[0] ?? n.preferred_send_dates[0] ?? n.start_date;
    if (!start) return { error: n.channel === 'email' ? `Please choose a preferred send date for ${n.label}.` : `Please choose a start date for ${n.label}.` };
    if (start < todayIso) return { error: `The date for ${n.label} cannot be in the past.` };
    const dates = n.channel === 'email' ? [start, ...alt.filter((d) => d !== start)].filter((d) => d >= todayIso).slice(0, 4) : [];
    const end = n.channel === 'email' ? start : computeAppEnd(start, n);
    return { start, end, dates };
  };

  for (const n of needs.lines) {
    const r = resolve(n, input?.lines?.find((l) => l.line_no === n.line_no));
    if ('error' in r) return { ok: false, error: r.error as string };
    lineDates.push({ line_no: n.line_no, start_date: r.start, end_date: r.end, ...(n.channel === 'email' ? { preferred_send_dates: r.dates } : {}) });
  }
  if (lineDates.length) patches.line_item_dates = lineDates;

  if (needs.single) {
    const r = resolve(needs.single, input?.single);
    if ('error' in r) return { ok: false, error: r.error as string };
    patches.start_date = r.start;
    patches.end_date = r.end;
    if (needs.single.channel === 'email') patches.preferred_send_dates = r.dates;
  }
  return { ok: true, patches };
}
