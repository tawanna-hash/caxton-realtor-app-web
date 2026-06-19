// lib/native/haptics.ts
//
// Native haptic feedback wrappers. Each call is a fire-and-forget no-op on
// web — we only invoke the Capacitor plugin when we know the app is running
// natively, so the bundle on realtynewsnow.app never tries to import the
// platform-specific code paths in a way that would break SSR.

import { isNative } from './runtime';

type ImpactStyle = 'light' | 'medium' | 'heavy';

async function impact(style: ImpactStyle): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle: Style } = await import('@capacitor/haptics');
    const map = { light: Style.Light, medium: Style.Medium, heavy: Style.Heavy };
    await Haptics.impact({ style: map[style] });
  } catch {
    // Plugin missing or call failed — swallow. Haptics are a nice-to-have.
  }
}

export const haptics = {
  /** Subtle tap — buttons, chip selection, list rows. */
  light: () => impact('light'),
  /** Confirmation feedback — sign-in success, save, refresh complete. */
  medium: () => impact('medium'),
  /** Heavy thunk — destructive or major actions. Use sparingly. */
  heavy: () => impact('heavy'),
  /** Success / warning / error notification feedback. */
  async notify(type: 'success' | 'warning' | 'error'): Promise<void> {
    if (!isNative()) return;
    try {
      const { Haptics, NotificationType } = await import('@capacitor/haptics');
      const map = {
        success: NotificationType.Success,
        warning: NotificationType.Warning,
        error: NotificationType.Error,
      };
      await Haptics.notification({ type: map[type] });
    } catch {
      /* ignore */
    }
  },
  /** Selection-change tick — picker scrolling, segmented control. */
  async selection(): Promise<void> {
    if (!isNative()) return;
    try {
      const { Haptics } = await import('@capacitor/haptics');
      await Haptics.selectionChanged();
    } catch {
      /* ignore */
    }
  },
};
