// Alias: landing page CTA links here. Redirect to the existing signup wizard.

import { redirect } from 'next/navigation';

export default function SignUpAlias() {
  redirect('/subscribe');
}
