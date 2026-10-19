'use client';

// components/PushForegroundToast.tsx
//
// In-app banner shown when a push notification arrives while the app is
// in the foreground. iOS suppresses the system banner in that state, so
// without this users would never know a push fired while they were
// looking at the app.
//
// Behavior:
//   - Listens for the `caxton:push-received` window event (dispatched by
//     installNativePushHandlers in lib/native/push.ts).
//   - Renders a slide-down banner at the top of the viewport (below the
//     status bar safe area) for ~5s, then auto-dismisses.
//   - Tap behavior: if the payload carries data.url (or data.path /
//     data.deepLink), tapping the banner navigates there via router.replace.
//   - Tapping the small × dismisses without navigating.
//   - Same-origin URL validation matches the action-tap handler in push.ts
//     so we cannot be tricked into navigating off-site.
//   - Triggers a light haptic on arrival so the user feels the push even
//     if their phone is silent / face-down.

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { isNative } from '@/lib/native/runtime';
import { haptics } from '@/lib/native/haptics';

type Toast = {
  id: number;
  title: string;
  body: string;
  url: string | null;
};

const ALLOWED_HOSTS = new Set([
  'realtynewsnow.app',
  'www.realtynewsnow.app',
  'myrealtyline.com',
  'www.myrealtyline.com',
]);

function resolveTarget(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  // Relative paths are always safe.
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  // Absolute URLs: only allow our hosts, return path+search+hash.
  try {
    const u = new URL(raw);
    if (!ALLOWED_HOSTS.has(u.hostname.toLowerCase())) return null;
    return (u.pathname || '/') + (u.search || '') + (u.hash || '');
  } catch {
    return null;
  }
}

export default function PushForegroundToast() {
  const router = useRouter();
  const [toast, setToast] = useState<Toast | null>(null);

  const dismiss = useCallback(() => {
    setToast(null);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isNative()) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let nextId = 1;

    const onReceived = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || typeof detail !== 'object') return;

      const title =
        typeof detail.title === 'string' && detail.title.length > 0
          ? detail.title
          : 'Realty News Now';
      const body =
        typeof detail.body === 'string' && detail.body.length > 0 ? detail.body : '';

      const data =
        detail.data && typeof detail.data === 'object' ? (detail.data as Record<string, unknown>) : {};
      const url =
        resolveTarget(data.url) ?? resolveTarget(data.path) ?? resolveTarget(data.deepLink);

      // Subtle haptic so the user notices the banner even without sound.
      void haptics.light();

      setToast({ id: nextId++, title, body, url });

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setToast(null);
        timer = null;
      }, 5000);
    };

    window.addEventListener('caxton:push-received', onReceived);
    return () => {
      window.removeEventListener('caxton:push-received', onReceived);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!toast) return null;

  const handleTap = () => {
    if (toast.url) {
      void haptics.selection();
      router.replace(toast.url);
    }
    setToast(null);
  };

  const handleDismiss = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    dismiss();
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      onClick={handleTap}
      style={{
        position: 'fixed',
        top: 'max(env(safe-area-inset-top, 0px), 8px)',
        left: 12,
        right: 12,
        zIndex: 9999,
        background: 'rgba(48, 29, 93, 0.97)',
        color: '#fff',
        borderRadius: 14,
        padding: '12px 14px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        cursor: toast.url ? 'pointer' : 'default',
        animation: 'caxtonToastIn 220ms ease-out',
      }}
    >
      <style>{`
        @keyframes caxtonToastIn {
          from { transform: translateY(-120%); opacity: 0; }
          to   { transform: translateY(0);     opacity: 1; }
        }
      `}</style>

      <div
        aria-hidden
        style={{
          width: 28,
          height: 28,
          flexShrink: 0,
          borderRadius: 7,
          background: '#fff',
          color: '#301D5D',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: 14,
        }}
      >
        RN
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: 13.5,
            lineHeight: 1.2,
            marginBottom: toast.body ? 2 : 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {toast.title}
        </div>
        {toast.body ? (
          <div
            style={{
              fontSize: 12.5,
              lineHeight: 1.35,
              opacity: 0.92,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {toast.body}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={handleDismiss}
        style={{
          background: 'transparent',
          border: 0,
          color: 'rgba(255,255,255,0.85)',
          fontSize: 18,
          lineHeight: 1,
          padding: '2px 4px',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
