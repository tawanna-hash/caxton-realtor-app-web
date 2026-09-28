import { getSql } from '@/lib/db';
import { sweepEmailOnlyRouting } from './email-only-routing';

type SyncRow = {
  candidates: number;
  added: number;
  locations_added: number;
  staff_added: number;
};

type AuditRow = {
  duplicate_people: number;
  duplicate_offices: number;
  legacy_misrouted: number;
};

/**
 * Reconcile active partner offices and people into the two print-mail segments.
 * Keep source identities stable so an hourly run never creates another copy.
 * Existing admin-edited rows are left alone; this is an add-only backfill.
 */
export async function syncPartnerRoster(): Promise<{
  added: number;
  skipped: number;
  errors: number;
  locationsAdded: number;
  staffAdded: number;
  duplicatePeople: number;
  duplicateOffices: number;
  legacyMisrouted: number;
}> {
  const sql = getSql();
  const rows = (await sql.query(`
    WITH partners AS (
      SELECT a.*,
             lower(replace(coalesce(a.publication, 'austin'), ' ', '')) AS pubs
        FROM advertisers a
       WHERE coalesce(a.status, 'prospect') = 'advertiser'
    ),
    targets AS (
      SELECT a.*, t.segment
        FROM partners a
        CROSS JOIN LATERAL (VALUES
          ('realtyline-atx-print',
           a.pubs = '' OR a.pubs ~ '(^|,)(austin|houston|dallas|both)(,|$)'
           OR a.pubs !~ '(^|,)(austin|san_antonio|houston|dallas|both)(,|$)'),
          ('newsline-sa-print',
           a.pubs ~ '(^|,)(san_antonio|both)(,|$)')
        ) AS t(segment, included)
       WHERE t.included
    ),
    primary_office AS (
      SELECT t.id AS advertiser_id, t.segment, l.*
        FROM targets t
        LEFT JOIN LATERAL (
          SELECT address, address_2, city, state, zip
            FROM advertiser_locations
           WHERE advertiser_id = t.id
           ORDER BY is_primary DESC, sort_order, created_at
           LIMIT 1
        ) l ON true
    ),
    raw AS (
      SELECT t.segment, t.id AS advertiser_id, 1 AS priority,
             'person'::text AS kind,
             'sync:partner-primary:' || t.id AS source,
             coalesce(nullif(trim(t.first_name), ''),
                      nullif(split_part(trim(coalesce(t.name, '')), ' ', 1), ''),
                      nullif(trim(t.company), ''),
                      nullif(trim(coalesce(t.contact_email, t.portal_email)), ''),
                      'Partner') AS first_name,
             nullif(trim(t.last_name), '') AS last_name,
             nullif(trim(coalesce(t.contact_email, t.portal_email)), '') AS email,
             coalesce(t.phone, t.office_phone) AS phone,
             t.company, t.title, t.license_number,
             coalesce(nullif(trim(t.address), ''), p.address) AS address,
             coalesce(nullif(trim(t.address_2), ''), p.address_2) AS address_2,
             coalesce(nullif(trim(t.city), ''), p.city) AS city,
             coalesce(nullif(trim(t.state), ''), p.state) AS state,
             coalesce(nullif(trim(t.zip), ''), p.zip) AS zip,
             t.website
        FROM targets t
        LEFT JOIN primary_office p ON p.advertiser_id = t.id AND p.segment = t.segment

      UNION ALL
      SELECT t.segment, t.id, 2, 'person',
             'sync:partner-staff:' || s.id,
             coalesce(nullif(split_part(trim(s.name), ' ', 1), ''),
                      nullif(trim(s.email), ''), 'Staff'),
             nullif(trim(substr(trim(s.name),
                        length(split_part(trim(s.name), ' ', 1)) + 1)), ''),
             nullif(trim(s.email), ''), s.phone, t.company, s.title, NULL,
             coalesce(sl.address, nullif(trim(t.address), ''), p.address),
             coalesce(sl.address_2, nullif(trim(t.address_2), ''), p.address_2),
             coalesce(sl.city, nullif(trim(t.city), ''), p.city),
             coalesce(sl.state, nullif(trim(t.state), ''), p.state),
             coalesce(sl.zip, nullif(trim(t.zip), ''), p.zip),
             t.website
        FROM targets t
        JOIN advertiser_staff s ON s.advertiser_id = t.id
        LEFT JOIN primary_office p ON p.advertiser_id = t.id AND p.segment = t.segment
        LEFT JOIN LATERAL (
          SELECT l.address, l.address_2, l.city, l.state, l.zip
            FROM advertiser_staff_locations x
            JOIN advertiser_locations l ON l.id = x.location_id
           WHERE x.staff_id = s.id AND l.advertiser_id = t.id
           ORDER BY l.is_primary DESC, l.sort_order, l.created_at
           LIMIT 1
        ) sl ON true

      UNION ALL
      SELECT t.segment, t.id, 3, 'person',
             'sync:partner-additional:' || t.id || ':' || x.ordinality,
             coalesce(nullif(trim(x.contact->>'first_name'), ''),
                      nullif(trim(x.contact->>'email'), ''), 'Contact'),
             nullif(trim(x.contact->>'last_name'), ''),
             nullif(trim(x.contact->>'email'), ''),
             nullif(trim(x.contact->>'phone'), ''),
             t.company, nullif(trim(x.contact->>'title'), ''), NULL,
             coalesce(nullif(trim(x.contact->>'address'), ''), p.address),
             coalesce(nullif(trim(x.contact->>'address_2'), ''), p.address_2),
             coalesce(nullif(trim(x.contact->>'city'), ''), p.city),
             coalesce(nullif(trim(x.contact->>'state'), ''), p.state),
             coalesce(nullif(trim(x.contact->>'zip'), ''), p.zip),
             t.website
        FROM targets t
        LEFT JOIN primary_office p ON p.advertiser_id = t.id AND p.segment = t.segment
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(t.additional_contacts) = 'array'
               THEN t.additional_contacts ELSE '[]'::jsonb END
        ) WITH ORDINALITY AS x(contact, ordinality)

      UNION ALL
      SELECT t.segment, t.id, 4, 'location',
             'sync:partner-location:' || l.id,
             coalesce(nullif(trim(t.company), ''), nullif(trim(t.name), ''), 'Partner'),
             nullif(trim(l.label), ''),
             nullif(trim(l.email), ''), l.phone, t.company, NULL, NULL,
             l.address, l.address_2, l.city, l.state, l.zip, t.website
        FROM targets t
        JOIN advertiser_locations l ON l.advertiser_id = t.id
       WHERE nullif(trim(l.address), '') IS NOT NULL
    ),
    keyed AS (
      SELECT r.*,
             CASE WHEN r.kind = 'location'
                  THEN 'office:' || r.advertiser_id || ':' ||
                       lower(trim(coalesce(r.address, ''))) || ':' ||
                       lower(trim(coalesce(r.address_2, ''))) || ':' ||
                       lower(trim(coalesce(r.city, ''))) || ':' ||
                       lower(trim(coalesce(r.zip, '')))
                  WHEN nullif(trim(r.email), '') IS NOT NULL
                  THEN 'email:' || lower(trim(r.email))
                  ELSE 'person:' || r.advertiser_id || ':' ||
                       lower(trim(r.first_name || ' ' || coalesce(r.last_name, ''))) ||
                       ':' || lower(trim(coalesce(r.address, '')))
             END AS dedupe_key
        FROM raw r
       WHERE (nullif(trim(coalesce(r.email, '')), '') IS NOT NULL
          OR nullif(trim(coalesce(r.address, '')), '') IS NOT NULL)
         AND NOT (
           r.kind = 'location' AND EXISTS (
             SELECT 1 FROM raw primary_contact
              WHERE primary_contact.priority = 1
                AND primary_contact.segment = r.segment
                AND primary_contact.advertiser_id = r.advertiser_id
                AND lower(trim(coalesce(primary_contact.address, ''))) =
                    lower(trim(coalesce(r.address, '')))
                AND lower(trim(coalesce(primary_contact.address_2, ''))) =
                    lower(trim(coalesce(r.address_2, '')))
                AND lower(trim(coalesce(primary_contact.city, ''))) =
                    lower(trim(coalesce(r.city, '')))
                AND lower(trim(coalesce(primary_contact.zip, ''))) =
                    lower(trim(coalesce(r.zip, '')))
           )
         )
    ),
    unique_roster AS (
      SELECT k.*,
             row_number() OVER (
               PARTITION BY k.segment, k.dedupe_key ORDER BY k.priority, k.source
             ) AS rn
        FROM keyed k
       WHERE NOT EXISTS (
         SELECT 1 FROM email_suppressions sup
          WHERE sup.email = lower(trim(k.email))
       )
    ),
    candidates AS (
      SELECT * FROM unique_roster WHERE rn = 1
    ),
    inserted AS (
      INSERT INTO mailing_contacts
        (segment, first_name, last_name, email, phone, company, title,
         license_number, address, address_2, city, state, zip, website,
         source, advertiser_id, tags)
      SELECT c.segment, c.first_name, c.last_name, c.email, c.phone,
             c.company, c.title, c.license_number, c.address, c.address_2,
             c.city, c.state, c.zip, c.website, c.source, c.advertiser_id,
             CASE WHEN c.source LIKE 'sync:partner-staff:%'
                  THEN '["advertiser","active-advertiser","staff"]'::jsonb
                  ELSE '["advertiser","active-advertiser"]'::jsonb END
        FROM candidates c
       WHERE NOT EXISTS (
         SELECT 1 FROM mailing_contacts m
          WHERE m.stage = 'mailing' AND m.segment = c.segment
            AND (
              m.source = c.source
              OR (c.kind = 'person' AND c.email IS NOT NULL
                  AND lower(trim(m.email)) = lower(trim(c.email)))
              OR (c.kind = 'location' AND m.advertiser_id = c.advertiser_id
                  AND NOT (coalesce(m.tags, '[]'::jsonb) ? 'staff')
                  AND lower(trim(coalesce(m.address, ''))) = lower(trim(c.address))
                  AND lower(trim(coalesce(m.address_2, ''))) =
                      lower(trim(coalesce(c.address_2, '')))
                  AND lower(trim(coalesce(m.city, ''))) =
                      lower(trim(coalesce(c.city, '')))
                  AND lower(trim(coalesce(m.zip, ''))) =
                      lower(trim(coalesce(c.zip, ''))))
              OR (c.kind = 'person' AND c.email IS NULL
                  AND m.advertiser_id = c.advertiser_id
                  AND lower(trim(m.first_name || ' ' || coalesce(m.last_name, ''))) =
                      lower(trim(c.first_name || ' ' || coalesce(c.last_name, '')))
                  AND lower(trim(coalesce(m.address, ''))) =
                      lower(trim(coalesce(c.address, ''))))
            )
       )
      RETURNING source
    )
    SELECT (SELECT count(*)::int FROM candidates) AS candidates,
           (SELECT count(*)::int FROM inserted) AS added,
           (SELECT count(*)::int FROM inserted
             WHERE source LIKE 'sync:partner-location:%') AS locations_added,
           (SELECT count(*)::int FROM inserted
             WHERE source LIKE 'sync:partner-staff:%') AS staff_added
  `)) as SyncRow[];
  await sweepEmailOnlyRouting();
  const audit = (await sql.query(`
    WITH people AS (
      SELECT segment, lower(trim(email)) AS email, count(*) AS copies
        FROM mailing_contacts
       WHERE stage = 'mailing'
         AND segment IN ('newsline-sa-print', 'realtyline-atx-print')
         AND tags ? 'advertiser'
         AND coalesce(source, '') NOT LIKE 'sync:partner-location:%'
         AND nullif(trim(email), '') IS NOT NULL
       GROUP BY segment, lower(trim(email))
      HAVING count(*) > 1
    ),
    offices AS (
      SELECT segment, advertiser_id, lower(trim(address)) AS street,
             lower(trim(coalesce(address_2, ''))) AS suite,
             lower(trim(coalesce(city, ''))) AS city,
             lower(trim(coalesce(zip, ''))) AS zip,
             count(*) AS copies
        FROM mailing_contacts
       WHERE stage = 'mailing'
         AND segment IN ('newsline-sa-print', 'realtyline-atx-print')
         AND advertiser_id IS NOT NULL
         AND tags ? 'advertiser'
         AND NOT (tags ? 'staff')
         AND nullif(trim(address), '') IS NOT NULL
       GROUP BY segment, advertiser_id, lower(trim(address)),
                lower(trim(coalesce(address_2, ''))),
                lower(trim(coalesce(city, ''))),
                lower(trim(coalesce(zip, '')))
      HAVING count(*) > 1
    )
    SELECT (SELECT coalesce(sum(copies - 1), 0)::int FROM people) AS duplicate_people,
           (SELECT coalesce(sum(copies - 1), 0)::int FROM offices) AS duplicate_offices,
           (SELECT count(*)::int
              FROM mailing_contacts m
              JOIN advertisers a ON a.id = m.advertiser_id
             WHERE m.stage = 'mailing'
               AND m.source LIKE 'sync:advertisers%'
               AND m.segment = 'newsline-sa-print'
               AND lower(replace(coalesce(a.publication, 'austin'), ' ', ''))
                   !~ '(^|,)(san_antonio|both)(,|$)') AS legacy_misrouted
  `)) as AuditRow[];
  const result = rows[0] ?? { candidates: 0, added: 0, locations_added: 0, staff_added: 0 };
  const duplicates = audit[0] ?? { duplicate_people: 0, duplicate_offices: 0, legacy_misrouted: 0 };
  return {
    added: result.added,
    skipped: result.candidates - result.added,
    errors: 0,
    locationsAdded: result.locations_added,
    staffAdded: result.staff_added,
    duplicatePeople: duplicates.duplicate_people,
    duplicateOffices: duplicates.duplicate_offices,
    legacyMisrouted: duplicates.legacy_misrouted,
  };
}
