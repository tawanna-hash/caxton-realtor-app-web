'use client';

import { type PubKey } from '@/lib/pub-meta';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBase } from '@/lib/api-base';
import PasswordSection from '@/components/PasswordSection';
import PasskeysPanel from '@/components/PasskeysPanel';

const API = getApiBase();

type Pub = PubKey;
type User = {
  email?: string;
  first_name?: string;
  last_name?: string;
  firstName?: string;
  lastName?: string;
  hasPassword?: boolean;
};

// Brand colors per publication. Falls back to RealtyLine navy.
// Houston/Dallas inherit RealtyLine navy as they're under the same umbrella.
const ACCENT: Record<Pub, string> = {
  realtyline: '#021D40',
  newsline: '#874F80',
  'realtyline-houston': '#021D40',
  'realtyline-dallas': '#021D40',
};

function readPub(): Pub {
  if (typeof window === 'undefined') return 'realtyline';
  try {
    const v = window.localStorage.getItem('caxton_pub');
    if (v === 'realtyline' || v === 'newsline') return v;
  } catch {}
  return 'realtyline';
}

function subscribePub(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', callback);
  window.addEventListener('savedPubChange', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('savedPubChange', callback);
  };
}

const SERVER_PUB: Pub = 'realtyline';
function getServerPubSnapshot(): Pub {
  return SERVER_PUB;
}

export default function ProfileClient() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const pub = useSyncExternalStore(subscribePub, readPub, getServerPubSnapshot);
  const accent = ACCENT[pub];

  useEffect(() => {
    let cancelled = false;

    async function loadUser(): Promise<User | null> {
      const r = await fetch(`${API}/auth/me`, { credentials: 'include' });
      if (!r.ok) return null;
      const data = await r.json();
      // Backend returns { realtor: {...} } per lib/api-client.ts.
      return data?.realtor ?? data ?? null;
    }

    loadUser()
      .then((realtor) => {
        if (cancelled) return;
        if (!realtor) {
          // Not authenticated — send the user to /dashboard, which runs
          // splash -> select -> auth -> feed. The auth gate there handles
          // sign-in, then the user can navigate back here.
          router.replace('/dashboard');
          return;
        }
        setUser(realtor);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        router.replace('/dashboard');
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (loading) {
    return (
      <div className="px-5 py-10 max-w-md mx-auto">
        <p className="text-sm text-gray-400 font-light text-center">Loading your profile&hellip;</p>
      </div>
    );
  }

  if (!user) return null; // router.replace already fired

  const first = user.firstName || user.first_name || '';
  const last = user.lastName || user.last_name || '';
  const fullName = `${first} ${last}`.trim() || 'Your account';

  return (
    <div className="max-w-md mx-auto">
      <div className="px-5 py-6" style={{ backgroundColor: accent }}>
        <p className="text-xs uppercase tracking-[0.2em] text-white/70">My Profile</p>
        <p className="text-lg text-white font-medium truncate">{fullName}</p>
        {user.email && (
          <p className="text-xs text-white/60 font-light truncate">{user.email}</p>
        )}
      </div>

      <div className="p-5 space-y-5">
        <PasswordSection accentColor={accent} hasPassword={!!user.hasPassword} />
        <PasskeysPanel accentColor={accent} />

        <p className="text-xs text-gray-400 font-light text-center">
          More profile settings coming soon.
        </p>
      </div>
    </div>
  );
}
