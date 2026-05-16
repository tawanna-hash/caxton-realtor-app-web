"use client";

import { useState } from 'react';
import { getApiBase } from '@/lib/api-base';

const API = getApiBase();

type Props = {
  /** Brand color for the primary button. */
  accentColor?: string;
  /** Whether the user already has a password set. Toggles UI between
   *  "Set a password" (first time) and "Change password" (subsequent). */
  hasPassword: boolean;
};

export default function PasswordSection({ accentColor = '#1a2a44', hasPassword }: Props) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // Local override so the UI flips to "Change password" immediately after
  // a first-time set without needing the user to refresh.
  const [passwordExists, setPasswordExists] = useState(hasPassword);

  async function handleSubmit() {
    setError(null);
    setInfo(null);
    if (!newPassword || newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (passwordExists && !currentPassword) {
      setError('Enter your current password to change it');
      return;
    }

    setLoading(true);
    try {
      const body: { newPassword: string; currentPassword?: string } = { newPassword };
      if (passwordExists) {
        body.currentPassword = currentPassword;
      }
      const res = await fetch(`${API}/auth/set-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Could not update password (HTTP ${res.status})`);
      }
      setInfo(passwordExists ? 'Password changed' : 'Password set');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordExists(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not update password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg p-5 bg-white">
      <h3 className="text-base font-semibold text-gray-900 mb-1">
        {passwordExists ? 'Change password' : 'Set a password'}
      </h3>
      <p className="text-sm text-gray-500 font-light mb-4">
        {passwordExists
          ? 'Update the password you use to sign in.'
          : 'Add a password so you can sign in without waiting for a magic link.'}
      </p>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2 mb-3">
          {error}
        </div>
      )}
      {info && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-100 rounded px-3 py-2 mb-3">
          {info}
        </div>
      )}

      {passwordExists && (
        <>
          <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1.5">Current password</label>
          <input
            type={showPassword ? 'text' : 'password'}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm text-gray-900 mb-3"
            autoComplete="current-password"
            disabled={loading}
          />
        </>
      )}

      <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1.5">New password</label>
      <input
        type={showPassword ? 'text' : 'password'}
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm text-gray-900 mb-3"
        autoComplete="new-password"
        disabled={loading}
        placeholder="At least 8 characters"
      />

      <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1.5">Confirm new password</label>
      <input
        type={showPassword ? 'text' : 'password'}
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm text-gray-900 mb-3"
        autoComplete="new-password"
        disabled={loading}
      />

      <label className="flex items-center gap-2 text-xs text-gray-500 mb-3">
        <input
          type="checkbox"
          checked={showPassword}
          onChange={(e) => setShowPassword(e.target.checked)}
          className="accent-gray-700"
        />
        Show passwords
      </label>

      <button
        onClick={handleSubmit}
        disabled={loading || !newPassword || !confirmPassword || (passwordExists && !currentPassword)}
        className="w-full py-3 text-sm font-medium uppercase tracking-wider text-white rounded disabled:opacity-50"
        style={{ backgroundColor: accentColor }}
      >
        {loading ? 'Updating\u2026' : passwordExists ? 'Change password' : 'Set password'}
      </button>
    </div>
  );
}
