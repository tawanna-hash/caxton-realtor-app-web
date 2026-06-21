// lib/server/mailing/email-only-routing.ts
//
// Rule (locked in 2026-06-21): a contact whose email is valid but whose
// mailing address has NO usable components (no street, no city, no state,
// no zip) is unmailable by post. We route those contacts to a dedicated
// "email-only" segment per market so the Manual Newsline / REALTORS /
// Active Advertiser pages stay focused on contacts that CAN receive a
// physical mailing.
//
// This helper is the single source of truth for that routing. It runs on:
//   - single-row save  (app/api/admin/mailing/[id]/route.ts)
//   - bulk save / move (app/api/admin/mailing/bulk/route.ts)
//   - external upsert  (lib/server/mailing/external-upsert.ts)
//   - one-time backfill SQL (scripts + same rule baked into migration)
//
// Inputs are intentionally loose so any caller can pass whatever fields it
// has. The rule itself is:
//
//   hasValidEmail(email) && allAddressFieldsEmpty(address, city, state, zip)
//
// "Valid email" mirrors the regex used by publication-counts.ts so a row
// either makes it into the publication mailing list OR lives in the
// email-only pool — never neither.

import { getSql } from '@/lib/db';
import type { MailingSegment } from './segments';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Market = 'austin' | 'san_antonio';

export interface RoutingInput {
  current_segment: MailingSegment;
  email: string | null | undefined;
  address: string | null | undefined;
  city: string | null | undefined;
  state: string | null | undefined;
  zip: string | null | undefined;
}

function blank(v: string | null | undefined): boolean {
  return v === null || v === undefined || v.trim() === '';
}

function looksLikeEmail(raw: string | null | undefined): boolean {
  if (raw === null || raw === undefined) return false;
  const e = raw.trim().toLowerCase();
  if (!e) return false;
  return EMAIL_RE.test(e);
}

function hasNoAddress(input: Pick<RoutingInput, 'address' | 'city' | 'state' | 'zip'>): boolean {
  return blank(input.address) && blank(input.city) && blank(input.state) && blank(input.zip);
}

/**
 * Pure predicate — does this row qualify as email-only right now?
 */
export function isEmailOnly(input: Pick<RoutingInput, 'email' | 'address' | 'city' | 'state' | 'zip'>): boolean {
  return looksLikeEmail(input.email) && hasNoAddress(input);
}

/**
 * Map a current segment to the market it belongs to. This lets us route an
 * Austin row into 'email-only-atx' and a San Antonio row into
 * 'email-only-sa' without making the caller pass market explicitly.
 *
 * Returns null for segments that are inherently market-ambiguous
 * (currently: none — every concrete segment maps to a market).
 */
export function marketForSegment(seg: MailingSegment): Market {
  switch (seg) {
    case 'active-advertiser-sa':
    case 'non-advertiser-sa':
    case 'manual-newsline':
    case 'email-only-sa':
      return 'san_antonio';
    case 'active-advertiser-atx':
    case 'non-advertiser-atx':
    case 'realtor':           // realtor segment is Texas-wide; defaults to Austin
    case 'realtyline-atx-print':
    case 'email-only-atx':
      return 'austin';
  }
}

/**
 * Compute the target segment for a row. If the row qualifies as
 * email-only, returns the email-only segment matching its market.
 * Otherwise returns the current segment unchanged.
 *
 * The market is sticky: an "active-advertiser-sa" row that becomes
 * email-only routes to "email-only-sa", not the Austin pool.
 *
 * `email-only-*` rows themselves are also reconsidered — if a previously
 * email-only contact gets an address added, they move back to a default
 * "mailable" segment for their market (manual-newsline for SA, realtor
 * for ATX). Callers that want to override that behavior (e.g. keep them
 * in active-advertiser when an address gets re-added) can do so by NOT
 * calling this helper when the source segment is intentional.
 */
export function classifyTargetSegment(input: RoutingInput): MailingSegment {
  const emailOnly = isEmailOnly(input);
  const market = marketForSegment(input.current_segment);

  if (emailOnly) {
    return market === 'san_antonio' ? 'email-only-sa' : 'email-only-atx';
  }

  // No longer email-only — move OUT of the email-only segment.
  if (input.current_segment === 'email-only-sa') return 'manual-newsline';
  if (input.current_segment === 'email-only-atx') return 'realtyline-atx-print';

  return input.current_segment;
}

/**
 * Sweep every mailing-stage row and route any that qualifies as
 * email-only into the matching email-only segment. Safe to run at any
 * time — idempotent + bounded by the total mailing-stage row count.
 * Returns the number of rows moved IN this run.
 *
 * Two passes:
 *   1. mailable → email-only-* when address is fully empty
 *   2. email-only-* → default mailable segment when an address gets added
 */
export async function sweepEmailOnlyRouting(): Promise<{ to_email_only: number; from_email_only: number }> {
  const sql = getSql();

  // Pass 1: rows that became email-only.
  const toRows = (await sql`
    UPDATE mailing_contacts
       SET segment = CASE
         WHEN segment IN ('active-advertiser-sa','non-advertiser-sa','manual-newsline')
           THEN 'email-only-sa'
         ELSE 'email-only-atx'
       END
     WHERE stage = 'mailing'
       AND segment NOT IN ('email-only-sa','email-only-atx')
       AND email IS NOT NULL
       AND length(trim(email)) > 0
       AND lower(trim(email)) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
       AND (address IS NULL OR length(trim(address)) = 0)
       AND (city    IS NULL OR length(trim(city))    = 0)
       AND (state   IS NULL OR length(trim(state))   = 0)
       AND (zip     IS NULL OR length(trim(zip))     = 0)
     RETURNING id
  `) as unknown as Array<{ id: string }>;

  // Pass 2: rows that gained an address and should leave email-only.
  //   - email-only-sa  → manual-newsline (the SA generic catch-all)
  //   - email-only-atx → realtor (the ATX/Texas-wide catch-all)
  const fromRows = (await sql`
    UPDATE mailing_contacts
       SET segment = CASE
         WHEN segment = 'email-only-sa'  THEN 'manual-newsline'
         WHEN segment = 'email-only-atx' THEN 'realtyline-atx-print'
         ELSE segment
       END
     WHERE stage = 'mailing'
       AND segment IN ('email-only-sa','email-only-atx')
       AND (
         (address IS NOT NULL AND length(trim(address)) > 0)
         OR (city    IS NOT NULL AND length(trim(city))    > 0)
         OR (state   IS NOT NULL AND length(trim(state))   > 0)
         OR (zip     IS NOT NULL AND length(trim(zip))     > 0)
       )
     RETURNING id
  `) as unknown as Array<{ id: string }>;

  return { to_email_only: toRows.length, from_email_only: fromRows.length };
}
