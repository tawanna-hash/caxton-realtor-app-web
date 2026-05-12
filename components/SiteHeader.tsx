'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import HamburgerMenu from './HamburgerMenu';

type User = { id?: string; email?: string; guest?: boolean } | null;

const API = process.env.NEXT_PUBLIC_API_URL || 'https://api.myrealtyline.com';

export default function SiteHeader() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<User>(null);
  const [pub, setPub] = useState<string>('');

  // Hydrate user + pub from existing app conventions
  useEffect(() => {
    try {
      const savedPub = typeof window !== 'undefined' ? localStorage.getItem('caxton_pub') : null;
      if (savedPub) setPub(savedPub);
    } catch {}

    // Best-effort auth probe — same endpoint the dashboard uses
    fetch(`${API}/auth/me`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.realtor) setUser({ id: data.realtor.id, email: data.realtor.email });
        else setUser(null);
      })
      .catch(() => setUser(null));
  }, []);

  async function handleLogout() {
    if (!confirm('Are you sure you want to log out?')) return;
    try {
      await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch {}
    try {
      localStorage.removeItem('caxton_pub');
      localStorage.removeItem('caxton_phase');
      localStorage.removeItem('caxton_selected_article');
      localStorage.removeItem('caxton_selected_event');
    } catch {}
    setUser(null);
    router.push('/');
  }

  return (
    <>
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between px-3 py-3">
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="text-gray-700 p-2 rounded-full border border-gray-300 hover:bg-gray-50"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <Link href="/" className="text-base font-semibold text-gray-900 tracking-tight">
            HarmonyOne
          </Link>
          {user ? (
            <button
              onClick={handleLogout}
              aria-label="Log out"
              className="text-gray-700 p-2 rounded-full hover:bg-gray-50"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          ) : (
            <span className="w-9" aria-hidden />
          )}
        </div>
      </header>
      <HamburgerMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        user={user}
        pub={pub}
        showPublicationSwitcher={false}
        onLogout={handleLogout}
      />
    </>
  );
}
