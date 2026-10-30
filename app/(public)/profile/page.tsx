import ProfileClient from './ProfileClient';
import { AdSlot } from '@/components/ads/AdSlot';

export const metadata = { title: 'My Profile' };

export default function ProfilePage() {
  return (
    <>
      <div className="mx-auto max-w-3xl px-3 pt-4" role="complementary" aria-label="Sponsored">
        <AdSlot slug="account_splash" variant="bare" />
      </div>
      <ProfileClient />
    </>
  );
}
