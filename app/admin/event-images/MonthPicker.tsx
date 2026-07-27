// MonthPicker — cross-browser month selector.
// Safari doesn't support <input type="month"> so we use two <select> dropdowns.
// Returns YYYY-MM (e.g., "2026-07") which is safe for Postgres DATE columns.

'use client';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type Props = {
  value: string;          // YYYY-MM format (e.g., "2026-07")
  onChange: (v: string) => void;
  className?: string;
};

export default function MonthPicker({ value, onChange, className = '' }: Props) {
  // Parse value; default to current month
  let year = new Date().getFullYear();
  let month = new Date().getMonth(); // 0-indexed

  if (value && /^\d{4}-\d{2}$/.test(value)) {
    const [y, m] = value.split('-').map(Number);
    year = y;
    month = m - 1;
  }

  const currentYear = new Date().getFullYear();
  const years = [currentYear + 1, currentYear, currentYear - 1, currentYear - 2];

  const handleChange = (y: number, m: number) => {
    onChange(`${y}-${String(m + 1).padStart(2, '0')}`);
  };

  return (
    <div className={`flex gap-2 ${className}`}>
      <select
        value={month}
        onChange={(e) => handleChange(year, Number(e.target.value))}
        className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
      >
        {MONTHS.map((label, i) => (
          <option key={i} value={i}>{label}</option>
        ))}
      </select>
      <select
        value={year}
        onChange={(e) => handleChange(Number(e.target.value), month)}
        className="w-28 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
      >
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
}
