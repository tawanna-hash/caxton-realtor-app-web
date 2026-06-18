"use client";

import { useState, useEffect, useCallback } from 'react';
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthnAutofill,
} from '@simplewebauthn/browser';
import { trackEvent } from '../app/posthog-provider';
import { getApiBase } from '@/lib/api-base';

const API = getApiBase();

type Credential = {
  id: string;
  deviceName: string | null;
  authenticatorType: 'platform' | 'cross-platform' | null;
  createdAt: string;
  lastUsedAt: string | null;
};

type Props = {
  /** Brand color for the primary "Add passkey" button. */
  accentColor?: string;
};

function fmt(ts: string | null): string {
  if (!ts) return 'Never';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  // Today / Yesterday / specific date
  const now = new Date();
  const ms = now.getTime() - d.getTime();
  if (ms < 60_000) return 'Just now';
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3600_000)}h ago`;
  if (ms < 7 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d ago`;
  return d.toLocaleDateString();
}

function defaultDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'This device';
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Mac/i.test(ua)) return 'Mac';
  if (/Android/i.test(ua)) return 'Android device';
  if (/Windows/i.test(ua)) return 'Windows device';
  return 'This device';
}

/**
 * Manage WebAuthn passkeys for the logged-in user.
 * Lists existing credentials, lets the user enroll a new one (calls the OS
 * biometric prompt), and revoke any of them.
 *
 * Renders nothing visible on browsers that don't support WebAuthn — we hide
 * the section entirely rather than show a broken/disabled UI.
 */
export default function PasskeysPanel({ accentColor = '#021D40' }: Props) {
  const [creds, setCreds] = useState<Credential[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState('');
  const [supported, setSupported] = useState<boolean | null>(null);

  // Check WebAuthn support on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setSupported(typeof window.PublicKeyCredential === 'function');
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/auth/webauthn/credentials`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Failed to load passkeys (HTTP ${res.status})`);
      }
      const data = await res.json();
      setCreds(data.credentials ?? []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not load passkeys';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (supported === true) {
      void refresh();
    }
  }, [supported, refresh]);

  const handleEnroll = useCallback(async () => {
    setError(null);
    setInfo(null);
    setEnrolling(true);
    try {
      // Step 1: get options from server
      const beginRes = await fetch(`${API}/auth/webauthn/register/begin`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!beginRes.ok) {
        const data = await beginRes.json().catch(() => ({}));
        throw new Error(data.error || `Could not start enrollment (HTTP ${beginRes.status})`);
      }
      const { options } = await beginRes.json();

      // Step 2: invoke browser ceremony — this is what triggers the OS biometric prompt
      const attestation = await startRegistration(options);

      // Step 3: send the attestation back to verify + store
      const label = deviceName.trim() || defaultDeviceLabel();
      const finishRes = await fetch(`${API}/auth/webauthn/register/finish`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: attestation, deviceName: label }),
      });
      if (!finishRes.ok) {
        const data = await finishRes.json().catch(() => ({}));
        throw new Error(data.error || `Could not finish enrollment (HTTP ${finishRes.status})`);
      }

      trackEvent('passkey_enrolled', { deviceLabel: label });
      setInfo(`Passkey saved as "${label}"`);
      setDeviceName('');
      await refresh();
    } catch (e: unknown) {
      // Distinguish user-cancellation from real errors
      const msg = e instanceof Error ? e.message : 'Passkey enrollment failed';
      if (/cancell|abort|NotAllow/i.test(msg)) {
        setError('Passkey setup cancelled');
      } else {
        setError(msg);
      }
      trackEvent('passkey_enroll_failed', { reason: msg.slice(0, 200) });
    } finally {
      setEnrolling(false);
    }
  }, [deviceName, refresh]);

  const handleDelete = useCallback(
    async (credId: string, label: string | null) => {
      const shown = label || 'this passkey';
      if (typeof window !== 'undefined' && !window.confirm(`Remove ${shown}? You can always set it up again.`)) {
        return;
      }
      setError(null);
      setInfo(null);
      try {
        const res = await fetch(`${API}/auth/webauthn/credentials/${credId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Could not delete (HTTP ${res.status})`);
        }
        trackEvent('passkey_deleted', { credentialId: credId });
        setInfo(`Removed ${shown}`);
        await refresh();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Could not remove passkey';
        setError(msg);
      }
    },
    [refresh],
  );

  // Hide the whole section on unsupported browsers.
  if (supported === false) {
    return null;
  }
  if (supported === null) {
    return null; // initial check still running
  }

  return (
    <div className="border border-gray-200 rounded-md p-5 bg-white">
      <h3 className="text-base font-semibold text-gray-900 mb-1">Passkeys</h3>
      <p className="text-sm text-gray-500 font-light mb-4">
        Sign in faster with your fingerprint, face, or device PIN — no email needed.
      </p>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2 mb-3">
          {error}
        </div>
      )}
      {info && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2 mb-3">
          {info}
        </div>
      )}

      <div className="mb-4">
        <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1.5">Device label (optional)</label>
        <input
          type="text"
          placeholder={defaultDeviceLabel()}
          value={deviceName}
          onChange={(e) => setDeviceName(e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm text-gray-900"
          disabled={enrolling}
        />
        <button
          onClick={handleEnroll}
          disabled={enrolling}
          className="mt-3 w-full py-3 text-sm font-medium uppercase tracking-wider text-white rounded-md disabled:opacity-50"
          style={{ backgroundColor: accentColor }}
        >
          {enrolling ? 'Setting up…' : 'Add a passkey'}
        </button>
      </div>

      <div className="pt-4 border-t border-gray-100">
        <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Your passkeys</p>
        {loading && <p className="text-sm text-gray-400 font-light">Loading…</p>}
        {!loading && creds && creds.length === 0 && (
          <p className="text-sm text-gray-400 font-light italic">No passkeys yet.</p>
        )}
        {!loading && creds && creds.length > 0 && (
          <ul className="space-y-2.5">
            {creds.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-900 truncate">{c.deviceName || 'Unnamed device'}</p>
                  <p className="text-xs text-gray-400 font-light">
                    Added {fmt(c.createdAt)} · Last used {fmt(c.lastUsedAt)}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(c.id, c.deviceName)}
                  className="text-xs text-red-600 underline-offset-2 hover:underline shrink-0 mt-0.5"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Re-export the simplewebauthn helpers the login screen needs so we don't
// duplicate the @simplewebauthn/browser import path.
export { startAuthentication, browserSupportsWebAuthnAutofill };
