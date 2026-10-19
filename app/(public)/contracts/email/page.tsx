import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
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
  if (!user) redirect('/login?next=%2Fcontracts%2Femail');
  return (
    <ContractsShell active="email">
      <EmailClient />
    </ContractsShell>
  );
}
