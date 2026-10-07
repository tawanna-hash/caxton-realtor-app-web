import { LegalPage, Ul } from '../_legal';

export const metadata = {
  title: 'Text Messaging Terms | Closing Time',
  description: 'How Closing Time text messages work, how people agree to them, and how to stop them.',
};

export default function Page() {
  return (
    <LegalPage
      title="Text Messaging Terms"
      intro={<p>Closing Time sends text messages about real estate transactions. This page explains who receives them, how consent works and how to stop them. See also our <a className="underline text-[#301D5D]" href="/privacy">Privacy Policy</a> and <a className="underline text-[#301D5D]" href="/terms">Terms Of Service</a>.</p>}
      sections={[
        { title: 'Program', body: (<p>Closing Time Transaction Alerts. Closing Time is operated by Caxton Publications, Inc. Messages are sent for a licensed real estate agent who uses Closing Time to manage a transaction.</p>) },
        { title: 'Who Gets Texts And How They Agree', body: (<Ul items={[
          <><strong>Agents:</strong> an agent turns on deadline alerts in Closing Time under Settings, Notifications, enters a mobile number and checks the box labeled Send Deadline Alerts By Text. Agreeing to text alerts is optional and not required to use Closing Time.</>,
          <><strong>People on a deal (clients, lenders, title companies):</strong> the agent can ask a person on the deal to agree to text updates. The person receives one text asking them to reply YES. No other text is sent to that person until they reply YES.</>,
        ]} />) },
        { title: 'Message Types And Frequency', body: (<p>Deadline reminders, scheduling and closing confirmations, document requests and deal updates. Frequency varies with the number of transactions, usually a few messages per deal per week. Message and data rates may apply.</p>) },
        { title: 'Examples', body: (<Ul items={[
          'Closing Time: Option Period ends in 3 days (Oct 12). Property: 9904 Whitley Bay Dr. Reply STOP to opt out.',
          '9904 Whitley Bay Dr: Jane Agent would like to text you updates about this deal. Reply YES to agree. Reply STOP to opt out. Msg and data rates may apply.',
          '9904 Whitley Bay Dr: Closing is confirmed for Oct 30 at 10:00 AM at Capitol Title. Reply STOP to opt out.',
        ]} />) },
        { title: 'Stop Or Get Help', body: (<p>Reply STOP at any time to stop all messages from this number. Reply START or YES to resume. Reply HELP for help, or email hello@myrealtyline.com. Carriers are not liable for delayed or undelivered messages.</p>) },
        { title: 'Your Information', body: (<p>We do not sell, trade or transfer your personal information, including your phone number and text consent, to outside parties for marketing. No mobile information is shared with third parties or affiliates for marketing or promotional purposes.</p>) },
      ]}
    />
  );
}
