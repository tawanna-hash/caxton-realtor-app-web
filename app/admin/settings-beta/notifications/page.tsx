import NotificationsPanel from './NotificationsPanel';
import { A } from '@/components/anchor/ui';
export const dynamic = 'force-dynamic';
export default function Page() {
  return (
    <div className="space-y-5">
      <div><h1 className={A.title}>Notification Settings</h1><p className={A.subtitle}>Set which notifications you and your clients will receive.</p></div>
      <NotificationsPanel />
    </div>
  );
}
