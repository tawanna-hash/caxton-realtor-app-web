/**
 * Server-side count helper for the publication mailing lists.
 *
 * Mirrors the dedupe + drop logic in
 *   app/api/admin/mailing/publication-list/route.ts
 * but runs the entire aggregation inside Postgres, so the Mailing Hub
 * can render contact-count badges without loading 16k-19k rows into
 * Node for every page view.
 *
 * Returns the same totals the CSV download would produce:
 *   - total:      unique deliverable emails across all 4 source tables
 *   - valid:      total with email_verifications.status = 'valid'
 *   - invalid:    total with email_verifications.status = 'invalid'
 *   - risky:      total with email_verifications.status = 'risky'
 *   - unknown:    total with email_verifications.status = 'unknown'
 *   - pending:    total with email_verifications.status = 'pending'
 *   - unverified: total with no email_verifications row
 */

import { getSql } from '@/lib/db';

export type Pub = 'realtyline' | 'newsline';

export type PublicationCount = {
  publication: Pub;
  total: number;
  valid: number;
  invalid: number;
  risky: number;
  unknown: number;
  pending: number;
  unverified: number;
};

type Cfg = {
  segments: string[];
  market: string;
  holdingSource: string;
  newsletterPub: string;
};

function configFor(pub: Pub): Cfg {
  return pub === 'realtyline'
    ? {
        segments: ['active-advertiser-atx', 'non-advertiser-atx'],
        market: 'austin',
        holdingSource: 'unlockmls',
        newsletterPub: 'realtyline',
      }
    : {
        segments: ['active-advertiser-sa', 'non-advertiser-sa', 'manual-newsline'],
        market: 'san_antonio',
        holdingSource: 'ramco-sabor',
        newsletterPub: 'newsline',
      };
}

// Drop the same statuses the CSV route drops, computed inside SQL so
// we never round-trip the dropped rows out of the DB.
//   - mailing/holding rows: unsubscribed_at IS NOT NULL    -> drop
//   - mailing/holding rows: email_status = 'Invalid'        -> drop
//   - realtors: status IN ('unsubscribed','bounced','suppressed','inactive') -> drop
//   - newsletter_subscribers: status <> 'active'            -> drop (we
//        already filter to status='active' explicitly)
//
// Email validity uses a regex that mirrors EMAIL_RE in the route.
export async function countPublicationList(pub: Pub): Promise<PublicationCount> {
  const sql = getSql();
  const cfg = configFor(pub);

  const rows = (await sql.query(
    `
    WITH src AS (
      -- mailing_contacts stage='mailing'
      SELECT lower(trim(email)) AS email
        FROM mailing_contacts
       WHERE stage = 'mailing'
         AND segment = ANY($1::text[])
         AND email IS NOT NULL
         AND length(trim(email)) > 0
         AND unsubscribed_at IS NULL
         AND COALESCE(email_override_status, email_status, '') <> 'Invalid'

      UNION ALL

      -- mailing_contacts stage='holding' (ABOR or SABOR board mirror)
      SELECT lower(trim(email)) AS email
        FROM mailing_contacts
       WHERE stage = 'holding'
         AND external_source = $2
         AND email IS NOT NULL
         AND length(trim(email)) > 0
         AND unsubscribed_at IS NULL
         AND COALESCE(email_override_status, email_status, '') <> 'Invalid'

      UNION ALL

      -- realtors (app subscribers by market)
      SELECT lower(trim(email)) AS email
        FROM realtors
       WHERE market = $3
         AND email IS NOT NULL
         AND length(trim(email)) > 0
         AND COALESCE(status, 'active') NOT IN ('unsubscribed','bounced','suppressed','inactive')

      UNION ALL

      -- newsletter_subscribers (weekly digest)
      SELECT lower(trim(email)) AS email
        FROM newsletter_subscribers
       WHERE publication = $4
         AND status = 'active'
         AND email IS NOT NULL
         AND length(trim(email)) > 0
    ),
    valid_emails AS (
      SELECT DISTINCT email
        FROM src
       WHERE email ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
         AND email NOT IN (SELECT email FROM email_suppressions)
    ),
    joined AS (
      SELECT v.email,
             COALESCE(ev.status, 'unverified') AS status
        FROM valid_emails v
        LEFT JOIN email_verifications ev ON ev.email = v.email
    )
    SELECT
      COUNT(*)::int                                                AS total,
      COUNT(*) FILTER (WHERE status = 'valid')::int                AS valid,
      COUNT(*) FILTER (WHERE status = 'invalid')::int              AS invalid,
      COUNT(*) FILTER (WHERE status = 'risky')::int                AS risky,
      COUNT(*) FILTER (WHERE status = 'unknown')::int              AS unknown,
      COUNT(*) FILTER (WHERE status = 'pending')::int              AS pending,
      COUNT(*) FILTER (WHERE status = 'unverified')::int           AS unverified
    FROM joined
    `,
    [cfg.segments, cfg.holdingSource, cfg.market, cfg.newsletterPub],
  )) as Array<{
    total: number;
    valid: number;
    invalid: number;
    risky: number;
    unknown: number;
    pending: number;
    unverified: number;
  }>;

  const r = rows[0] ?? {
    total: 0, valid: 0, invalid: 0, risky: 0, unknown: 0, pending: 0, unverified: 0,
  };
  return { publication: pub, ...r };
}
