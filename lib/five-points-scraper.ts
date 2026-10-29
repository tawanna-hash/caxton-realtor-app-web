// lib/five-points-scraper.ts
//
// Five Points Board of REALTORS (Williamson & Bastrop counties) member
// directory collector.
//
// Source: the board's public RAPAMS "Find Members/Offices" pages at
//         https://wctx.rapams.com/scripts/mgrqispi.dll (APPNAME=IMS).
//         Member detail pages (IMSListingAgentDetail) render without a login.
//
// Strategy:
//   1. POST the member search with last-name prefixes A..Z. The server caps a
//      result list at 100 rows, so any prefix that hits the cap is split by
//      one more letter (Ab -> Aba, Abb ...) until every list is under the cap.
//   2. GET each member detail page for name, office, phones and email.
//   Requests are low-concurrency with a small delay to stay polite.
//
// external_id = RAPAMS member id, external_source = 'five-points-board'.

const ENDPOINT = 'https://wctx.rapams.com/scripts/mgrqispi.dll';
const BOARD_ID = '263339352';
const RESULT_CAP = 100;
const MAX_PREFIX_LEN = 6;
const FETCH_TIMEOUT_MS = 30_000;

export const FIVE_POINTS_SOURCE = 'five-points-board';
export const FIVE_POINTS_LABEL = 'Five Points Board';

const HEADERS = {
  'User-Agent': 'RealtyNewsNow-directory-sync/1.0 (+https://realtynewsnow.app)',
  Accept: 'text/html,application/xhtml+xml',
};

export interface FivePointsRecord {
  external_id: string;
  external_source: typeof FIVE_POINTS_SOURCE;
  first_name: string;
  last_name: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  address: string | null;
  state: string | null;
  zip: string | null;
  office_phone: string | null;
  is_affiliate: boolean;
}

export interface FivePointsScrapeOptions {
  /** Stop after this many member detail pages (testing). */
  maxRecords?: number;
  /** Parallel requests; default 8. */
  concurrency?: number;
  /** Delay after each request per worker, ms; default 120. */
  delayMs?: number;
  /** Stop fetching detail pages after this many ms (serverless time budget). */
  budgetMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request(init: RequestInit & { url: string }, delayMs: number): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(init.url, {
        method: init.method,
        body: init.body,
        headers: { ...HEADERS, ...(init.headers as Record<string, string> | undefined) },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: 'no-store',
      });
      if (res.ok) {
        const text = await res.text();
        await sleep(delayMs);
        return text;
      }
    } catch {
      /* retry */
    }
    await sleep(1500 * (attempt + 1));
  }
  return '';
}

