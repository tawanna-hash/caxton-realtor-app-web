"use client";

import { useEffect } from 'react';
import PasswordSection from './PasswordSection';

type User = {
  email?: string;
  first_name?: string;
  last_name?: string;
  firstName?: string;
  lastName?: string;
  hasPassword?: boolean;
};

type Props = {
  user: User | null;
  accentColor?: string;
  onClose: () => void;
};

/**
 * Slide-up modal overlay containing the user's profile-level controls.
 * Today this is just the user's name/email; the file
 * exists as a home for future profile fields (notification preferences,
 * mailing address, etc.) without expanding the dashboard page further.
 */
export default function ProfilePanel({ user, accentColor = '#021D40', onClose }: Props) {
  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const first = user?.firstName || user?.first_name || '';
  const last = user?.lastName || user?.last_name || '';
  const fullName = `${first} ${last}`.trim() || 'Your account';

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[60] flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md sm:rounded-md rounded-t-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Profile"
      >
        <div
          className="px-5 py-4 sticky top-0 z-10 flex items-center justify-between"
          style={{ backgroundColor: accentColor }}
        >
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.2em] text-white/70">My Profile</p>
            <p className="text-base text-white font-medium truncate">{fullName}</p>
            {user?.email && (
              <p className="text-xs text-white/60 font-light truncate">{user.email}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close profile"
            className="text-white text-2xl leading-none px-2 -mr-2 shrink-0"
          >
            &times;
          </button>
        </div>

        <div className="p-5 space-y-5">
          <PasswordSection accentColor={accentColor} hasPassword={!!user?.hasPassword} />

          <p className="text-xs text-gray-400 font-light text-center">
            More profile settings coming soon.
          </p>
        </div>
      </div>
    </div>
  );
}
