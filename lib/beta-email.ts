// Single switch for client-facing email from the Beta billing screens.
// Off while Beta is in development. To turn email back on, set
// NEXT_PUBLIC_BETA_EMAIL_ENABLED=true in the Vercel project and redeploy.
export const BETA_EMAIL_ENABLED = process.env.NEXT_PUBLIC_BETA_EMAIL_ENABLED === 'true';
