/**
 * Single inbox for every internal/admin notification email (pending events,
 * signed agreements, inquiries, alerts, cron reports, etc.).
 *
 * Deliberately NOT overridable per-feature via env vars: scattered *_TO env
 * overrides previously sent notifications to different inboxes. Change the
 * destination here and it changes everywhere.
 */
export const ADMIN_INBOX = 'tawanna@myrealtyline.com';
