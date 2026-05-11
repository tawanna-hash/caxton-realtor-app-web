import SiteHeader from '@/components/SiteHeader';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />
      <main>{children}</main>
    </div>
  );
}