async function searchPrefix(prefix: string, delayMs: number): Promise<string[]> {
  const body = new URLSearchParams({
    APPNAME: 'IMS',
    PRGNAME: 'IMSAgentsandOffices',
    ARGUMENTS: `-A${BOARD_ID},-N2,LastName,(P) Agent Nickname,(P) Office Name,(P) City,(P) Zip Code`,
    Member_Where_Category_Codes: "'AFF'",
    Office_Where_Category_Codes: "'AFO'",
    Search_Type: 'A',
    LastName: prefix,
    '(P) Agent Nickname': '',
    '(P) Office Name': '',
    '(P) City': '',
    '(P) Zip Code': '',
    List_Code_AFF: '',
    List_Code_AFO: '',
  });
  const html = await request(
    {
      url: ENDPOINT,
      method: 'POST',
      body: body.toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
    delayMs,
  );
  const ids = new Set<string>();
  for (const m of html.matchAll(/IMSListingAgentDetail&(?:amp;)?ARGUMENTS=(-N\d+,-N\d+)/g)) ids.add(m[1]);
  return [...ids];
}

/** Collect every member detail argument ("-N<memberId>,-N<boardId>"). */
async function collectMemberArgs(delayMs: number, concurrency: number): Promise<string[]> {
  const found = new Set<string>();
  let queue: string[] = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  while (queue.length > 0) {
    const next: string[] = [];
    let i = 0;
    const worker = async () => {
      while (i < queue.length) {
        const prefix = queue[i++];
        const ids = await searchPrefix(prefix, delayMs);
        ids.forEach((id) => found.add(id));
        if (ids.length >= RESULT_CAP && prefix.length < MAX_PREFIX_LEN) {
          for (const c of 'abcdefghijklmnopqrstuvwxyz') next.push(prefix + c);
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    queue = next;
  }
  return [...found];
}

const clean = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

const dash = (s: string | undefined) => {
  const v = (s ?? '').trim();
  return v && v !== '-' ? v : null;
};

function splitName(raw: string): { first: string; last: string | null; affiliate: boolean } {
  const affiliate = /^AF[FS]\s/.test(raw);
  const name = raw.replace(/^AF[FS]\s+/, '').trim();
  if (affiliate) return { first: name, last: null, affiliate };
  const parts = name.split(' ').filter(Boolean);
  if (parts.length <= 1) return { first: name, last: null, affiliate };
  const suffix = /^(jr\.?|sr\.?|ii|iii|iv)$/i;
  let lastIdx = parts.length - 1;
  if (suffix.test(parts[lastIdx]) && lastIdx > 1) lastIdx -= 1;
  return {
    first: parts[0],
    last: parts.slice(lastIdx).join(' '),
    affiliate,
  };
}

async function fetchDetail(arg: string, delayMs: number): Promise<FivePointsRecord | null> {
  const html = await request(
    {
      url: `${ENDPOINT}?APPNAME=IMS&PRGNAME=IMSListingAgentDetail&ARGUMENTS=${arg}`,
      method: 'GET',
    },
    delayMs,
  );
  const at = html.indexOf('Member Information');
  if (at < 0) return null;
  const t = clean(html.slice(at));
  const head = t.match(/Member Information\s*(.*?)\s*Office:\s*(.*?)\s+(\d.*?)\s*Phone Number:/);
  if (!head) return null;
  const phone = t.match(/Phone Number:\s*(.*?)\s*(?:Office Phone:|$)/)?.[1];
  const officePhone = t.match(/Office Phone:\s*(.*?)\s*(?:Fax:|Public Profile:|E-Mail:|$)/)?.[1];
  const email = t.match(/E-Mail:\s*(\S+@\S+)/)?.[1]?.toLowerCase() ?? null;
  const addr = head[3].trim();
  const stZip = addr.match(/,\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?\s*$/);
  const { first, last, affiliate } = splitName(head[1].trim());
  return {
    external_id: arg.split(',')[0].replace('-N', ''),
    external_source: FIVE_POINTS_SOURCE,
    first_name: first,
    last_name: last,
    full_name: head[1].trim(),
    email,
    phone: dash(phone),
    company: head[2].trim() || null,
    title: affiliate ? 'Affiliate' : 'REALTOR Member',
    address: addr || null,
    state: stZip?.[1] ?? null,
    zip: stZip?.[2] ?? null,
    office_phone: dash(officePhone),
    is_affiliate: affiliate,
  };
}

export async function scrapeFivePointsMembers(
  opts: FivePointsScrapeOptions = {},
): Promise<{ records: FivePointsRecord[]; discovered: number; failed: number }> {
  const startedAt = Date.now();
  const concurrency = opts.concurrency ?? 8;
  const delayMs = opts.delayMs ?? 120;
  const budgetMs = opts.budgetMs ?? 270_000;
  let args = await collectMemberArgs(delayMs, concurrency);
  const discovered = args.length;
  if (opts.maxRecords) args = args.slice(0, opts.maxRecords);

  const records: FivePointsRecord[] = [];
  let failed = 0;
  let i = 0;
  const worker = async () => {
    while (i < args.length && Date.now() - startedAt < budgetMs) {
      const arg = args[i++];
      const rec = await fetchDetail(arg, delayMs);
      if (rec) records.push(rec);
      else failed += 1;
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { records, discovered, failed };
}
