// Public alias: /auth/sign-up (hyphenated). The canonical signup wizard
// lives in the dashboard AuthGate (mode='signup'). Redirect into it.
// (The existing /auth/signup also redirects to /dashboard.)

import { redirect } from 'next/navigation';

export default function SignUpAliasPage() {
  redirect('/dashboard?auth=signup');
}
