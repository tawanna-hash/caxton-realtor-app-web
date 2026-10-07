import { LegalPage, Ul, LEGAL_COMPANY, LEGAL_EMAIL } from '../_legal';

export const metadata = {
  title: 'Privacy Policy | Closing Time',
  description: 'What Closing Time collects, why, who sees it, and the choices you have.',
};

export default function Page() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={<p>Closing Time is a workspace for Texas real estate agents to track deadlines, forms, signing, scheduling and closing coordination. It is operated by {LEGAL_COMPANY} (&ldquo;we,&rdquo; &ldquo;us&rdquo;). This policy explains what we collect, how we use it, and your choices.</p>}
      sections={[
        { title: 'What We Collect', body: (<>
          <p>We collect only what is needed to run the service:</p>
          <Ul items={[
            <><strong>Account details:</strong> name, email address, password (stored only as a one-way hash), license information and brokerage you provide.</>,
            <><strong>Deal information you enter:</strong> property addresses, contract dates and terms, names, emails and phone numbers of your clients and of service providers such as lenders, title companies and inspectors.</>,
            <><strong>Documents and records:</strong> files you upload or generate, form entries, signatures, signing records, tasks, reminders and an activity history of changes.</>,
            <><strong>Connections you turn on:</strong> calendar, email or file-storage accounts you choose to connect. We use them only for the feature you enabled.</>,
            <><strong>Messages:</strong> email and text messages sent through Closing Time, and records of delivery and consent.</>,
            <><strong>Usage and device data:</strong> pages viewed, features used, browser and device type, and error reports, collected through analytics tools to improve reliability.</>,
          ]} />
        </>) },
        { title: 'Your Clients\u2019 Information', body: (<p>You decide what client information to enter. You are responsible for having the right to enter it and to share it with the people you invite. We handle that information on your behalf to provide the service and do not use it for our own marketing.</p>) },
        { title: 'How We Use Information', body: (<Ul items={[
          'To provide, secure and support the service, including deadline alerts, signing, scheduling and client portals.',
          'To send messages you or your workflow ask us to send, and service notices about your account.',
          'To keep records and audit trails you can export, and to back up your data.',
          'To detect abuse, fix errors and improve the product.',
          'To comply with law and enforce our terms.',
        ]} />) },
        { title: 'We Do Not Sell Your Information', body: (<p>We do not sell your personal information or your clients\u2019 information, and we do not share it for advertising.</p>) },
        { title: 'Who Helps Us Run The Service', body: (<>
          <p>We use service providers that process data for us under their own security commitments:</p>
          <Ul items={[
            'Vercel for hosting.',
            'Neon for our database.',
            'Resend for sending email.',
            'Telnyx for text messages.',
            'PostHog for product analytics.',
            'Google, Dropbox and similar services, only if you connect them.',
            'Stripe for payments, if you subscribe to a paid plan. We do not store card numbers.',
          ]} />
          <p>We may also disclose information when required by law, to protect rights and safety, or in a merger or sale of the business, with notice to you.</p>
        </>) },
        { title: 'Text Messages', body: (<>
          <p>Closing Time sends text messages such as deadline alerts and scheduling confirmations only to people who have agreed to receive them. Message frequency varies with your deals. Message and data rates may apply. Reply STOP to opt out at any time and HELP for help. Consent to texts is not a condition of buying anything.</p>
          <p>No mobile information is shared with third parties or affiliates for marketing or promotional purposes. Text opt-in data and consent are not shared with anyone except the carriers and providers needed to deliver the messages.</p>
        </>) },
        { title: 'How Long We Keep Information', body: (<p>We keep your data while your account is open. Closed deals are locked and kept so you can meet record-keeping duties. Texas brokers must keep transaction records for at least four years, and you can export your records at any time. Backups are kept for up to 12 months. When you delete a deal or close your account, we remove it from active systems, and it may remain in backups until they expire.</p>) },
        { title: 'Your Choices', body: (<Ul items={[
          'Export your deals, contacts and backups from Resources, Data And Backups.',
          'Turn on two-step sign-in under Resources, Security.',
          'Disconnect any connected account at any time.',
          'Ask us to correct or delete your data by emailing us. We will respond within 45 days.',
        ]} />) },
        { title: 'Security', body: (<p>We use encrypted connections, hashed passwords, access limited to your account, two-step sign-in and an activity history. See our <a className="underline text-[#301D5D]" href="/security">Security page</a> for what is and is not in place. No system is perfectly secure. If a breach affects your information, we will notify you as required by Texas law.</p>) },
        { title: 'Children', body: (<p>Closing Time is for licensed professionals and is not directed to anyone under 18.</p>) },
        { title: 'Changes', body: (<p>We will post changes here and update the date above. For material changes we will also notify account holders by email.</p>) },
        { title: 'Contact', body: (<p>Email <a className="underline text-[#301D5D]" href={`mailto:${LEGAL_EMAIL}?subject=Privacy%20Request`}>{LEGAL_EMAIL}</a> for any privacy request or question.</p>) },
      ]}
    />
  );
}
