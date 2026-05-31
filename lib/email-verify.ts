// lib/email-verify.ts
//
// Solid, free, production-grade email verifier. Zero third-party APIs.
//
// Pipeline (cheap → expensive). Each layer can short-circuit the rest:
//
//   1.  Syntax            — strict RFC-5321 length checks + permissive regex
//   2.  Domain shape      — top-level domain present, no trailing dot, etc.
//   3.  Typo suggestion   — Levenshtein-1 distance against popular domains
//                            (gmial.com → gmail.com). Informational only.
//   4.  Disposable check  — bundled list of throwaway providers (mailinator,
//                            10minutemail, tempr.email, …). Marks Invalid.
//   5.  Role-account flag — info@, admin@, postmaster@, … Informational.
//   6.  Free-provider     — gmail.com, outlook.com, yahoo.com, … Big mailbox
//                            providers reject random-IP SMTP probes to
//                            prevent enumeration. We accept the domain at
//                            face value (Pending, low risk) and don't waste
//                            an SMTP round-trip.
//   7.  MX resolution     — DNS resolveMx() with retry across all MXes.
//   8.  SMTP probe        — connect to each MX in priority order:
//                            HELO/EHLO, MAIL FROM, RCPT TO <addr>, then
//                            RCPT TO <random@domain> to detect catch-all.
//
// Verdicts:
//   'Valid'   — SMTP server accepted RCPT TO with 250/251/252
//                (and the catch-all probe did NOT also accept)
//   'Invalid' — syntax bad, disposable, no MX, or 5xx mailbox reject
//   'Pending' — soft failure (greylist 4xx, timeout, catch-all detected,
//                free-provider skipped) — caller can retry later
//
// We never throw. Every failure mode maps to a verdict + structured
// `signals` object so the UI can show *why*.

import { promises as dns } from 'node:dns';
import net from 'node:net';
import crypto from 'node:crypto';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export type EmailVerdict = 'Valid' | 'Invalid' | 'Pending';

export interface EmailVerifySignals {
  syntaxOk:       boolean;
  disposable:     boolean;
  roleAccount:    boolean;
  freeProvider:   boolean;
  hasMx:          boolean;
  smtpConnected:  boolean;
  mailboxExists:  boolean | null;   // null = unknown (probe didn't run)
  catchAll:       boolean | null;   // null = unknown
  /** True if at least one MX probe hit the hard timeout / socket idle. */
  smtpTimedOut:   boolean;
  /** Number of MX hosts we attempted to probe (0 if skipped). */
  mxAttempts:     number;
  /**
   * If the MX matched a known managed-mail provider (Microsoft 365 EOP /
   * Google Workspace / Proofpoint) we short-circuit to Pending. Null means
   * either probe never ran or the MX didn't match a managed provider.
   */
  managedMailProvider: 'microsoft365-eop' | 'google-workspace' | 'proofpoint' | null;
}

export interface EmailVerifyResult {
  /** Final verdict. */
  verdict:     EmailVerdict;
  /** Human-readable explanation. Always populated. */
  detail:      string;
  /** Best MX host we hit (or last one tried). */
  mx?:         string;
  /** Last SMTP response code we observed. */
  code?:       number;
  /** Risk score 0 (clean) → 100 (very risky). Useful for sorting. */
  risk:        number;
  /** Structured signals — surface in the UI for the user. */
  signals:     EmailVerifySignals;
  /** Suggested correction for likely typos (gmial.com → gmail.com). */
  suggestion?: string;
  /** Normalized address (lowercased domain). */
  normalized?: string;
}

