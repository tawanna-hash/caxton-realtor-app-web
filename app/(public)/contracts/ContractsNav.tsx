import Link from 'next/link';
import { BTN_PRIMARY, BTN_SECONDARY } from './ui';

const ITEMS = [
  { href: '/contracts', label: 'Contracts', key: 'dates' },
  { href: '/contracts/forms', label: 'TREC Library', key: 'forms' },
  { href: '/contracts/calculators', label: 'Calculators', key: 'calculators' },
  { href: '/contracts/email', label: 'Email', key: 'email' },
  { href: '/testimonial-hub', label: 'Testimonial HUB', key: 'testimonials' },
] as const;

export default function ContractsNav({ active }: { active: 'dates' | 'forms' | 'calculators' | 'email' | 'testimonials' }) {
  return (
    <nav aria-label="Agent tools" className="w-full">
      <ul className="flex flex-wrap gap-2">
        {ITEMS.map((item) => (
          <li key={item.key} className="shrink-0">
            <Link
              href={item.href}
              aria-current={item.key === active ? 'page' : undefined}
              className={item.key === active ? BTN_PRIMARY : BTN_SECONDARY}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
