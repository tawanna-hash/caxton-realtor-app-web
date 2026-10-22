// Single switch for client-facing email from the Beta billing screens.
// On by default. Set NEXT_PUBLIC_BETA_EMAIL_ENABLED=false in Vercel and redeploy to turn it off.
export const BETA_EMAIL_ENABLED = process.env.NEXT_PUBLIC_BETA_EMAIL_ENABLED !== 'false';
