// app/portal/login/page.tsx — password sign-in for partners.

import PageTitle from '@/components/ui/PageTitle';
import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

export default function PortalLoginPage() {
  return (
    <div className="max-w-md mx-auto rounded-md border border-gray-200 bg-white p-8">
      <PageTitle size="md">Partner sign in</PageTitle>
      <p className="text-gray-600 text-sm mb-6">
        Use the email and password from your Account page. No password yet? Use the link in your
        latest email, then set a password under Account.
      </p>
      <LoginForm />
    </div>
  );
}
