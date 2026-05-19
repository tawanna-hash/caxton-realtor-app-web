'use client';

// MonthGrid — 7-column calendar grid for a given month.
// Each day cell shows the day number; days with events show a colored dot
// below the number. Tapping a day fires onSelectDay. Selected day renders
// as a filled circle in the pub color.

import { PUB_META, type PubKey } from '@/lib/pub-meta';

interface MonthGridProps {
  month: Date;               // First day of the month being displayed
  pub: PubKey;
  eventsByDate: Map<string, number>;  // ISO date string (YYYY-MM-DD) -> event count
  selectedDay: Date | null;
  onSelectDay: (day: Date | null) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function isoDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function MonthGrid({ month, pub, eventsByDate, selectedDay, onSelectDay, onPrevMonth, onNextMonth }: MonthGridProps) {
  const info = PUB_META[pub] || PUB_META.realtyline;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Compute grid cells: 6 rows x 7 cols = 42 cells
  // First cell = the Sunday on or before the 1st of the month
  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay()); // back to Sunday

  const cells: Array<{ date: Date; inMonth: boolean; hasEvents: boolean; isToday: boolean; isSelected: boolean }> = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push({
      date: d,
      inMonth: d.getMonth() === month.getMonth(),
      hasEvents: eventsByDate.has(isoDateKey(d)),
      isToday: isSameDay(d, today),
      isSelected: selectedDay !== null && isSameDay(d, selectedDay),
    });
  }

  function handleDayClick(d: Date) {
    if (selectedDay !== null && isSameDay(d, selectedDay)) {
      onSelectDay(null); // tapping selected day deselects
    } else {
      onSelectDay(d);
    }
  }

  return (
    <div className="px-4 pt-4 pb-2">
      {/* Month header with prev/next */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={onPrevMonth}
          aria-label="Previous month"
          className="w-9 h-9 flex items-center justify-center rounded-md text-gray-700 hover:bg-gray-100 active:bg-gray-200"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <h2 className="text-lg font-semibold text-gray-900 tracking-tight">
          {MONTH_NAMES[month.getMonth()]} {month.getFullYear()}
        </h2>
        <button
          onClick={onNextMonth}
          aria-label="Next month"
          className="w-9 h-9 flex items-center justify-center rounded-md text-gray-700 hover:bg-gray-100 active:bg-gray-200"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>

      {/* Day-of-week row */}
      <div className="grid grid-cols-7 mb-1">
        {DOW_LABELS.map((d) => (
          <div key={d} className="text-center text-xs uppercase tracking-wider text-gray-400 font-medium py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, idx) => {
          const baseClass = "relative h-12 flex flex-col items-center justify-center rounded-md transition-colors";
          const textClass = cell.inMonth
            ? cell.isSelected
              ? "text-white"
              : cell.isToday
                ? "text-gray-900 font-semibold"
                : "text-gray-900"
            : "text-gray-300";

          // Today-but-not-selected gets a pub-color inset ring; selected state
          // overrides via background fill. Focus styling uses focus-visible so
          // mouse clicks don't leave a sticky outline (keyboard tabs still do).
          const todayRingStyle = cell.isToday && !cell.isSelected
            ? { boxShadow: `inset 0 0 0 2px ${info.color}` }
            : undefined;
          const cellStyle = cell.isSelected
            ? { backgroundColor: info.color }
            : todayRingStyle;

          return (
            <button
              key={idx}
              onClick={() => handleDayClick(cell.date)}
              className={`${baseClass} focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 ${cell.isSelected ? '' : 'hover:bg-gray-100 active:bg-gray-200'}`}
              style={cellStyle}
              aria-label={`${MONTH_NAMES[cell.date.getMonth()]} ${cell.date.getDate()}, ${cell.date.getFullYear()}${cell.hasEvents ? ' (has events)' : ''}${cell.isToday ? ' (today)' : ''}`}
              aria-pressed={cell.isSelected}
            >
              <span className={`text-sm leading-none ${textClass}`}>{cell.date.getDate()}</span>
              {cell.hasEvents && (
                <span
                  className="absolute bottom-1.5 w-1 h-1 rounded-full"
                  style={{ backgroundColor: cell.isSelected ? 'rgba(255,255,255,0.85)' : info.color }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
