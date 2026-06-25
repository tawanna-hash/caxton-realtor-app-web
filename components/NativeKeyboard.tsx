'use client';

// components/NativeKeyboard.tsx
//
// Mount-once bootstrap for the iOS keyboard listeners (see
// lib/native/keyboard.ts). On web this is a cheap no-op.
//
// Why a component instead of inlining in AppShell:
//   - app/layout.tsx covers all routes including admin/portal which use
//     their own shells. Mounting here keeps the install site at the root.

import { useEffect } from 'react';
import { installKeyboardListeners } from '@/lib/native/keyboard';

export default function NativeKeyboard() {
  useEffect(() => {
    void installKeyboardListeners();
  }, []);

  return null;
}
