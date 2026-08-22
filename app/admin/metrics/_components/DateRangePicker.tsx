'use client';

export type DaysOption = 7 | 30 | 90;

type Props = {
  value: DaysOption;
  onChange: (days: DaysOption) => void;
  disabled?: boolean;
};

const OPTIONS: Array<{ value: DaysOption; label: string }> = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
];

export function DateRangePicker({ value, onChange, disabled = false }: Props) {
  return (
    <div className="inline-flex bg-white border border-gray-200 rounded-md overflow-hidden">
      {OPTIONS.map((opt, idx) => {
        const isActive = opt.value === value;
        const isFirst = idx === 0;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={[
              'px-4 py-2 text-sm font-medium transition-colors',
              !isFirst ? 'border-l border-gray-200' : '',
              isActive
                ? 'bg-brand-700 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50',
              disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
            ].filter(Boolean).join(' ')}
            aria-pressed={isActive}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
