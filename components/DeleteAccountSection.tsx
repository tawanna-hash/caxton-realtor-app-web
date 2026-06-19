"use client";

/**
 * DeleteAccountSection — in-app account deletion UI.
 *
 * Required by App Store Review Guideline 5.1.1(v): an app that supports
 * account creation must offer in-app account deletion.
 *
 * Flow:
 *   1. Profile screen shows a "Delete account" button in a danger-styled
 *      card with a short explanation of what gets deleted.
 *   2. Tapping the button opens a confirmation modal that explains the
 *      action is permanent and lists what is removed.
 *   3. The user must type their account email exactly (case-insensitive)
 *      to enable the final "Permanently delete" button.
 *   4. On success the server clears the session cookie; the client clears
 *      local storage and redirects to "/".
 *
 * No external dependencies — uses only the API base + plain fetch like the
 * surrounding profile sections.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBase } from '@/lib/api-base';

const API = getApiBase();

type Props = {
  /** Brand accent color used on confirmation copy. */
  accentColor?: string;
  /** The signed-in user's email. Required for the type-to-confirm field. */
  email: string;
};

export default function DeleteAccountSection({ accentColor = '#021D40', email }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedEmail = email.trim().toLowerCase();
  const matches = typed.trim().toLowerCase() === normalizedEmail && normalizedEmail.length > 0;

  function close() {
    if (loading) return;
    setOpen(false);
    setTyped('');
    setError(null);
  }

  async function handleDelete() {
    if (!matches || loading) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/auth/account`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmEmail: typed.trim() }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data?.error || `Failed to delete account (HTTP ${r.status})`);
      }
      // Best-effort: clear any client-side state that ties to the account.
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('caxton_session');
          window.localStorage.removeItem('caxton_saved_articles');
        }
      } catch {
        /* ignore */
      }
      // Server already cleared the session cookie. Send the user home.
      router.replace('/?account_deleted=1');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete account');
      setLoading(false);
    }
  }

  return (
    <>
      <section className="rounded-md border border-red-200 bg-red-50/40 p-4">
        <h2 className="text-sm font-medium text-red-900 mb-1">Delete account</h2>
        <p className="text-xs text-red-900/70 font-light mb-3">
          Permanently delete your account and all associated data, including saved
          articles, sign-in passkeys, push subscriptions, and notification
          preferences. This cannot be undone.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs font-medium text-red-700 underline underline-offset-2 hover:text-red-900"
        >
          Delete my account
        </button>
      </section>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
          onClick={close}
        >
          <div
            className="w-full sm:max-w-md bg-white rounded-t-lg sm:rounded-lg shadow-xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3
                id="delete-account-title"
                className="text-base font-medium"
                style={{ color: accentColor }}
              >
                Permanently delete account?
              </h3>
              <p className="text-xs text-gray-600 font-light mt-2">
                This will immediately and permanently remove:
              </p>
              <ul className="text-xs text-gray-700 font-light mt-2 ml-4 list-disc space-y-1">
                <li>Your profile and sign-in credentials</li>
                <li>Saved articles, reading history, and preferences</li>
                <li>Passkeys and password</li>
                <li>Push notification subscriptions</li>
                <li>Giveaway entries you have submitted</li>
              </ul>
              <p className="text-xs text-gray-600 font-light mt-3">
                This cannot be undone. If you sign up again later you will start
                with a fresh, empty account.
              </p>
            </div>

            <div>
              <label className="block text-xs text-gray-700 mb-1">
                Type your email <span className="font-medium">{email}</span> to confirm:
              </label>
              <input
                type="email"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                placeholder={email}
                disabled={loading}
              />
            </div>

            {error && (
              <p className="text-xs text-red-700" role="alert">
                {error}
              </p>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={close}
                disabled={loading}
                className="px-4 py-2 rounded-md text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!matches || loading}
                className="px-4 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? 'Deleting…' : 'Permanently delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
