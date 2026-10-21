import NotificationsPanel from './NotificationsPanel';
export const dynamic = 'force-dynamic';
export default function Page() {
  return (
    <div className="space-y-5">
      <div><h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-[color:var(--ds-ink)]">Notification Settings</h1><p className="text-sm text-[color:var(--ds-body)]">Set which notifications you and your clients will receive.</p></div>
      <NotificationsPanel />
    </div>
  );
}