export interface VerifyOpts {
  /**
   * Hard timeout for the whole SMTP probe per MX (ms). Default 15000.
   * Real-estate brokerage domains often sit on slow Microsoft 365 / GoDaddy /
   * regional ISP mail relays that take 8-12s just to finish the EHLO+TLS
   * handshake from a cold IP, so the original 8s budget gave too many
   * false-Pendings. 15s is generous enough for slow MXes but still bounded.
   */
  timeoutMs?:   number;
  /**
   * Per-MX TCP connect timeout (ms). Default 6000. If the initial socket
   * can't even reach SYN-ACK in this window we cut our losses and move to
   * the next MX instead of burning the whole `timeoutMs` budget on a dead
   * host. Must be less than `timeoutMs`.
   */
  connectTimeoutMs?: number;
  /** MAIL FROM envelope. Default uses EMAIL_VERIFY_SENDER. */
  fromAddress?: string;
  /** HELO/EHLO host. Default uses EMAIL_VERIFY_HELO_HOST. */
  heloHost?:    string;
  /** Skip catch-all probe (saves one RCPT). Default false. */
  skipCatchAll?: boolean;
  /** Skip SMTP entirely (syntax + MX only). Default false. */
  skipSmtp?:    boolean;
}

// ─────────────────────────────────────────────────────────────────
// Static reference lists (bundled, no API, no fees)
// ─────────────────────────────────────────────────────────────────

// Common throwaway providers. Not exhaustive but covers the loud 95%.
// Sources: stop-forum-spam, disposable-email-domains GitHub lists,
// manually trimmed.
const DISPOSABLE_DOMAINS = new Set<string>([
  '10minutemail.com', '10minutemail.net', '20minutemail.com',
  'anonbox.net', 'anonymbox.com', 'asdasd.ru',
  'binkmail.com', 'bobmail.info', 'bsnow.net', 'bspamfree.org',
  'crazymailing.com', 'cuvox.de',
  'deadaddress.com', 'discard.email', 'disposable.email', 'disposablemail.com',
  'dispostable.com', 'dropmail.me', 'dudmail.com',
  'easytrashmail.com', 'einrot.com', 'emailondeck.com', 'emailtemporario.com.br',
  'fakeinbox.com', 'fakemailgenerator.com', 'fastmail.fm',
  'gawab.com', 'getairmail.com', 'getnada.com', 'guerrillamail.com',
  'guerrillamail.de', 'guerrillamail.info', 'guerrillamail.net', 'guerrillamail.org',
  'guerrillamailblock.com', 'gustr.com',
  'harakirimail.com',
  'inboxalias.com', 'inboxbear.com', 'incognitomail.com',
  'jourrapide.com',
  'maildrop.cc', 'mailexpire.com', 'mailforspam.com', 'mailinator.com',
  'mailnesia.com', 'mailnull.com', 'mailtemp.info', 'mailtothis.com',
  'mintemail.com', 'mohmal.com', 'moncourrier.fr.nf', 'monemail.fr.nf',
  'mvrht.com', 'mytemp.email', 'mytrashmail.com',
  'nada.email', 'no-spam.ws', 'nomail.xl.cx', 'nospam.ze.tc',
  'objectmail.com', 'oneoffemail.com', 'opayq.com',
  'pokemail.net', 'privatemail.com', 'punkass.com',
  'rcpt.at', 'rhyta.com',
  'safetymail.info', 'safetypost.de', 'sharklasers.com', 'shitmail.me',
  'sinnlos-mail.de', 'slopsbox.com', 'spam4.me', 'spambog.com', 'spambog.de',
  'spambog.ru', 'spambox.us', 'spamcero.com', 'spamevader.com', 'spamex.com',
  'spamfree24.com', 'spamfree24.de', 'spamfree24.eu', 'spamfree24.info',
  'spamfree24.net', 'spamfree24.org', 'spamgourmet.com', 'spamhereplease.com',
  'spaml.com', 'spaml.de', 'spammotel.com', 'spamspot.com', 'spamthis.co.uk',
  'speed.1s.fr', 'superrito.com',
  'teleworm.com', 'teleworm.us', 'tempemail.biz', 'tempemail.com', 'tempemail.net',
  'tempinbox.com', 'tempmail.eu', 'tempmail.it', 'tempmail.us', 'tempmailaddress.com',
  'tempmailer.com', 'tempmailer.de', 'temp-mail.org', 'temp-mail.ru',
  'tempr.email', 'thankyou2010.com', 'thismail.net', 'throam.com',
  'thrott.com', 'throwam.com', 'throwawayemail.com', 'throwawaymail.com',
  'tmail.ws', 'tmpeml.info', 'trashmail.at', 'trashmail.com', 'trashmail.de',
  'trashmail.me', 'trashmail.net', 'trashmail.org', 'trashmail.ws',
  'trbvm.com', 'trillianpro.com',
  'urhen.com',
  'wegwerfmail.de', 'wegwerfmail.info', 'wegwerfmail.net', 'wegwerfmail.org',
  'wh4f.org', 'wuzup.net',
  'yopmail.com', 'yopmail.fr', 'yopmail.net',
  'zehnminutenmail.de', 'zoemail.org',
]);

