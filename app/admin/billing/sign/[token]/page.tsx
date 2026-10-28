// Old signing address. Links already sent by email keep working: they go to the current agreement page.
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function OldSignRedirect({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  redirect(`/agree/${encodeURIComponent(token)}`);
}
