import { redirect } from 'next/navigation';
import CalculatorBrandingSection from '../profile/CalculatorBrandingSection';
import { getCurrentUser } from '@/lib/server/auth/user';

export const metadata = {
  title: 'Custom Designer | Realty News Now',
  description: 'Design a REALTOR® email signature and calculator branding from one saved profile.',
};

export const dynamic = 'force-dynamic';

export default async function CustomDesignerPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Fcustom-designer');

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#078fca]">Platinum Tools</p>
        <h1 className="mt-2 text-3xl font-semibold text-gray-950">Custom Designer</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
          Create and save coordinated email signatures and calculator branding with your professional identity, brokerage logo, contact details, and approved design.
        </p>
      </div>
      <CalculatorBrandingSection accentColor="#301D5D" />
    </main>
  );
}
