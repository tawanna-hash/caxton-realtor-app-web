// lib/native/status-bar.ts
//
// Capacitor StatusBar helper — keeps the iOS status bar (battery / clock /
// signal) styled to match the current Tailwind theme. Without this, a
// brand color route gets dark text on a brand-colored bar (unreadable).
//
// Static imports per the project rule for Capacitor plugins (dynamic
// imports broke the push plugin in 8e7df2c — same applies here).
//
// Default (matches capacitor.config.ts plugin defaults):
//   style:  LIGHT   (light text on dark background — for the brand purple)
//   color:  #301D5D (Caxton purple)
//
// Callers:
//   - `setStatusBarTheme('dark')`  → dark text on light bar (white pages)
//   - `setStatusBarTheme('light')` → light text on dark bar  (brand pages)
//   - `setStatusBarTheme('auto')`  → reads prefers-color-scheme
//
// On web everything is a no-op.

import { StatusBar, Style } from '@capacitor/status-bar';
import { isNative } from './runtime';

export type StatusBarTheme = 'light' | 'dark' | 'auto';

const DEFAULT_BRAND = '#301D5D';
const DEFAULT_LIGHT_BG = '#FFFFFF';

function resolveAuto(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'dark';
  } catch {
    return 'light';
  }
}

/**
 * Apply a status-bar theme. `style` is the *text* color: `light` text means
 * a dark background, `dark` text means a light background.
 *
 * @param theme  Light/dark/auto. Auto picks based on prefers-color-scheme.
 * @param backgroundColor  Optional override. Defaults to brand purple for
 *                         light theme, white for dark theme.
 */
export async function setStatusBarTheme(
  theme: StatusBarTheme,
  backgroundColor?: string,
): Promise<void> {
  if (!isNative()) return;
  const resolved = theme === 'auto' ? resolveAuto() : theme;
  const bg = backgroundColor ?? (resolved === 'light' ? DEFAULT_BRAND : DEFAULT_LIGHT_BG);

  try {
    await StatusBar.setStyle({ style: resolved === 'light' ? Style.Light : Style.Dark });
    // setBackgroundColor is Android-only at runtime but iOS ignores it silently.
    await StatusBar.setBackgroundColor({ color: bg }).catch(() => {});
  } catch {
    // Plugin missing / call failed — non-fatal.
  }
}
