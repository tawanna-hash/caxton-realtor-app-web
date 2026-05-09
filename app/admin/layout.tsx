'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/admin-api';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === '/admin/login';

  const handleLogout = async () => {
    try {
      await adminApi.logout();
    } catch {}
    router.push('/admin/login');
  };

  if (isLoginPage) {
    return <div className="min-h-screen bg-gray-50">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#1a2a44] text-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/giveaways" className="font-semibold text-lg tracking-tight">
              Caxton Admin
            </Link>
            <span className="text-[10px] uppercase tracking-wider text-white/70 px-2 py-0.5 bg-white/10 rounded">
              Internal
            </span>
          </div>
          <nav className="flex items-center gap-6 text-sm">
            <Link
              href="/admin/giveaways"
              className={`hover:text-white transition-colors ${pathname.startsWith('/admin/giveaways') ? 'text-white' : 'text-white/70'}`}
            >
              Giveaways
            </Link>
            <Link
              href="/admin/events"
              className={`hover:text-white transition-colors ${pathname.startsWith('/admin/events') ? 'text-white' : 'text-white/70'}`}
            >
              Events
            </Link>
            <button onClick={handleLogout} className="text-white/70 hover:text-white text-sm">
              Logout
            </button>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
