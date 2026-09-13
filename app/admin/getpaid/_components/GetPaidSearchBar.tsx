'use client';

import type { ReactNode } from 'react';

type GetPaidSearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  children?: ReactNode;
};

export function GetPaidSearchBar({
  value,
  onChange,
  placeholder,
  children,
}: GetPaidSearchBarProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="h-12 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-4 text-base text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-violet-700 focus:ring-1 focus:ring-violet-700"
        />
        {children && (
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

export const getPaidSearchSelectClassName =
  'h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none focus:border-violet-700 focus:ring-1 focus:ring-violet-700';
