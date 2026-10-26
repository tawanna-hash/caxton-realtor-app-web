import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/server/auth/user';
import ContractsShell from '../ContractsShell';
import EmailClient from './EmailClient';

export const metadata: Metadata = {
  title: 'Email | Closing Time (limited edition)',
  description: 'Connect your own Gmail or Outlook account to Closing Time.',
};
export const dynamic = 'force-dynamic';

export default async function EmailPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <ContractsShell active="email">
        <div className="rounded-2xl border border-[#E6E5EC] bg-white p-6 text-sm text-[#4A4757]">
          You need a free account to connect your email.{' '}
          <a className="font-semibold text-[#301D5D] underline" href="/login?next=%2Fcontracts%2Femail">Create an account or sign in</a>
        </div>
      </ContractsShell>
    );
  }
  return (
    <ContractsShell active="email">
      <EmailClient />
    </ContractsShell>
  );
}
