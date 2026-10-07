import { LegalPage, Ul, Caps } from '../_legal';

export const metadata = {
  title: 'Important Notices | Closing Time',
  description: 'What Closing Time does and does not do, and what you remain responsible for.',
};

export default function Page() {
  return (
    <LegalPage
      title="Important Notices"
      intro={<p>Closing Time helps you stay organized. It does not replace your judgment, your contract or your broker. Please read these notices.</p>}
      sections={[
        { title: 'Not Legal Advice', body: (<p>Nothing in Closing Time is legal, tax or financial advice. We are not a law firm and are not a party to your transactions. Ask your broker or an attorney when you are unsure.</p>) },
        { title: 'Check Every Deadline', body: (<Ul items={[
          'Deadlines are calculated from the dates and terms you enter. A wrong or missing entry produces a wrong deadline.',
          'Weekend, holiday and time-of-day rules in your contract may differ from what Closing Time shows. Always confirm against the signed contract and any amendments.',
          'Verify that every contract change or extension was entered.',
        ]} />) },
        { title: 'Forms', body: (<Ul items={[
          'Forms are tools to help you complete paperwork. Confirm that you are using the current official version from the Texas Real Estate Commission or your broker.',
          'You are responsible for the content of every form you complete, send or sign.',
          'Texas REALTORS forms are not provided in Closing Time.',
        ]} />) },
        { title: 'Alerts And Messages', body: (<p>Email, text and push alerts can be delayed, blocked or not delivered. Do not rely on them as your only reminder. Calendar syncing depends on the connected service.</p>) },
        { title: 'Automated And Extracted Content', body: (<p>Features that read documents or suggest dates and wording can make mistakes. Review every result before you use it.</p>) },
        { title: 'Signatures And Identity', body: (<p>We record signing events but do not confirm who a signer is or that they have authority to sign. Confirm that each document may be signed electronically and that signers agree to do so.</p>) },
        { title: 'Your Records', body: (<p>You are responsible for keeping the records that Texas law and your broker require. Export your data regularly from Resources, Data And Backups.</p>) },
        { title: 'Acknowledgment And Release', body: (<Caps>BY USING CLOSING TIME, YOU AGREE THAT YOU ARE SOLELY RESPONSIBLE FOR YOUR TRANSACTIONS AND DEADLINES, AND YOU RELEASE CAXTON PUBLICATIONS, INC. AND ITS OWNERS, OFFICERS, EMPLOYEES AND CONTRACTORS FROM CLAIMS FOR LOSSES THAT ARISE FROM YOUR USE OF THE SERVICE, INCLUDING LOSSES CAUSED BY THEIR OWN NEGLIGENCE, AS DESCRIBED IN THE TERMS OF SERVICE. THIS DOES NOT COVER GROSS NEGLIGENCE OR INTENTIONAL MISCONDUCT.</Caps>) },
      ]}
    />
  );
}
