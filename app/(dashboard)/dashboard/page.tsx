import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookie-names';
import DashboardClient from './DashboardClient';

// Server wrapper: lets signed-out visitors receive the sign-in screen in the
// initial HTML so it paints without waiting for client JavaScript.
export default async function DashboardPage() {
  const jar = await cookies();
  const signedOut = !jar.get(SESSION_COOKIE_NAME)?.value;
  return <DashboardClient signedOut={signedOut} />;
}
