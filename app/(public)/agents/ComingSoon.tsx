// Public home page for Closing Time. Shown to visitors who are not signed in to an enabled account.
const FEATURES: Array<[string, string]> = [
  ['Deadline Tracking', 'Enter your contract dates once. Closing Time builds the option period, financing, title and closing deadlines and reminds you before each one.'],
  ['Contract Details', 'Keep buyers, sellers, lender, title company and key terms for every deal organized in one place.'],
  ['Forms And Signing', 'Fill out forms, request electronic signatures and keep a signing record for each document.'],
  ['Scheduling', 'Book closings and appointments with your clients, lenders and title company for each deal.'],
  ['Client Portal', 'Give clients a private link to see where their deal stands and upload requested documents.'],
  ['Alerts', 'Get deadline alerts by email, push notification and, with your permission, text message.'],
];

const LINKS: Array<[string, string]> = [
  ['Privacy Policy', '/privacy'],
  ['Terms Of Service', '/terms'],
  ['Text Messaging Terms', '/sms'],
  ['Important Notices', '/disclaimer'],
  ['Security', '/security'],
  ['API Documentation', '/developers'],
];

export default function ComingSoon() {
  return (
    <div className="min-h-screen bg-white text-[#1B1726]">
      <header className="border-b border-[#E6E5EC]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="font-serif text-xl text-[#301D5D]">It&rsquo;s Almost Closing Time!</span>
          <a href="/login?next=%2Fagents%2Fclosing-time" className="rounded-md border border-[#E6E5EC] bg-white px-3 py-1.5 text-[13px] font-medium text-[#301D5D] hover:!bg-[#EFEAF8] hover:!text-[#301D5D]">Sign In</a>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-6 py-16">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#5F5B6E]">For Texas Real Estate Agents</p>
          <h1 className="mt-3 max-w-2xl font-serif text-4xl leading-tight text-[#301D5D]">Every Deadline, Form And Signature, From Contract To Closing</h1>
          <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-[#4A4757]">
            Closing Time is a deal workspace for Texas real estate agents. It tracks contract deadlines, organizes forms and documents, collects signatures, schedules closings and keeps clients, lenders and title companies on the same page.
          </p>
          <p className="mt-4 text-[14px] text-[#4A4757]">Closing Time is in private testing. To ask for access, email <a className="text-[#301D5D] underline" href="mailto:tawanna@itsalmostclosingtime.com">tawanna@itsalmostclosingtime.com</a>.</p>
        </section>

        <section className="border-t border-[#E6E5EC] bg-[#F6F3FB]">
          <div className="mx-auto max-w-5xl px-6 py-12">
            <h2 className="text-[14px] font-semibold">What It Does</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(([title, body]) => (
                <div key={title} className="rounded-xl border border-[#E6E5EC] bg-white p-5">
                  <h3 className="text-[14px] font-semibold text-[#301D5D]">{title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-[#4A4757]">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-12">
          <h2 className="text-[14px] font-semibold">Text Message Alerts</h2>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[#4A4757]">
            Agents can choose to receive deadline alerts by text, and people on a deal can agree to receive deal updates. Text messages are sent only after a person agrees. Reply STOP to opt out and HELP for help. Message and data rates may apply. See the <a className="text-[#301D5D] underline" href="/sms">Text Messaging Terms</a>.
          </p>
        </section>
      </main>

      <footer className="border-t border-[#E6E5EC]">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
            {LINKS.map(([label, href]) => <a key={href} href={href} className="text-[#301D5D] underline">{label}</a>)}
          </nav>
          <p className="mt-4 text-[13px] text-[#5F5B6E]">
            Closing Time is operated by Caxton Publications, Inc., Austin, Texas. Contact: <a className="underline" href="mailto:tawanna@itsalmostclosingtime.com">tawanna@itsalmostclosingtime.com</a>. Closing Time is not affiliated with the Texas Real Estate Commission or Texas REALTORS and does not provide legal advice.
          </p>
        </div>
      </footer>
    </div>
  );
}
