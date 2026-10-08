import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/server/auth/user';
import SignupForm from './SignupForm';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: { absolute: "Create A Free Account | It's Almost Closing Time!" },
  description: 'Create your free Closing Time account. Your first two active deals are free.',
  alternates: { canonical: 'https://itsalmostclosingtime.com/auth/sign-up' },
};

// Short sign-up for itsalmostclosingtime.com: name, email and password.
export default async function ClosingTimeSignupPage() {
  if (await getCurrentUser()) redirect('/agents/closing-time');
  return <SignupForm />;
}