// Common role-based local parts. Informational only — doesn't make an
// address invalid, but B2B lists usually want to exclude them.
const ROLE_LOCAL_PARTS = new Set<string>([
  'abuse', 'admin', 'administrator', 'all', 'billing', 'cf', 'compliance',
  'contact', 'enquiries', 'enquiry', 'feedback', 'help', 'hello', 'helpdesk',
  'hostmaster', 'info', 'inquiries', 'inquiry', 'jobs', 'legal', 'mail',
  'mailer-daemon', 'marketing', 'media', 'newsletter', 'no-reply', 'noc',
  'noreply', 'office', 'orders', 'postmaster', 'press', 'privacy', 'root',
  'sales', 'security', 'service', 'spam', 'staff', 'support', 'sysadmin',
  'team', 'tech', 'usenet', 'uucp', 'webmaster', 'welcome', 'www',
]);

// Major free-mail providers. These reject random-IP SMTP probes by
// design to prevent enumeration, so we don't bother probing them — we
// trust the MX and return Pending with a clear reason.
const FREE_PROVIDERS = new Set<string>([
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.uk', 'yahoo.co.jp', 'yahoo.fr', 'yahoo.de',
  'yahoo.it', 'yahoo.es', 'yahoo.ca', 'yahoo.com.au', 'ymail.com', 'rocketmail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'outlook.co.uk',
  'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.it', 'hotmail.es',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'aim.com',
  'protonmail.com', 'proton.me', 'pm.me',
  'gmx.com', 'gmx.us', 'gmx.de', 'gmx.net', 'gmx.at', 'gmx.ch',
  'mail.com', 'email.com',
  'zoho.com', 'zohomail.com',
  'yandex.com', 'yandex.ru',
  'fastmail.com', 'fastmail.fm',
  'tutanota.com', 'tutanota.de', 'tuta.io',
]);

// ────────────────────────────────────────────────────────────────────
// Managed-mail MX patterns.
//
// Microsoft 365 EOP, Google Workspace, and Proofpoint all aggressively
// block SMTP RCPT-TO probes originating from public cloud datacenter
// IP ranges (AWS, Vercel, GCP, Azure). The TCP handshake either:
//   • silently drops at SYN (timeout), or
//   • completes but the 220 banner is delayed past our hard deadline,
//     or
//   • we get a 421/451 "deferred" code regardless of mailbox validity.
//
// In every case we CANNOT prove mailbox-existence from a Vercel function,
// but the address is almost certainly valid — these are corporate mail
// hosts, not free-mail. So we treat them exactly like the free-provider
// short-circuit: trust the MX, return Pending with a diagnostic reason,
// and let the user manually confirm.
//
// Patterns are matched (case-insensitive) against the MX exchange host.
// ────────────────────────────────────────────────────────────────────
export interface ManagedMailProvider {
  /** Internal id used in detail messages and badges. */
  id:       'microsoft365-eop' | 'google-workspace' | 'proofpoint';
  /** Human-readable label. */
  label:    string;
  /** MX-host regexes; any match flips the short-circuit. */
  patterns: RegExp[];
}

