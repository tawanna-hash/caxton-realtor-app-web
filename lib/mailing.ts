// lib/mailing.ts
//
// Public barrel for the mailing module. Implementation is split across
// `lib/server/mailing/*` — keep this file as a stable re-export shell so
// the 35 existing call sites (admin pages, API routes, cron handlers,
// website-sync, advertiser-import) keep working unchanged.
//
// Split layout:
//   - segments         — MailingSegment enum + slug helpers
//   - types            — row/input shapes (MailingContactRow, etc.)
//   - columns          — column id catalog + sort helpers
//   - import-fields    — CSV import field catalog + header guesser
//   - queries          — list/search/sort, segment + holding counts
//   - mutations        — create/update/delete + dedupe
//   - advertiser-sync  — sync from advertisers/staff into mailing list
//   - holding          — list holding contacts, verify flags, promote/reject
//   - external-upsert  — upsert from external sources into holding
//   - verification     — edit holding rows, persist USPS/email/geocode

export * from './server/mailing/segments';
export * from './server/mailing/types';
export * from './server/mailing/columns';
export * from './server/mailing/import-fields';
export * from './server/mailing/queries';
export * from './server/mailing/mutations';
export * from './server/mailing/advertiser-sync';
export * from './server/mailing/holding';
export * from './server/mailing/external-upsert';
export * from './server/mailing/verification';
