import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/server/auth/user';
import DesignerClient from './DesignerClient';

export const metadata = {
  title: 'Custom Designer | Realty News Now',
  description: 'Create email signatures, flyers, social graphics, and business cards.',
};

export const dynamic = 'force-dynamic';

export default async function CustomDesignerPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Fcustom-designer');

  return <DesignerClient />;
}