const MANAGED_MAIL_PROVIDERS: ManagedMailProvider[] = [
  {
    id:       'microsoft365-eop',
    label:    'Microsoft 365 (Exchange Online Protection)',
    patterns: [
      /\.mail\.protection\.outlook\.com\.?$/i,
      /\.olc\.protection\.outlook\.com\.?$/i,
      /\.mail\.eo\.outlook\.com\.?$/i,
    ],
  },
  {
    id:       'google-workspace',
    label:    'Google Workspace',
    patterns: [
      /\.aspmx\.l\.google\.com\.?$/i,
      /^aspmx\d*\.googlemail\.com\.?$/i,
      /^alt\d+\.aspmx\.l\.google\.com\.?$/i,
      /^gmail-smtp-in\.l\.google\.com\.?$/i,
    ],
  },
  {
    id:       'proofpoint',
    label:    'Proofpoint',
    patterns: [
      /\.pphosted\.com\.?$/i,
      /\.ppe-hosted\.com\.?$/i,
    ],
  },
];

/**
 * Classify a list of MX hosts against the managed-mail patterns above.
 * Returns the first matching provider, or null if none match. Exported
 * for reuse in audit / reclassification routes.
 */
export function classifyManagedMail(
  mxHosts: ReadonlyArray<{ exchange: string } | string>,
): ManagedMailProvider | null {
  const hosts = mxHosts.map(h => (typeof h === 'string' ? h : h.exchange).toLowerCase());
  for (const provider of MANAGED_MAIL_PROVIDERS) {
    if (hosts.some(h => provider.patterns.some(rx => rx.test(h)))) {
      return provider;
    }
  }
  return null;
}

// Popular domains we'll suggest corrections toward (Levenshtein-1).
const POPULAR_DOMAINS = [
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com',
  'aol.com', 'msn.com', 'live.com', 'me.com', 'mac.com',
  'comcast.net', 'sbcglobal.net', 'att.net', 'verizon.net', 'cox.net',
  'protonmail.com', 'mail.com', 'gmx.com', 'zoho.com',
];

// ─────────────────────────────────────────────────────────────────
// Tiny helpers
// ─────────────────────────────────────────────────────────────────

// Permissive but stricter than `\S+@\S+`. Disallows leading/trailing dot,
// consecutive dots, requires a 2+ char TLD.
const EMAIL_RE =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

function fromAddr(opts: VerifyOpts): string {
  return opts.fromAddress
    ?? process.env.EMAIL_VERIFY_SENDER
    ?? 'postmaster@realtynewsnow.app';
}

function heloHost(opts: VerifyOpts): string {
  return opts.heloHost
    ?? process.env.EMAIL_VERIFY_HELO_HOST
    ?? 'realtynewsnow.app';
}

/** Damerau-Levenshtein distance, capped at `max` for speed. */
function dlDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const la = a.length, lb = b.length;
  // Two-row DP
  let prev = Array.from({ length: lb + 1 }, (_, i) => i);
  let cur  = new Array<number>(lb + 1);
  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= lb; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(
        cur[j - 1] + 1,        // insert
        prev[j] + 1,           // delete
        prev[j - 1] + cost,    // replace
      );
      if (
        i > 1 && j > 1 &&
        a.charCodeAt(i - 1) === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
      ) {
        cur[j] = Math.min(cur[j], prev[j - 1] - 1 + 1); // transposition
      }
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    [prev, cur] = [cur, prev];
  }
  return prev[lb];
}

function suggestDomain(domain: string): string | undefined {
  if (POPULAR_DOMAINS.includes(domain)) return undefined;
  let best: string | undefined;
  let bestD = 99;
  for (const cand of POPULAR_DOMAINS) {
    const d = dlDistance(domain, cand, 2);
    if (d < bestD && d > 0 && d <= 2) {
      bestD = d;
      best = cand;
    }
  }
  return best;
}

function blankSignals(): EmailVerifySignals {
  return {
    syntaxOk:       false,
    disposable:     false,
    roleAccount:    false,
    freeProvider:   false,
    hasMx:          false,
    smtpConnected:  false,
    mailboxExists:  null,
    catchAll:       null,
    smtpTimedOut:        false,
    mxAttempts:          0,
    managedMailProvider: null,
  };
}

