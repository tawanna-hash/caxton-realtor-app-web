/**
 * Gmail event scanner (Path F).
 *
 * Reads the connected mailbox for mail from advertisers and curated
 * association/board domains, asks Gemini which messages announce real events,
 * and drops each detection into the admin review queue (hidden=true) for
 * approval onto the public calendar.
 *
 * Allowed senders are the union of:
 *   - event_source_orgs (active=true) — associations and boards
 *   - advertisers.contact_email domains — anyone we already do business with
 *
 * Idempotency has three layers: messages already scanned are skipped before we
 * spend a Gemini call, the events_external_uniq constraint on
 * (external_source, external_id) catches repeated message/event pairs, and the
 * event store rejects matching normalized titles on the same Central-time
 * event date. Rejected Gmail rows remain as hidden tombstones, so deleting a
 * queue item cannot cause it to reappear during the next overlapping scan.
 *
 * Never throws for a single bad message — per-message failures increment the
 * `errors` count and the scan continues.
 */

import type { gmail_v1 } from 'googleapis';
import { getGmailClient } from './gmail-client';
import { extractEventsFromEmail, type ExtractedEmailEvent } from './gemini-email-events-extract';
import { parseEventWhen } from './event-date-parse';
import {
  createGmailDetectedEvent,
  hasScannedGmailMessage,
  type Publication,
} from './events-store';
import { query } from './db/neon';
import { logger } from './logger';

interface GmailScanCounts {
  /** Messages fetched and passed to Gemini. */
  scanned: number;
  /** Candidate events Gemini returned across all messages. */
  detected: number;
  inserted: number;
  /** Messages skipped because they were already scanned on a prior run. */
  skippedDuplicate: number;
  /** Candidates dropped because no usable date could be parsed. */
  skippedNoDate: number;
  errors: number;
}

interface GmailEventCandidate {
  messageId: string;
  emailFrom: string;
  emailSubject: string;
  publication: Publication;
  title: string;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  organizer: string | null;
  link: string | null;
  description: string | null;
  confidence: number;
}

export interface GmailScanResult extends GmailScanCounts {
  dryRun: boolean;
  lookbackDays: number;
  mailbox: string | null;
  domains: number;
  /** Populated only when dryRun — the candidates that would have been inserted. */
  candidates?: GmailEventCandidate[];
}

// Gmail caps list results per page; we only ever want a bounded slice per run
// so a backlog can't blow the cron's 300s budget.
const MAX_MESSAGES_PER_QUERY = 50;
const MAX_MESSAGES_PER_SCAN = 120;

// Gmail's `from:` accepts an OR group, so batching domains keeps the number of
// list round-trips proportional to advertiser count / DOMAINS_PER_QUERY rather
// than to advertiser count. Kept modest so the query string stays well inside
// Gmail's length limit.
const DOMAINS_PER_QUERY = 15;

// Newsletters routinely run past 100 KB of HTML; the event details are always
// near the top and the extractor truncates anyway.
const MAX_BODY_CHARS = 20_000;

// Candidates below this are almost always marketing copy that mentions a date.
// They're dropped rather than queued so the review page stays worth reading.
const MIN_CONFIDENCE = 0.35;

// ---------------------------------------------------------------------------
// Allowed senders
// ---------------------------------------------------------------------------

interface AllowedDomain {
  domain: string;
  /** Publication to fall back to when keyword detection is inconclusive. */
  defaultPublication: Publication;
}

function normalizeDomain(raw: string): string | null {
  const at = raw.lastIndexOf('@');
  const host = (at >= 0 ? raw.slice(at + 1) : raw).trim().toLowerCase();
  // Reject anything that isn't plausibly a hostname — a malformed
  // contact_email must never widen the Gmail query.
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null;
  return host;
}

async function loadAllowedDomains(): Promise<AllowedDomain[]> {
  const orgs = await query<{ domain: string; default_publication: string }>(
    `SELECT domain, default_publication FROM event_source_orgs WHERE active = true`,
  );
  const advertisers = await query<{ contact_email: string }>(
    `SELECT contact_email FROM advertisers
      WHERE contact_email IS NOT NULL AND TRIM(contact_email) <> ''`,
  );

  const byDomain = new Map<string, AllowedDomain>();
  // Advertisers first so a curated org row wins on conflict — the org row is
  // the one an admin can steer via default_publication.
  for (const a of advertisers) {
    const domain = normalizeDomain(a.contact_email);
    if (!domain) continue;
    byDomain.set(domain, { domain, defaultPublication: 'austin' });
  }
  for (const o of orgs) {
    const domain = normalizeDomain(o.domain);
    if (!domain) continue;
    byDomain.set(domain, {
      domain,
      defaultPublication: o.default_publication === 'san_antonio' ? 'san_antonio' : 'austin',
    });
  }
  return [...byDomain.values()];
}

