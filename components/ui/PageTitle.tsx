// components/ui/PageTitle.tsx
//
// Single unified H1 for the entire app. Matches the look of the Magazine
// Archive header on /magazine: Georgia at normal weight (400) with tight
// tracking, large, gray-900.
//
// All font properties (family, weight, letter-spacing) are inherited from
// the global `.font-serif` rule in app/globals.css \u2014 do not set them inline
// here, or pages will drift again.
//
// Sizes are intentionally limited to two values so titles never wander:
//   'lg' = text-4xl md:text-5xl  \u2014 public, portal, auth, landing
//   'md' = text-3xl md:text-4xl  \u2014 admin (tighter density for table-heavy pages)
//
// Page wrappers (PublicPageShell, AdminPageShell, PortalPageShell) own the
// padding and spacing under the title; this component only owns the title.

import React from 'react';

type Props = {
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'center';
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
      className={`font-serif ${sizeCls} text-gray-900 leading-tight tracking-tight ${alignCls} ${className}`.trim()}
    >
      {children}
    </h1>
  );
}
