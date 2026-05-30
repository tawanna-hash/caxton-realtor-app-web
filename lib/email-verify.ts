// lib/email-verify.ts
//
// Built-in email verifier. No external API needed.
//
// Three layers (cheap → expensive):
//   1. Syntax     — strict-enough RFC 5322 regex
//   2. MX lookup  — DNS resolveMx() against the domain
//   3. SMTP probe — connect to the highest-priority MX, send
//                   HELO / MAIL FROM / RCPT TO <address>, observe reply
//
// Verdicts:
//   'Valid'   — SMTP server accepted RCPT TO with a 250/251 reply
//   'Invalid' — syntax bad, no MX, or SMTP responded with 5xx on RCPT
//   'Pending' — soft failure (timeout, 421/450 greylist, conn refused).
//               Caller can retry later.
//
// We never throw — every failure mode maps to one of the three verdicts
// plus a `detail` string. Probe is bounded by a hard timeout (8s default)
// because some mail servers will sit on the socket forever.

import { promises as dns } from 'node:dns';
import net from 'node:net';

// Permissive but stricter than the trivial `\S+@\S+` regex.
// Disallows leading/trailing dot, consecutive dots, etc.
const EMAIL_RE =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

export type EmailVerdict = 'Valid' | 'Invalid' | 'Pending';

export interface EmailVerifyResult {
  verdict: EmailVerdict;
  detail:  string;
  mx?:     string;
  code?:   number;
}

interface VerifyOpts {
  /** Hard timeout for the whole SMTP probe (ms). Default 8000. */
  timeoutMs?: number;
  /** MAIL FROM envelope sender. Default uses EMAIL_VERIFY_SENDER or postmaster@localhost. */
  fromAddress?: string;
  /** HELO/EHLO hostname. Default uses EMAIL_VERIFY_HELO_HOST or 'realtynewsnow.app'. */
  heloHost?: string;
}

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

/**
 * Verify a single email address. Returns a verdict + detail string.
 * Never throws.
 */
export async function verifyEmail(
  email: string,
  opts: VerifyOpts = {},
): Promise<EmailVerifyResult> {
  const addr = (email ?? '').trim();
  if (!addr) {
    return { verdict: 'Invalid', detail: 'Empty address.' };
  }
  if (!EMAIL_RE.test(addr)) {
    return { verdict: 'Invalid', detail: 'Syntax check failed.' };
  }
  const domain = addr.split('@')[1].toLowerCase();

  // ---- MX lookup ----
  let mx: { exchange: string; priority: number }[];
  try {
    mx = await dns.resolveMx(domain);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code ?? '';
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      return { verdict: 'Invalid', detail: `No MX records for ${domain}.` };
    }
    return { verdict: 'Pending', detail: `DNS lookup failed: ${code}.` };
  }
  if (!mx || mx.length === 0) {
    return { verdict: 'Invalid', detail: `No MX records for ${domain}.` };
  }
  mx.sort((a, b) => a.priority - b.priority);
  const host = mx[0].exchange;

  // ---- SMTP probe ----
  return smtpProbe(addr, host, opts);
}

/**
 * Connect to the given MX and run HELO / MAIL FROM / RCPT TO. The probe
 * is bounded by `timeoutMs` total — if anything hangs we resolve with
 * `Pending`.
 */
function smtpProbe(
  rcpt:    string,
  mxHost:  string,
  opts:    VerifyOpts,
): Promise<EmailVerifyResult> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const from = fromAddr(opts);
  const helo = heloHost(opts);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (r: EmailVerifyResult) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch {}
      clearTimeout(deadline);
      resolve({ ...r, mx: mxHost });
    };

    const socket = net.createConnection({ host: mxHost, port: 25 });
    socket.setEncoding('utf8');
    socket.setTimeout(timeoutMs);

    const deadline = setTimeout(() => {
      finish({ verdict: 'Pending', detail: 'SMTP probe timed out.' });
    }, timeoutMs);

    socket.on('error', (err) => {
      finish({
        verdict: 'Pending',
        detail:  `SMTP error: ${err.message}`,
      });
    });
    socket.on('timeout', () => {
      finish({ verdict: 'Pending', detail: 'SMTP socket timeout.' });
    });

    // We drive the conversation as a tiny state machine. `step` increments
    // after every command/response pair.
    let step = 0;
    let buf  = '';

    const send = (line: string) => {
      socket.write(`${line}\r\n`);
    };

    socket.on('data', (chunk: string) => {
      buf += chunk;
      // SMTP replies are line-terminated; a multi-line response uses
      // "XYZ-" continuation lines until a final "XYZ " (space) line.
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line) continue;
        const codeMatch = line.match(/^(\d{3})([- ])/);
        if (!codeMatch) continue;
        const code  = Number(codeMatch[1]);
        const final = codeMatch[2] === ' ';
        if (!final) continue;

        switch (step) {
          case 0: // banner
            if (code === 220) {
              send(`EHLO ${helo}`);
              step = 1;
            } else {
              finish({ verdict: 'Pending', detail: `SMTP banner ${code}.`, code });
            }
            break;
          case 1: // EHLO response
            if (code === 250) {
              send(`MAIL FROM:<${from}>`);
              step = 2;
            } else if (code >= 500) {
              // Some servers reject EHLO and want HELO instead — try once
              send(`HELO ${helo}`);
              step = 1; // re-handle as EHLO response
            } else {
              finish({ verdict: 'Pending', detail: `EHLO got ${code}.`, code });
            }
            break;
          case 2: // MAIL FROM response
            if (code >= 200 && code < 300) {
              send(`RCPT TO:<${rcpt}>`);
              step = 3;
            } else {
              finish({ verdict: 'Pending', detail: `MAIL FROM got ${code}.`, code });
            }
            break;
          case 3: // RCPT TO response
            send('QUIT');
            if (code === 250 || code === 251) {
              finish({ verdict: 'Valid', detail: `RCPT accepted (${code}).`, code });
            } else if (code === 550 || code === 551 || code === 553 || code === 554) {
              finish({ verdict: 'Invalid', detail: `Mailbox rejected (${code}).`, code });
            } else if (code === 552) {
              // Over-quota — mailbox exists but is full. Still useful.
              finish({ verdict: 'Valid', detail: `Mailbox over quota (${code}).`, code });
            } else {
              // 4xx greylisting / temp failures
              finish({ verdict: 'Pending', detail: `RCPT got ${code}.`, code });
            }
            break;
          default:
            break;
        }
      }
    });
  });
}
