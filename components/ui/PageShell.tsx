// components/ui/PageShell.tsx
//
// Three thin wrappers that pin max-width + horizontal padding + vertical
// rhythm for every page in the app. Use these so admin / portal / public
// pages stop drifting between max-w-3xl / 4xl / 5xl / 6xl / 7xl and
// random px-4 / px-6 / py-8 / py-12 combinations.
//
//   <PublicPageShell title=\"Foo\">         <\u2014 marketing, resources, advertise
//   <AdminPageShell  title=\"Bar\">         <\u2014 every /admin/* page
//   <PortalPageShell title=\"Baz\">         <\u2014 advertiser self-serve portal
//
// All three render a centered container at the same horizontal padding
// (px-6 on mobile, lg:px-8 on desktop) and the same vertical padding
// (py-10 md:py-12). Width and title size differ per surface:
//
//   Public  : max-w-5xl, title size 'lg' (text-4xl md:text-5xl)
//   Admin   : max-w-7xl, title size 'md' (text-3xl md:text-4xl)
//   Portal  : max-w-5xl, title size 'md' (text-3xl md:text-4xl)
//
// Passing a `title` prop renders PageHeader; passing children-only lets
// the page render its own header (rare \u2014 prefer the prop).

import React from 'react';
import PageHeader from './PageHeader';

type ShellProps = {
  children: React.ReactNode;
  /** Page title \u2014 renders PageHeader if provided. */
  title?: React.ReactNode;
  eyebrow?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  align?: 'left' | 'center';
  /** Extra classes on the inner content container (rare). */
  className?: string;
};

function Shell({
  children,
  title,
  eyebrow,
  subtitle,
  actions,
  align,
  maxWidth,
  titleSize,
  className = '',
}: ShellProps & {
  maxWidth: string;
  titleSize: 'lg' | 'md';
}) {
  return (
    <div className={`${maxWidth} mx-auto px-6 lg:px-8 py-10 md:py-12 ${className}`.trim()}>
      {title ? (
        <PageHeader
          title={title}
          eyebrow={eyebrow}
          subtitle={subtitle}
          actions={actions}
          align={align}
          size={titleSize}
        />
      ) : null}
      {children}
    </div>
  );
}

export function PublicPageShell(props: ShellProps) {
  return (
    <Shell
      {...props}
      maxWidth="max-w-5xl"
      titleSize="lg"
    />
  );
}

export function AdminPageShell(props: ShellProps) {
  return (
    <Shell
      {...props}
      maxWidth="max-w-7xl"
      titleSize="md"
    />
  );
}

export function PortalPageShell(props: ShellProps) {
  return (
    <Shell
      {...props}
      maxWidth="max-w-5xl"
      titleSize="md"
    />
  );
}