// ---------------------------------------------------------------------------
// Publication auto-detect
// ---------------------------------------------------------------------------

// Word-boundary matched so "SA" doesn't fire on "Salado" and "ATX" doesn't
// fire inside a URL slug.
const AUSTIN_PATTERN = buildKeywordPattern([
  'Austin', 'ATX', 'Cedar Park', 'Round Rock', 'Bastrop', 'Georgetown',
  'Pflugerville', 'Leander', 'ABoR', 'Five Points', 'WCR Austin', 'NAHREP Austin',
]);
const SAN_ANTONIO_PATTERN = buildKeywordPattern([
  'San Antonio', 'SA', 'Bexar', 'Boerne', 'New Braunfels', 'SABOR', 'Newsline',
]);

function buildKeywordPattern(keywords: readonly string[]): RegExp {
  const alternation = keywords
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'))
    .join('|');
  return new RegExp(`(?<![A-Za-z])(?:${alternation})(?![A-Za-z])`, 'i');
}

/**
 * Route a detection to RealtyLine (Austin) or Newsline (San Antonio) from the
 * event text, falling back to the sending org's configured market.
 *
 * San Antonio is checked first: Austin terms leak into statewide and national
 * mail far more often than San Antonio terms do, so an email mentioning both
 * ("Texas REALTORS, San Antonio chapter") is almost always the SA event.
 */
function detectPublication(
  parts: ReadonlyArray<string | null>,
  fallback: Publication,
): Publication {
  const haystack = parts.filter(Boolean).join(' \n ');
  if (SAN_ANTONIO_PATTERN.test(haystack)) return 'san_antonio';
  if (AUSTIN_PATTERN.test(haystack)) return 'austin';
  return fallback;
}

// ---------------------------------------------------------------------------
// Best-effort date parsing
// ---------------------------------------------------------------------------



// ---------------------------------------------------------------------------
// Gmail message parsing
// ---------------------------------------------------------------------------

function headerValue(message: gmail_v1.Schema$Message, name: string): string {
  const headers = message.payload?.headers ?? [];
  const found = headers.find((h) => (h.name ?? '').toLowerCase() === name.toLowerCase());
  return found?.value ?? '';
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf-8');
}

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Best available text for the model: prefer text/plain, fall back to stripped
 * text/html. Walks the full MIME tree because multipart/alternative nests
 * arbitrarily deep once forwarding and marketing tools get involved.
 */
export function extractMessageBody(message: gmail_v1.Schema$Message): string {
  const plain: string[] = [];
  const html: string[] = [];

  const walk = (part: gmail_v1.Schema$MessagePart | undefined) => {
    if (!part) return;
    const mime = (part.mimeType ?? '').toLowerCase();
    const data = part.body?.data;
    if (data) {
      if (mime === 'text/plain') plain.push(decodeBase64Url(data));
      else if (mime === 'text/html') html.push(decodeBase64Url(data));
    }
    for (const child of part.parts ?? []) walk(child);
  };
  walk(message.payload);

  const body = plain.length > 0 ? plain.join('\n') : stripHtml(html.join('\n'));
  return body.replace(/\r\n/g, '\n').slice(0, MAX_BODY_CHARS);
}

function gmailDateQuery(lookbackDays: number): string {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  return `${since.getUTCFullYear()}/${since.getUTCMonth() + 1}/${since.getUTCDate()}`;
}

async function listMessageIds(
  gmail: gmail_v1.Gmail,
  domains: readonly string[],
  lookbackDays: number,
): Promise<string[]> {
  const fromGroup = domains.map((d) => `from:@${d}`).join(' OR ');
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: `(${fromGroup}) after:${gmailDateQuery(lookbackDays)}`,
    maxResults: MAX_MESSAGES_PER_QUERY,
  });
  return (res.data.messages ?? [])
    .map((m) => m.id)
    .filter((id): id is string => typeof id === 'string');
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Which allowed domain sent this? The From header is `Name <user@host>`, and
 * an unmatched sender means Gmail's OR query was broader than our allowlist
 * (subdomains, display-name coincidences) — those messages are dropped.
 */
