// Public alias: /auth/sign-in
// The actual sign-in UI lives in the dashboard AuthGate (mode='login'),
// which already supports password + WebAuthn (Face ID / Touch ID).
// Redirect callers here straight into that flow with ?auth=login.

import { redirect } from 'next/navigation';

export default function SignInPage() {
  redirect('/dashboard?auth=login');
}
