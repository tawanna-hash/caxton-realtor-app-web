'use client';

import { useState } from 'react';
import Link from 'next/link';

export function Header() {
  const [selectedCity, setSelectedCity] = useState<'austin' | 'san_antonio'>('austin');

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Branding */}
          <div className="flex items-center">
            <Link href="/dashboard" className="flex flex-col">
              <span className="text-lg font-semibold text-gray-900">
                Caxton Publications, Inc.
              </span>
              <span className="text-xs text-gray-600">
                Putting A Face on Real Estate since 1995
              </span>
            </Link>
          </div>

          {/* City Selector */}
          <div className="flex items-center gap-4">
            <label htmlFor="city-select" className="text-sm font-medium text-gray-700">
              Select A City:
            </label>
            <select
              id="city-select"
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value as 'austin' | 'san_antonio')}
              className="block w-64 rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
            >
              <option value="austin">RealtyLine Austin</option>
              <option value="san_antonio">Newsline San Antonio</option>
            </select>
          </div>

          {/* User menu placeholder */}
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/profile"
              className="text-sm text-gray-700 hover:text-gray-900"
            >
              Profile
            </Link>
            <button
              onClick={() => {
                // We'll implement logout later
                window.location.href = '/';
              }}
              className="text-sm text-gray-700 hover:text-gray-900"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
