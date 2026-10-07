import { LegalPage, Ul, Caps, LEGAL_COMPANY } from '../_legal';

export const metadata = {
  title: 'Terms Of Service | Closing Time',
  description: 'The agreement for using Closing Time, including limits of liability and a release.',
};

export default function Page() {
  return (
    <LegalPage
      title="Terms Of Service"
      intro={<p>These terms are an agreement between you and {LEGAL_COMPANY} (&ldquo;we,&rdquo; &ldquo;us&rdquo;) for Closing Time. By creating an account or using the service you agree to them. If you do not agree, do not use Closing Time.</p>}
      sections={[
        { title: 'What Closing Time Is', body: (<p>Closing Time is an organizing tool for Texas real estate agents. It helps you track deadlines, fill and send forms, collect signatures, schedule appointments and coordinate with title companies and clients. It is not a law firm, a brokerage or a substitute for your broker\u2019s supervision. We are not affiliated with or endorsed by the Texas Real Estate Commission or Texas REALTORS.</p>) },
        { title: 'Who May Use It', body: (<p>You must be 18 or older and use Closing Time for business purposes. Early access may be limited to invited accounts, and we may change who can use it.</p>) },
        { title: 'Your Account', body: (<p>Keep your sign-in details private and turn on two-step sign-in. You are responsible for activity under your account. Tell us right away if you suspect unauthorized use.</p>) },
        { title: 'Your Content', body: (<>
          <p>You own the deal information, documents and other content you put into Closing Time. You give us permission to store, process, display and send it as needed to run the service for you and the people you invite. You promise that you have the right to enter it, including your clients\u2019 information, and that you will follow the laws and the broker rules that apply to you.</p>
        </>) },
        { title: 'Acceptable Use', body: (<Ul items={[
          'Do not break the law, infringe rights, or send spam or unwanted texts.',
          'Do not message anyone who has not agreed to be contacted.',
          'Do not try to break, overload or reverse engineer the service, or access another person\u2019s data.',
          'Do not upload malicious files.',
        ]} />) },
        { title: 'Electronic Signatures And Records', body: (<p>Closing Time lets you collect electronic signatures under the federal E-SIGN Act and the Texas Uniform Electronic Transactions Act. You are responsible for making sure each signer agrees to sign electronically, that a document may legally be signed electronically, and that signers are who they say they are. We keep a signing record for each document, but we do not verify anyone\u2019s identity or authority.</p>) },
        { title: 'Messages', body: (<p>You are responsible for the content and recipients of messages you send through Closing Time. We may limit or block messages that violate this section, carrier rules or the law. See the Privacy Policy for how text messages work.</p>) },
        { title: 'Third-Party Services', body: (<p>Closing Time connects to services we do not control, such as email, calendar, storage and text delivery. We are not responsible for their availability or actions.</p>) },
        { title: 'Fees', body: (<p>Some features are free. Paid plans, when offered, are described when you sign up, and prices may change with 30 days\u2019 notice. You can cancel at any time, and cancellation takes effect at the end of the paid period unless the plan says otherwise.</p>) },
        { title: 'Our Rights', body: (<p>We own Closing Time, its design and software. We give you a limited, non-exclusive, non-transferable right to use it under these terms. If you send us feedback, we may use it without obligation.</p>) },
        { title: 'Early Access', body: (<p>Features may change, break or be removed, especially during testing. Do not rely on any single feature as your only record or reminder.</p>) },
        { title: 'No Warranty', body: (<Caps>CLOSING TIME IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE.&rdquo; WE MAKE NO PROMISE THAT IT WILL BE ERROR-FREE, UNINTERRUPTED OR SECURE, THAT DEADLINES, DATES, ALERTS OR FORMS WILL BE CORRECT OR COMPLETE, OR THAT MESSAGES WILL BE DELIVERED. TO THE FULLEST EXTENT THE LAW ALLOWS, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. NOTHING IN CLOSING TIME IS LEGAL, TAX OR FINANCIAL ADVICE.</Caps>) },
        { title: 'Limit Of Liability', body: (<Caps>TO THE FULLEST EXTENT THE LAW ALLOWS, WE ARE NOT LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL OR PUNITIVE DAMAGES, OR FOR LOST COMMISSIONS, LOST PROFITS, LOST DEALS, MISSED OR INCORRECT DEADLINES, LOST DATA OR LOSS OF GOODWILL, EVEN IF WE WERE TOLD THEY WERE POSSIBLE. OUR TOTAL LIABILITY FOR ALL CLAIMS RELATING TO CLOSING TIME IS LIMITED TO THE GREATER OF THE AMOUNT YOU PAID US IN THE 12 MONTHS BEFORE THE CLAIM OR ONE HUNDRED DOLLARS ($100).</Caps>) },
        { title: 'Release', body: (<Caps>YOU RELEASE AND AGREE NOT TO SUE {LEGAL_COMPANY.toUpperCase()}, ITS OWNERS, OFFICERS, EMPLOYEES AND CONTRACTORS FOR LOSSES ARISING FROM YOUR USE OF CLOSING TIME, INCLUDING LOSSES CAUSED BY OUR OWN NEGLIGENCE, SUCH AS A MISSED OR WRONG DEADLINE, A FORM FILLED OUT INCORRECTLY, AN ALERT OR MESSAGE THAT WAS NOT DELIVERED, OR AN OUTAGE. THIS RELEASE DOES NOT APPLY TO GROSS NEGLIGENCE, INTENTIONAL MISCONDUCT, OR ANYTHING THE LAW DOES NOT ALLOW YOU TO RELEASE. YOU REMAIN SOLELY RESPONSIBLE FOR MEETING EVERY DEADLINE AND OBLIGATION IN YOUR CONTRACTS.</Caps>) },
        { title: 'Your Responsibility', body: (<p>Always check dates, terms and forms against the signed contract and the current official forms. You are responsible for your transactions, your clients and your compliance with TREC rules, broker policies and the law.</p>) },
        { title: 'Indemnity', body: (<p>You agree to defend and reimburse us for claims, losses and costs (including reasonable attorney fees) brought by others because of your content, your messages, or your violation of these terms or the law.</p>) },
        { title: 'Ending Your Use', body: (<p>You may stop using Closing Time at any time and export your data first. We may suspend or end access for violations, non-payment or risk to others. Sections that by their nature should survive, including release, liability, indemnity and governing law, do.</p>) },
        { title: 'Governing Law And Disputes', body: (<p>Texas law governs these terms. Before filing a claim, contact us and give us 30 days to try to resolve it. Any lawsuit must be filed in the state or federal courts located in Travis County, Texas, and you consent to those courts.</p>) },
        { title: 'General', body: (<p>These terms and the Privacy Policy are the entire agreement between us on this subject. If any part is unenforceable, the rest stays in effect. We may update these terms and will post the new date; continuing to use Closing Time after a change means you accept it. You may not transfer your account without our consent.</p>) },
      ]}
    />
  );
}