function computeRisk(s: EmailVerifySignals): number {
  if (!s.syntaxOk) return 100;
  if (s.disposable) return 95;
  if (!s.hasMx) return 90;
  if (s.mailboxExists === false) return 95;
  if (s.catchAll === true) return 60;
  let r = 0;
  if (s.roleAccount) r += 20;
  if (s.freeProvider && s.mailboxExists === null) r += 25;
  if (!s.smtpConnected) r += 30;
  // Persistent SMTP timeout on every MX is a real signal — either the
  // mail server is overloaded / firewalling us, or the domain is no
  // longer actively accepting mail. Either way, bump risk.
  if (s.smtpTimedOut && !s.smtpConnected) r += 15;
  if (s.mailboxExists === true) r = Math.max(0, r - 20);
  return Math.min(100, Math.max(0, r));
}

// ─────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────

/**
 * Verify a single email address. Never throws — returns a structured
 * result with a verdict, detail, risk score, and full signals object.
 */
export async function verifyEmail(
  email: string,
  opts: VerifyOpts = {},
): Promise<EmailVerifyResult> {
  const signals = blankSignals();
  const raw = (email ?? '').trim();

  // ---- 1. Syntax + length ----
  if (!raw) {
    return { verdict: 'Invalid', detail: 'Empty address.', risk: 100, signals };
  }
  if (raw.length > 254) {
    return { verdict: 'Invalid', detail: 'Address exceeds 254 chars (RFC 5321).', risk: 100, signals };
  }
  const at = raw.lastIndexOf('@');
  if (at < 1 || at === raw.length - 1) {
    return { verdict: 'Invalid', detail: 'Missing local-part or domain.', risk: 100, signals };
  }
  const local  = raw.slice(0, at);
  const domain = raw.slice(at + 1).toLowerCase();
  if (local.length > 64) {
    return { verdict: 'Invalid', detail: 'Local-part exceeds 64 chars (RFC 5321).', risk: 100, signals };
  }
  const normalized = `${local}@${domain}`;
  if (!EMAIL_RE.test(normalized)) {
    return { verdict: 'Invalid', detail: 'Syntax check failed.', risk: 100, signals, normalized };
  }
  signals.syntaxOk = true;

  // ---- 2. Cheap static checks ----
  signals.disposable   = DISPOSABLE_DOMAINS.has(domain);
  signals.roleAccount  = ROLE_LOCAL_PARTS.has(local.toLowerCase());
  signals.freeProvider = FREE_PROVIDERS.has(domain);
  const suggestion     = suggestDomain(domain);

  if (signals.disposable) {
    return {
      verdict:    'Invalid',
      detail:     `${domain} is a disposable / throwaway provider.`,
      risk:       computeRisk(signals),
      signals,
      suggestion,
      normalized,
    };
  }

  // ---- 3. MX lookup ----
  let mxRecords: { exchange: string; priority: number }[] = [];
  try {
    mxRecords = await dns.resolveMx(domain);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code ?? '';
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      return {
        verdict:    'Invalid',
        detail:     `No MX records for ${domain}.`,
        risk:       computeRisk(signals),
        signals,
        suggestion,
        normalized,
      };
    }
    return {
      verdict:    'Pending',
      detail:     `DNS lookup failed: ${code}.`,
      risk:       computeRisk(signals),
      signals,
      suggestion,
      normalized,
    };
  }
  if (!mxRecords || mxRecords.length === 0) {
    // Fallback: per RFC 5321 §5.1, a host with an A record but no MX
    // implicitly accepts mail. We treat this as "Pending — no MX".
    return {
      verdict:    'Invalid',
      detail:     `No MX records for ${domain}.`,
      risk:       computeRisk(signals),
      signals,
      suggestion,
      normalized,
    };
  }
  signals.hasMx = true;
  mxRecords.sort((a, b) => a.priority - b.priority);

  // ---- 4. Free-provider short-circuit ----
  // Gmail/Outlook/Yahoo etc. reject SMTP probes from random IPs to
  // prevent enumeration. The address looks well-formed, the domain
  // resolves, and the MX is healthy — but we cannot prove the mailbox
  // exists from here. Surface as Pending so the user can decide.
  if (signals.freeProvider) {
    return {
      verdict:    'Pending',
      detail:     `${domain} blocks SMTP verification (free-mail provider). Address looks well-formed.`,
      risk:       computeRisk(signals),
      mx:         mxRecords[0].exchange,
      signals,
      suggestion,
      normalized,
    };
  }

  // ---- 4b. Managed-mail short-circuit (M365 EOP / Google Workspace / Proofpoint) ----
  // Same rationale as free-mail: these providers silently drop or 421
  // SMTP probes from cloud-egress IPs. The MX is healthy and almost
  // certainly delivers mail; we just can't prove the mailbox from a
  // serverless function. Return Pending with a diagnostic detail naming
  // the provider so the user knows it needs manual confirmation.
  const managed = classifyManagedMail(mxRecords);
  if (managed) {
    signals.managedMailProvider = managed.id;
    return {
      verdict:    'Pending',
      detail:     `${managed.label} blocks SMTP verification from cloud IPs. Address looks well-formed; manual confirmation recommended.`,
      risk:       computeRisk(signals),
      mx:         mxRecords[0].exchange,
      signals,
      suggestion,
      normalized,
    };
  }

  // ---- 5. Caller asked to skip SMTP ----
  if (opts.skipSmtp) {
    return {
      verdict:    'Pending',
      detail:     'SMTP probe skipped.',
      risk:       computeRisk(signals),
      mx:         mxRecords[0].exchange,
      signals,
      suggestion,
      normalized,
    };
  }

  // ---- 6. SMTP probe across MXes (try next on conn-level failure) ----
  let lastResult: EmailVerifyResult | null = null;
  for (const mx of mxRecords) {
    signals.mxAttempts += 1;
    const r = await smtpProbe(normalized, domain, mx.exchange, opts, signals);
    lastResult = r;
    // If we got a definitive Valid/Invalid OR an SMTP-level Pending
    // (mailbox-related, meaning we at least connected), stop trying.
    if (r.verdict !== 'Pending' || signals.smtpConnected) break;
  }

  // ---- 7. Definitive fallback when EVERY MX timed out / refused ----
  // If we never got a 220 banner from any MX *and* every attempt hit a
  // timeout, the domain's mail infrastructure is effectively dead from
  // our vantage point. Three+ MX timeouts is no longer a "maybe try
  // again later" — it's an Invalid verdict so the user can prune the
  // address without it sitting in Pending forever.
  if (
    lastResult &&
    !signals.smtpConnected &&
    signals.smtpTimedOut &&
    signals.mxAttempts >= 1
  ) {
    return {
      verdict:    'Invalid',
      detail:
        signals.mxAttempts === 1
          ? `Mail server unreachable — ${lastResult.mx ?? mxRecords[0].exchange} did not respond within ${(opts.timeoutMs ?? 15000) / 1000}s.`
          : `Mail server unresponsive — all ${signals.mxAttempts} MX hosts timed out within ${(opts.timeoutMs ?? 15000) / 1000}s each.`,
      risk:       computeRisk(signals),
      mx:         lastResult.mx,
      code:       lastResult.code,
      signals,
      suggestion,
      normalized,
    };
  }

  const final = lastResult ?? {
    verdict:    'Pending' as const,
    detail:     'No MX could be probed.',
    risk:       computeRisk(signals),
    signals,
    suggestion,
    normalized,
  };
  return { ...final, suggestion, normalized, risk: computeRisk(signals) };
}

