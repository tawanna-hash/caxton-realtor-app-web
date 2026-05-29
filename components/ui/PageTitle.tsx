// components/ui/PageTitle.tsx
//
// Unified page-title style for the app. Matches the look of the
// Magazine Archive header: serif (Georgia), large, bold, gray-900.
//
// Use this for all top-level page titles (H1s) so type stays consistent
// app-wide.

import React from 'react';

type Props = {
  children: React.ReactNode;
  className?: string;
  // 'left' (default) or 'center' to mirror the Magazine Archive presentation
  align?: 'left' | 'center';
  // 'lg' (default — text-4xl md:text-5xl) or 'md' (text-3xl md:text-4xl)
  // for pages with denser layouts.
  size?: 'lg' | 'md';
};

const SERIF_FONT = 'Georgia, "Times New Roman", serif';

export default function PageTitle({
  children,
  className = '',
  align = 'left',
  size = 'lg',
}: Props) {
  const sizeCls =
    size === 'lg' ? 'text-4xl md:text-5xl' : 'text-3xl md:text-4xl';
  const alignCls = align === 'center' ? 'text-center' : '';
  return (
    <h1
      className={`${sizeCls} font-bold text-gray-900 tracking-tight ${alignCls} ${className}`.trim()}
      style={{ fontFamily: SERIF_FONT }}
    >
      {children}
    </h1>
  );
}
