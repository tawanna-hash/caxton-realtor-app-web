import type { ReactNode } from 'react';

export const LEGAL_UPDATED = 'October 7, 2026';
export const LEGAL_COMPANY = 'Closing Time';
export const LEGAL_EMAIL = 'support@itsalmostclosingtime.com';

export type Section = { title: string; body: ReactNode };

export function LegalPage({ title, intro, sections }: { title: string; intro: ReactNode; sections: Section[] }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-[#1B1726]">
      <nav className="mb-6 flex flex-wrap gap-4 text-[13px] text-[#4A4757]" aria-label="Legal">
        <a className="underline" href="/privacy">Privacy Policy</a>
        <a className="underline" href="/terms">Terms Of Service</a>
        <a className="underline" href="/disclaimer">Important Notices</a>
        <a className="underline" href="/sms">Text Messaging</a>
        <a className="underline" href="/security">Security</a>
      </nav>
      <h1 className="font-serif text-3xl text-[#301D5D]">{title}</h1>
      <p className="mt-2 text-[13px] text-[#7A7787]">Last updated {LEGAL_UPDATED}</p>
      <div className="mt-4 text-[15px] leading-relaxed text-[#4A4757]">{intro}</div>
      {sections.map((s) => (
        <section key={s.title} className="mt-8">
          <h2 className="text-[15px] font-semibold text-[#1B1726]">{s.title}</h2>
          <div className="mt-2 space-y-3 text-[14px] leading-relaxed text-[#4A4757]">{s.body}</div>
        </section>
      ))}
      <p className="mt-10 border-t border-[#E6E5EC] pt-4 text-[13px] text-[#7A7787]">
        Questions: <a className="underline text-[#301D5D]" href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a>. {LEGAL_COMPANY}, Austin, Texas.
      </p>
    </main>
  );
}

export const Ul = ({ items }: { items: ReactNode[] }) => (
  <ul className="list-disc space-y-1 pl-5">{items.map((i, n) => <li key={n}>{i}</li>)}</ul>
);

export const Caps = ({ children }: { children: ReactNode }) => (
  <p className="font-bold uppercase text-[#1B1726]">{children}</p>
);
