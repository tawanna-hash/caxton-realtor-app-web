import type { ReactNode } from 'react';
import ContractsNav from './ContractsNav';

type Active = 'dates' | 'forms' | 'calculators' | 'email' | 'testimonials';

const STEPS: Array<[string, string, string]> = [
  ['01', 'Upload Your TREC Contract', 'We read the effective date and period terms.'],
  ['02', 'Confirm The Dates', 'Fix anything that looks off before you save.'],
  ['03', 'Get Alerted', 'Email or push before each deadline is due.'],
];

/**
 * Page frame for Closing Time (limited edition): a contained 7xl column like the Agent Desk,
 * with an optional hero (title and actions on the left, a short guide card on the right).
 */
export default function ContractsShell({
  active, title, subtitle, description, hero = false, children,
}: {
  active: Active;
  title?: string;
  subtitle?: string;
  description?: string;
  hero?: boolean;
  children: ReactNode;
}) {
  return (
    <div id="agent-desk" className="ct-lite min-h-screen overflow-x-hidden bg-white pb-28 text-[#1B1726] sm:pb-16">
      {title && (
        <section className="border-b border-[#E6E5EC] bg-white">
          <div className={`max-w-3xl mx-auto px-4 py-8 sm:py-8 ${hero ? "grid grid-cols-[minmax(0,1fr)] gap-8" : ""}`}>
            <div>
              <p className="ds-eyebrow">Closing Time (limited edition)</p>
              <h1 className="ds-title mt-2 sm:!text-[2rem]">{title}</h1>
              {subtitle && <p className="mt-3 text-base font-semibold leading-7 text-slate-900">{subtitle}</p>}
              {description && <p className="ds-subtitle leading-7">{description}</p>}
            </div>
            {hero && (
              <aside className="ds-card">
                <p className="ds-eyebrow">Today&apos;s contract desk</p>
                <div className="mt-4 space-y-4">
                  {STEPS.map(([number, t, d]) => (
                    <div key={number} className="flex gap-3 border-t border-[#F6F3FB] pt-4 first:border-t-0 first:pt-0">
                      <span className="ds-stat-icon ds-i-purple !h-7 !w-7 text-xs font-semibold">{number}</span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{t}</p>
                        <p className="mt-0.5 text-sm leading-5 text-slate-500">{d}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </aside>
            )}
          </div>
        </section>
      )}
      <div className="max-w-3xl mx-auto px-4 pt-6">
        <ContractsNav active={active} />
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
