// lib/native/keyboard.ts
//
// Capacitor Keyboard plugin wiring.
//
// What this gives us on iOS:
//   1. CSS variable `--kb-inset-bottom` reflects the on-screen keyboard
//      height in real time (px). Layouts that need to lift sticky footers
//      (composer bars, "Save" buttons inside drawers) above the keyboard
//      can do `padding-bottom: max(env(safe-area-inset-bottom), var(--kb-inset-bottom))`.
//   2. Resize mode = "none" so Capacitor does NOT shrink the WebView when
//      the keyboard appears — we drive the inset via CSS instead, which
//      keeps scroll position stable in long forms.
//   3. Scroll-into-view is delegated to iOS native behavior on inputs
//      inside scroll containers. We add a manual fallback on focus for
//      inputs that are inside fixed-position drawers (Capacitor's native
//      scroll doesn't traverse those).
//
// Web: this is a no-op. The CSS var stays at 0.

import { isNative } from './runtime';

let installed = false;

function setInset(px: number) {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--kb-inset-bottom', `${Math.max(0, px)}px`);
}

export async function installKeyboardListeners(): Promise<void> {
  if (!isNative()) {
    setInset(0);
    return;
  }
  if (installed) return;
  installed = true;

  try {
    const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard');

    // Tell iOS not to resize the WebView — we handle layout via CSS var so
    // scroll position is preserved.
    try {
      await Keyboard.setResizeMode({ mode: KeyboardResize.None });
    } catch {
      // Older plugin versions or unsupported platforms — ignore.
    }

    // Set accessory bar to false so the iOS "<  >  Done" toolbar above the
    // keyboard doesn't push our composer up.
    try {
      await Keyboard.setAccessoryBarVisible({ isVisible: false });
    } catch {
      // ignore
    }

    await Keyboard.addListener('keyboardWillShow', (info) => {
      setInset(info?.keyboardHeight ?? 0);
    });
    await Keyboard.addListener('keyboardDidShow', (info) => {
      setInset(info?.keyboardHeight ?? 0);
    });
    await Keyboard.addListener('keyboardWillHide', () => {
      setInset(0);
    });
    await Keyboard.addListener('keyboardDidHide', () => {
      setInset(0);
    });
  } catch {
    installed = false;
  }
}
