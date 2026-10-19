import Link from 'next/link';

const ITEMS = [
  { href: '/contracts', label: 'Contracts', key: 'dates' },
  { href: '/contracts/forms', label: 'TREC Library', key: 'forms' },
  { href: '/contracts/calculators', label: 'Calculators', key: 'calculators' },
  { href: '/testimonial-hub', label: 'Testimonial HUB', key: 'testimonials' },
] as const;

export default function ContractsNav({ active }: { active: 'dates' | 'forms' | 'calculators' | 'testimonials' }) {
  return (
    <nav aria-label="Agent tools" className="w-full">
      <ul className="flex flex-wrap gap-2">
        {ITEMS.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              aria-current={item.key === active ? 'page' : undefined}
              className={`inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm font-semibold transition ${
                item.key === active
                  ? 'border-[#301D5D] bg-[#301D5D] text-white'
                  : 'border-[#D9D2E9] bg-white text-[#301D5D] hover:bg-[#F4F0FA]'
              }`}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
