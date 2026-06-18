// components/ui/PageTitle.tsx
//
// Unified page-title style for the app. Matches the look of the
// Magazine page header: display serif (Georgia, "Times New Roman",
// serif) at semibold (600), gray-900.
//
// Font family + weight are inherited from the global `.font-serif` rule
// defined in app/globals.css (which pins Georgia @ 600 app-wide), so we
// only need to apply the `font-serif` class — no inline style required.
//
// Use this for all top-level page titles (H1s) so type stays consistent
// across public, admin, portal, and auth surfaces.

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
      className={`font-serif ${sizeCls} text-gray-900 tracking-tight mb-3 ${alignCls} ${className}`.trim()}
    >
      {children}
    </h1>
  );
}
