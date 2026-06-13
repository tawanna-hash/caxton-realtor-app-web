// app/auth/signup/page.tsx
//
// Legacy alias for /auth/sign-up. Some older marketing links and form
// actions still point at /signup (no hyphen); redirect them to the
// canonical sign-up route rather than dropping users at the dashboard.

import { redirect } from 'next/navigation';

export default function SignupPage() {
  redirect('/auth/sign-up');
}
