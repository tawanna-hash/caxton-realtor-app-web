'use client';

// components/NativeNetworkBanner.tsx
//
// Offline banner driven by the Capacitor Network plugin. Critical for the
// shell-app model: server.url is https://realtynewsnow.app, so the moment
// the user loses connectivity the WebView starts throwing fetch errors
// silently. Without a banner the app feels broken — buttons stop working,
// pages stop loading, with no explanation.
//
// Falls back to navigator.onLine for the web build so the same banner
// works on the deployed website too. Native gets the richer
// `networkStatusChange` event (catches airplane mode flips, captive
// portals, etc.) that the browser doesn't expose reliably.
//
// Behaviors:
//   - Slides in at the bottom (above BottomNav) on offline.
//   - Triggers `error` haptic on transition to offline.
//   - On reconnect: triggers `success` haptic, fires
//     `caxton:network-online` so listeners (PTR consumers, dashboards)
//     can refetch stale data, then auto-dismisses after 1.5s.

import { useEffect, useState } from 'react';
import { Network } from '@capacitor/network';
import { isNative } from '@/lib/native/runtime';
import { haptics } from '@/lib/native/haptics';

type Phase = 'online' | 'offline' | 'recovered';

// Lazy initial phase — reads navigator.onLine synchronously on mount so we
// never have to setState inside the effect for the boot-offline case (which
// trips the React Compiler set-state-in-effect rule).
function initialPhase(): Phase {
  if (typeof navigator === 'undefined') return 'online';
  try {
    return navigator.onLine ? 'online' : 'offline';
  } catch {
    return 'online';
  }
}

export default function NativeNetworkBanner() {
  const [phase, setPhase] = useState<Phase>(initialPhase);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let mounted = true;
    let recoverTimer: ReturnType<typeof setTimeout> | null = null;
    // Seed lastOnline from current state so the first event delta is
    // computed correctly even when we boot offline.
    let lastOnline = navigator.onLine ?? true;

    const setOnline = (online: boolean) => {
      if (!mounted) return;
      if (online === lastOnline) return;
      lastOnline = online;

      if (!online) {
        void haptics.notify('error');
        setPhase('offline');
        if (recoverTimer) {
          clearTimeout(recoverTimer);
          recoverTimer = null;
        }
        return;
      }

      // Online → fire recovered banner briefly then go silent.
      void haptics.notify('success');
      setPhase('recovered');
      try {
        window.dispatchEvent(new CustomEvent('caxton:network-online'));
      } catch {
        /* ignore */
      }
      recoverTimer = setTimeout(() => {
        if (mounted) setPhase('online');
      }, 1500);
    };

    // Native: use Capacitor Network plugin. The getStatus() call is async
    // so the result feeds through setOnline() (a state-bridge callback)
    // rather than direct setState in the effect body — keeping us on the
    // right side of react-hooks/set-state-in-effect.
    if (isNative()) {
      let removeListener: (() => Promise<void>) | null = null;

      (async () => {
        try {
          const status = await Network.getStatus();
          // setOnline only flips state if the connectivity actually changed
          // from our last-known value, so the lazy initial state covers the
          // boot-offline case and this call no-ops when it matches.
          setOnline(status.connected);
          const handle = await Network.addListener('networkStatusChange', (s) => {
            setOnline(s.connected);
          });
          removeListener = () => handle.remove();
        } catch {
          // Plugin missing — fall through to the navigator path below.
        }
      })();

      return () => {
        mounted = false;
        if (recoverTimer) clearTimeout(recoverTimer);
        if (removeListener) void removeListener();
      };
    }

    // Web: navigator.onLine + window events. lastOnline is already seeded
    // from initial state, so no synchronous setPhase here.
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      mounted = false;
      if (recoverTimer) clearTimeout(recoverTimer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (phase === 'online') return null;

  const isOffline = phase === 'offline';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        // Sit above BottomNav (h-16 = 64px + safe area).
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)',
        zIndex: 9990,
        background: isOffline ? '#7F1D1D' : '#065F46',
        color: '#fff',
        borderRadius: 12,
        padding: '10px 14px',
        boxShadow: '0 10px 28px rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontSize: 13.5,
        fontWeight: 500,
        animation: 'caxtonNetIn 200ms ease-out',
      }}
    >
      <style>{`
        @keyframes caxtonNetIn {
          from { transform: translateY(120%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: isOffline ? '#F87171' : '#34D399',
          boxShadow: `0 0 0 3px ${isOffline ? 'rgba(248,113,113,0.25)' : 'rgba(52,211,153,0.25)'}`,
          flexShrink: 0,
        }}
      />
      <span style={{ flex: 1 }}>
        {isOffline ? 'You\u2019re offline. Some features won\u2019t work until you reconnect.' : 'Back online'}
      </span>
    </div>
  );
}
