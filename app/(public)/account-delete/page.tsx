import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Delete Your Account — Realty News Now',
  description:
    'How to request deletion of your Realty News Now account and associated data.',
};

export default function AccountDeletePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 prose prose-neutral">
      <h1>Delete Your Account</h1>
      <p>
        This page explains how to request deletion of your <strong>Realty News Now</strong>{' '}
        (also known as RealtyLine and Newsline) account and the data associated with it.
      </p>

      <h2>How to delete your account</h2>
      <ol>
        <li>
          Sign in at{' '}
          <Link href="/profile">https://realtynewsnow.app/profile</Link>
        </li>
        <li>Scroll to the <em>Delete Account</em> section at the bottom of the profile page</li>
        <li>Confirm your password to authorize the deletion</li>
        <li>Your account is deactivated immediately and permanently removed within 30 days</li>
      </ol>

      <h2>Alternative: request deletion by email</h2>
      <p>
        If you cannot sign in, email{' '}
        <a href="mailto:tawanna@myrealtyline.com?subject=Account%20Deletion%20Request">
          tawanna@myrealtyline.com
        </a>{' '}
        from the address on file. We respond within 5 business days.
      </p>

      <h2>What we delete</h2>
      <ul>
        <li>Your name, email address, phone number, and mailing address</li>
        <li>Your realtor license number (TREC or NMLS)</li>
        <li>Your birthday, title, and social handles</li>
        <li>Your subscription preferences</li>
        <li>Your saved listings and personalization data</li>
        <li>Your password hash and active sessions</li>
        <li>Magic-link tokens and email verification records</li>
      </ul>

      <h2>What we keep (and why)</h2>
      <ul>
        <li>
          <strong>Anonymized analytics events</strong> — no longer tied to your identity, retained
          for aggregate reporting.
        </li>
        <li>
          <strong>Advertising billing records</strong> (if you were an advertiser) — retained for
          7 years to comply with tax and financial recordkeeping laws.
        </li>
        <li>
          <strong>Audit logs</strong> containing only your account ID and timestamps of actions
          taken — retained for 90 days for security and abuse investigation.
        </li>
      </ul>

      <h2>Retention timeline</h2>
      <ul>
        <li><strong>Immediately:</strong> Account is deactivated and sign-in disabled</li>
        <li><strong>Within 30 days:</strong> Personal data permanently removed</li>
        <li><strong>Within 90 days:</strong> Backups scrubbed</li>
        <li><strong>7 years:</strong> Only anonymized billing records retained (advertisers only)</li>
      </ul>

      <p className="text-sm text-neutral-500">
        Contact <a href="mailto:tawanna@myrealtyline.com">tawanna@myrealtyline.com</a> with any
        questions.
      </p>
    </main>
  );
}