// ─────────────────────────────────────────────────────────────────
// SMTP probe (one MX)
// ─────────────────────────────────────────────────────────────────

function smtpProbe(
  rcpt:    string,
  domain:  string,
  mxHost:  string,
  opts:    VerifyOpts,
  signals: EmailVerifySignals,
): Promise<EmailVerifyResult> {
  const timeoutMs = opts.timeoutMs ?? 15000;
  // Connect phase gets its own (shorter) budget so a single dead MX can't
  // burn 15s. Capped at timeoutMs - 2s to leave room for the protocol
  // dance even if the user passes a tiny custom timeout.
  const connectTimeoutMs = Math.min(
    opts.connectTimeoutMs ?? 6000,
    Math.max(2000, timeoutMs - 2000),
  );
  const from = fromAddr(opts);
  const helo = heloHost(opts);
  const skipCatchAll = !!opts.skipCatchAll;

  // Random non-existent mailbox at the same domain for the catch-all probe.
  // 16 random hex chars + 'noexist' guarantees uniqueness in practice.
  const catchAllRcpt =
    `noexist-${crypto.randomBytes(8).toString('hex')}@${domain}`;

  return new Promise<EmailVerifyResult>((resolve) => {
    let settled = false;
    let lastCode: number | undefined;
    let mailboxAccepted = false;

    const finish = (r: Omit<EmailVerifyResult, 'risk' | 'signals'>) => {
      if (settled) return;
      settled = true;
      try { socket.end('QUIT\r\n'); } catch { /* ignore */ }
      try { socket.destroy(); } catch { /* ignore */ }
      clearTimeout(deadline);
      clearTimeout(connectDeadline);
      resolve({
        ...r,
        mx:      mxHost,
        signals,
        risk:    computeRisk(signals),
      });
    };

    const socket = net.createConnection({ host: mxHost, port: 25 });
    socket.setEncoding('utf8');
    // Use timeoutMs as the post-connect idle timeout; the connect phase
    // gets its own faster guard below.
    socket.setTimeout(timeoutMs);

    // Hard overall deadline — nothing should run longer than timeoutMs.
    const deadline = setTimeout(() => {
      signals.smtpTimedOut = true;
      finish({ verdict: 'Pending', detail: `SMTP probe timed out after ${timeoutMs}ms.`, code: lastCode });
    }, timeoutMs);

    // Faster connect-phase deadline: if we can't even reach SYN-ACK on
    // this MX in connectTimeoutMs, bail so the caller can try the next.
    const connectDeadline = setTimeout(() => {
      if (signals.smtpConnected) return; // already past banner; ignore
      signals.smtpTimedOut = true;
      finish({
        verdict: 'Pending',
        detail:  `MX ${mxHost} did not connect within ${connectTimeoutMs}ms.`,
        code:    lastCode,
      });
    }, connectTimeoutMs);
    socket.once('connect', () => {
      clearTimeout(connectDeadline);
    });

    socket.on('error', (err: NodeJS.ErrnoException) => {
      // Connection refused / no route / DNS fail at host level — try
      // next MX. We return Pending; the caller decides whether to
      // escalate to Invalid based on whether ANY MX worked.
      clearTimeout(connectDeadline);
      finish({
        verdict: 'Pending',
        detail:  `SMTP connect error (${err.code ?? 'ERR'}): ${err.message}`,
        code:    lastCode,
      });
    });
    socket.on('timeout', () => {
      signals.smtpTimedOut = true;
      finish({ verdict: 'Pending', detail: `SMTP socket idle ${timeoutMs}ms.`, code: lastCode });
    });

    // ─── State machine ───
    // 0 banner → 1 EHLO → 2 MAIL FROM → 3 RCPT TO (real) →
    // 4 RCPT TO (catch-all probe) → done
    let step = 0;
    let buf  = '';
    let triedHelo = false;

    const send = (line: string) => {
      try { socket.write(`${line}\r\n`); } catch { /* socket dying */ }
    };

    socket.on('data', (chunk: string) => {
      buf += chunk;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line) continue;
        const m = line.match(/^(\d{3})([- ])/);
        if (!m) continue;
        const code  = Number(m[1]);
        const final = m[2] === ' ';
        if (!final) continue;
        lastCode = code;

        switch (step) {
          case 0: // banner
            if (code === 220) {
              signals.smtpConnected = true;
              send(`EHLO ${helo}`);
              step = 1;
            } else if (code === 421 || code === 451) {
              finish({ verdict: 'Pending', detail: `Server temporarily unavailable (${code}).`, code });
            } else {
              finish({ verdict: 'Pending', detail: `SMTP banner ${code}.`, code });
            }
            break;
          case 1: // EHLO / HELO response
            if (code >= 200 && code < 300) {
              send(`MAIL FROM:<${from}>`);
              step = 2;
            } else if (!triedHelo && code >= 500) {
              triedHelo = true;
              send(`HELO ${helo}`);
              // stay on step 1
            } else if (code === 421 || code === 450 || code === 451 || code === 452) {
              finish({ verdict: 'Pending', detail: `HELO greylisted (${code}).`, code });
            } else {
              finish({ verdict: 'Pending', detail: `HELO got ${code}.`, code });
            }
            break;
          case 2: // MAIL FROM
            if (code >= 200 && code < 300) {
              send(`RCPT TO:<${rcpt}>`);
              step = 3;
            } else if (code === 421 || code === 450 || code === 451 || code === 452) {
              finish({ verdict: 'Pending', detail: `MAIL FROM greylisted (${code}).`, code });
            } else if (code >= 500) {
              // Server rejected our envelope sender — try fallback FROM
              // once with a postmaster@<helo> address. This catches
              // servers that block <> or third-party senders.
              if (from !== `postmaster@${helo}`) {
                send(`MAIL FROM:<postmaster@${helo}>`);
                // stay on step 2
              } else {
                finish({ verdict: 'Pending', detail: `MAIL FROM rejected (${code}).`, code });
              }
            } else {
              finish({ verdict: 'Pending', detail: `MAIL FROM got ${code}.`, code });
            }
            break;
          case 3: // RCPT TO (real address)
            if (code === 250 || code === 251 || code === 252) {
              mailboxAccepted = true;
              signals.mailboxExists = true;
              if (skipCatchAll) {
                signals.catchAll = null;
                finish({ verdict: 'Valid', detail: `RCPT accepted (${code}).`, code });
              } else {
                send(`RCPT TO:<${catchAllRcpt}>`);
                step = 4;
              }
            } else if (code === 550 || code === 551 || code === 553 || code === 554) {
              signals.mailboxExists = false;
              finish({ verdict: 'Invalid', detail: `Mailbox rejected (${code}).`, code });
            } else if (code === 552) {
              // Over-quota — mailbox exists but is full
              signals.mailboxExists = true;
              finish({ verdict: 'Valid', detail: `Mailbox over quota (${code}).`, code });
            } else if (code === 421 || code === 450 || code === 451 || code === 452) {
              finish({ verdict: 'Pending', detail: `RCPT greylisted (${code}).`, code });
            } else {
              finish({ verdict: 'Pending', detail: `RCPT got ${code}.`, code });
            }
            break;
          case 4: // RCPT TO (catch-all probe)
            if (code === 250 || code === 251 || code === 252) {
              // Domain accepts ANY mailbox → catch-all → we can't prove
              // anything about the real address. Downgrade to Pending.
              signals.catchAll = true;
              finish({
                verdict: 'Pending',
                detail:  'Domain is catch-all — accepts any mailbox. Original RCPT also accepted, so cannot prove existence.',
                code,
              });
            } else if (code === 550 || code === 551 || code === 553 || code === 554) {
              signals.catchAll = false;
              finish({
                verdict: 'Valid',
                detail:  `Mailbox exists; catch-all probe rejected (${code}).`,
                code:    lastCode,
              });
            } else {
              // Couldn't determine catch-all status. The real RCPT
              // was accepted earlier, so trust that.
              signals.catchAll = null;
              finish({
                verdict: mailboxAccepted ? 'Valid' : 'Pending',
                detail:  `Catch-all probe inconclusive (${code}); trusting RCPT result.`,
                code:    lastCode,
              });
            }
            break;
          default:
            break;
        }
      }
    });
  });
}
