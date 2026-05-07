'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { adminApi } from '@/lib/admin-api';

export type AdminUser = {
  id: string;
  email: string;
  name?: string;
};

export function useAdmin() {
  const router = useRouter();
  const pathname = usePathname();
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    adminApi.me()
      .then((data) => {
        if (cancelled) return;
        setAdmin(data?.admin || data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoading(false);
        if (err.status === 401 && pathname !== '/admin/login') {
          router.replace('/admin/login');
        }
      });
    return () => { cancelled = true; };
  }, [pathname, router]);

  return { admin, loading };
}
