'use client';

// ThemeProvider — Modern News redesign (June 2026)
//
// Lean homegrown theme system, no external deps. Manages light/dark/system
// modes and applies the `.dark` class to <html> so Tailwind's class-strategy
// dark utilities (e.g. `dark:bg-zinc-900`) and the CSS variables in
// globals.css (`--surface-1`, etc.) flip in lockstep.
//
// Persistence: writes to localStorage under 'rnn:theme' so the preference
// survives reload. A small bootstrap script in <head> applies the class
// before paint to avoid the white-flash on dark-mode users.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

type ThemeCtx = {
  theme: ThemeMode;
  resolved: ResolvedTheme;
  setTheme: (mode: ThemeMode) => void;
  toggle: () => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

const STORAGE_KEY = 'rnn:theme';

function getSystem(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyClass(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Initial state must be deterministic for SSR — always 'system'. The
  // bootstrap script in <head> handles the pre-paint class application.
  const [theme, setThemeState] = useState<ThemeMode>('system');
  const [resolved, setResolved] = useState<ResolvedTheme>('light');

  // Read stored preference on mount.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setThemeState(stored);
      }
    } catch {
      // localStorage blocked — silently fall through to 'system'.
    }
  }, []);

  // Recompute resolved theme whenever mode changes or OS preference flips.
  useEffect(() => {
    const compute = () => {
      const next: ResolvedTheme = theme === 'system' ? getSystem() : theme;
      setResolved(next);
      applyClass(next);
    };
    compute();

    if (theme === 'system' && typeof window !== 'undefined') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = () => compute();
      mq.addEventListener?.('change', onChange);
      return () => mq.removeEventListener?.('change', onChange);
    }
  }, [theme]);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  }, []);

  const toggle = useCallback(() => {
    // Two-state toggle: flips between resolved light <-> dark, ignoring
    // 'system' as a destination. If the user is on system, we promote them
    // to the opposite of whatever the OS is currently showing.
    setTheme(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved, setTheme]);

  const value = useMemo<ThemeCtx>(
    () => ({ theme, resolved, setTheme, toggle }),
    [theme, resolved, setTheme, toggle],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const v = useContext(Ctx);
  if (!v) {
    // Safe fallback so a forgotten provider doesn't crash a page.
    return { theme: 'system', resolved: 'light', setTheme: () => {}, toggle: () => {} };
  }
  return v;
}

// Inline script that runs in <head> BEFORE React hydration. Avoids the
// dreaded flash-of-light-mode for users who prefer dark. Stringify and inject
// via dangerouslySetInnerHTML in layout.tsx.
export const THEME_INIT_SCRIPT = `
(function(){try{
  var k='${STORAGE_KEY}';
  var s=localStorage.getItem(k);
  var sys=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
  var resolved=(s==='dark'||s==='light')?s:sys;
  if(resolved==='dark'){document.documentElement.classList.add('dark');}
}catch(e){}})();
`;
