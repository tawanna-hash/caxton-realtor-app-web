'use client';

import { useState } from 'react';
import { PRINT_DEADLINE_YEARS, getPrintDeadlines } from '@/lib/media-kit';

export default function PrintDeadlinesTable() {
  const [year, setYear] = useState<number>(PRINT_DEADLINE_YEARS[0]);
  const rows = getPrintDeadlines(year);
  if (PRINT_DEADLINE_YEARS.length === 0) return null;

  return (
    <section className="mb-14">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium">
          {year} print deadlines
        </p>
        {PRINT_DEADLINE_YEARS.length > 1 && (
          <div role="tablist" aria-label="Year" className="flex gap-2">
            {PRINT_DEADLINE_YEARS.map((y) => (
              <button
                key={y}
                role="tab"
                aria-selected={y === year}
                onClick={() => setYear(y)}
                className={
                  'px-3 py-1 rounded-md text-xs font-medium transition ' +
                  (y === year
                    ? 'bg-brand-700 text-white'
                    : 'bg-gray-100 text-gray-800 hover:bg-gray-200')
                }
              >
                {y}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="border border-gray-200 rounded-md overflow-hidden">
        <ul className="divide-y divide-gray-100 md:hidden">
          {rows.map((d) => (
            <li key={d.month} className="px-4 py-3">
              <div className="font-medium">{d.month}</div>
              <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-gray-500">Materials deadline</div>
                  <div className="text-gray-700">{d.deadline}</div>
                </div>
                <div>
                  <div className="text-gray-500">Mails on</div>
                  <div className="text-gray-700">{d.mail}</div>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <table className="hidden w-full text-sm md:table">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-600">
            <tr>
              <th className="px-4 py-2 font-medium">Issue</th>
              <th className="px-4 py-2 font-medium">Materials deadline</th>
              <th className="px-4 py-2 font-medium">Mails on</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((d) => (
              <tr key={d.month}>
                <td className="px-4 py-2 font-medium">{d.month}</td>
                <td className="px-4 py-2 text-gray-700">{d.deadline}</td>
                <td className="px-4 py-2 text-gray-700">{d.mail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
