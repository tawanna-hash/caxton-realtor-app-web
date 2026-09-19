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
    <div className="inline-flex h-9 overflow-hidden rounded border border-gray-300 bg-white">
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
              'px-3 text-sm font-medium transition-colors',
              !isFirst ? 'border-l border-gray-200' : '',
              isActive
                ? 'bg-orange-600 text-white'
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
