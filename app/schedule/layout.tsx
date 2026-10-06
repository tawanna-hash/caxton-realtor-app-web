// Scheduling poll: a standalone page like the client portal, without the site header, footer and navigation.
export default function ScheduleLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white">{children}</div>;
}
