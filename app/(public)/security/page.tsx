export const metadata = {
  title: 'Security | Closing Time',
  description: 'How Closing Time protects accounts and deal data, and what we do not claim yet.',
};

const IN_PLACE = [
  ['Encrypted connections', 'All traffic uses HTTPS.'],
  ['Password storage', 'Passwords are stored as one-way bcrypt hashes. We never see or store your password.'],
  ['Two-step sign-in', 'Turn on an authenticator app code in Closing Time under Resources, Security. Recovery codes are provided and each works once.'],
  ['Sessions', 'Sign-in cookies are marked HTTP-only and secure, and cannot be read by page scripts.'],
  ['Abuse protection', 'Sign-in and account requests are rate limited. Requests that change security settings, API keys, webhooks, imports and backups are checked against allowed origins, and sign-in cookies use SameSite protection.'],
  ['Your own data only', 'Every request is tied to your signed-in account. API keys are shown once, stored as hashes, and can be revoked at any time.'],
  ['Signed webhooks', 'Every webhook message is signed with a secret only you hold, so your system can confirm it came from Closing Time.'],
  ['Audit trail', 'Deal changes, documents, requests and messages are recorded in a time-stamped activity history.'],
  ['Backups and export', 'Monthly backups and full exports in open formats are available from Data And Backups.'],
];

const NOT_YET = [
  'SOC 2 or other third-party certification. We have not been audited and do not claim to be.',
  'An independent penetration test. None has been done yet.',
  'Two-step sign-in is optional. It is not yet required for every account.',
];

export default function SecurityPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-[#1B1726]">
      <h1 className="font-serif text-3xl text-[#301D5D]">Security</h1>
      <p className="mt-3 text-[15px] text-[#4A4757]">Closing Time handles contracts, dates and client contact details. This page lists what protects them today and what we do not claim yet.</p>

      <h2 className="mt-8 text-[14px] font-semibold">In Place Today</h2>
      <dl className="mt-3 divide-y divide-[#E6E5EC] rounded-lg border border-[#E6E5EC]">
        {IN_PLACE.map(([t, d]) => (
          <div key={t} className="px-4 py-3">
            <dt className="text-[14px] font-semibold">{t}</dt>
            <dd className="mt-0.5 text-[14px] text-[#4A4757]">{d}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-8 text-[14px] font-semibold">Not Yet</h2>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-[14px] text-[#4A4757]">
        {NOT_YET.map((t) => <li key={t}>{t}</li>)}
      </ul>

      <h2 className="mt-8 text-[14px] font-semibold">Report A Concern</h2>
      <p className="mt-2 text-[14px] text-[#4A4757]">Email <a className="underline text-[#301D5D]" href="mailto:tawanna@myrealtyline.com">tawanna@myrealtyline.com</a>. Please include steps to reproduce.</p>
    </main>
  );
}