function matchDomain(
  from: string,
  domains: ReadonlyMap<string, AllowedDomain>,
): AllowedDomain | null {
  const m = /<([^>]+)>/.exec(from);
  const address = (m ? m[1] : from).trim().toLowerCase();
  const host = normalizeDomain(address);
  if (!host) return null;
  const exact = domains.get(host);
  if (exact) return exact;
  // `mail.abor.com` should still count as ABoR.
  for (const [domain, entry] of domains) {
    if (host.endsWith(`.${domain}`)) return entry;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

function buildDescription(event: ExtractedEmailEvent, datedOk: boolean): string | null {
  const lines: string[] = [];
  if (event.notes) lines.push(event.notes);
  // Preserve the raw when-text whenever we couldn't turn it into a timestamp,
  // so the admin editing the row still knows what the email actually said.
  if (!datedOk && (event.date || event.time)) {
    lines.push(`Date/time as written: ${[event.date, event.time].filter(Boolean).join(' ')}`);
  }
  return lines.length > 0 ? lines.join('\n\n') : null;
}

export async function scanGmailForEvents({
  lookbackDays = 7,
  dryRun = false,
}: { lookbackDays?: number; dryRun?: boolean } = {}): Promise<GmailScanResult> {
  const counts: GmailScanCounts = {
    scanned: 0,
    detected: 0,
    inserted: 0,
    skippedDuplicate: 0,
    skippedNoDate: 0,
    errors: 0,
  };

  const client = await getGmailClient();
  if (!client) {
    return { ...counts, dryRun, lookbackDays, mailbox: null, domains: 0, ...(dryRun ? { candidates: [] } : {}) };
  }
  const { gmail, emailAddress } = client;

  const allowed = await loadAllowedDomains();
  const domainMap = new Map(allowed.map((d) => [d.domain, d]));
  if (allowed.length === 0) {
    return { ...counts, dryRun, lookbackDays, mailbox: emailAddress, domains: 0, ...(dryRun ? { candidates: [] } : {}) };
  }

  // Collect ids first so the per-scan cap applies across all sender groups.
  const messageIds = new Set<string>();
  for (const group of chunk(allowed.map((d) => d.domain), DOMAINS_PER_QUERY)) {
    if (messageIds.size >= MAX_MESSAGES_PER_SCAN) break;
    try {
      for (const id of await listMessageIds(gmail, group, lookbackDays)) {
        messageIds.add(id);
      }
    } catch (err) {
      counts.errors += 1;
      logger.warn(
        { group, err: err instanceof Error ? err.message : String(err) },
        '[gmail-scanner] messages.list failed',
      );
    }
  }

  const candidates: GmailEventCandidate[] = [];

  for (const messageId of [...messageIds].slice(0, MAX_MESSAGES_PER_SCAN)) {
    try {
      // Pre-check before spending a Gemini call — cron windows overlap by
      // design, so most messages on any given run are already processed.
      if (await hasScannedGmailMessage(messageId)) {
        counts.skippedDuplicate += 1;
        continue;
      }

      const res = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
      const message = res.data;
      const from = headerValue(message, 'From');
      const org = matchDomain(from, domainMap);
      if (!org) continue;

      const subject = headerValue(message, 'Subject') || '(no subject)';
      const receivedAt = message.internalDate
        ? new Date(parseInt(message.internalDate, 10))
        : null;
      const body = extractMessageBody(message);
      if (!body.trim()) continue;

      counts.scanned += 1;

      const extracted = await extractEventsFromEmail({
        subject,
        from,
        receivedAt: receivedAt ? receivedAt.toISOString() : null,
        body,
      });
      if (!extracted.ok) {
        counts.errors += 1;
        logger.warn(
          { messageId, reason: extracted.reason, detail: extracted.detail },
          '[gmail-scanner] extraction failed',
        );
        continue;
      }
      if (!extracted.isEvent) continue;

      let eventIndex = 0;
      for (const event of extracted.events) {
        counts.detected += 1;
        if (event.confidence < MIN_CONFIDENCE) continue;

        const { startDate, endDate } = parseEventWhen(event.date, event.time, receivedAt);
        if (!startDate) counts.skippedNoDate += 1;

        const publication = detectPublication(
          [event.name, event.location, event.host, event.notes, subject],
          org.defaultPublication,
        );

        const candidate: GmailEventCandidate = {
          messageId,
          emailFrom: from,
          emailSubject: subject,
          publication,
          title: event.name,
          startDate,
          endDate,
          location: event.location,
          organizer: event.host,
          link: event.rsvpUrl,
          description: buildDescription(event, Boolean(startDate)),
          confidence: event.confidence,
        };
        candidates.push(candidate);

        if (dryRun) {
          eventIndex += 1;
          continue;
        }

        const created = await createGmailDetectedEvent({
          publication,
          messageId,
          eventIndex,
          title: candidate.title,
          description: candidate.description,
          startDate,
          endDate,
          location: candidate.location,
          link: candidate.link,
          organizer: candidate.organizer,
          emailFrom: from,
          confidence: event.confidence,
        });
        eventIndex += 1;
        if (created) counts.inserted += 1;
        else counts.skippedDuplicate += 1;
      }
    } catch (err) {
      counts.errors += 1;
      logger.warn(
        { messageId, err: err instanceof Error ? err.message : String(err) },
        '[gmail-scanner] message failed',
      );
    }
  }

  return {
    ...counts,
    dryRun,
    lookbackDays,
    mailbox: emailAddress,
    domains: allowed.length,
    ...(dryRun ? { candidates } : {}),
  };
}
