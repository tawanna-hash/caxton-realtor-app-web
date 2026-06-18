// components/ui/PageHeader.tsx
//
// Title + optional eyebrow + optional subtitle + optional right-side action
// region. Owns the spacing under the title (mb-8) so every page has the
// same gap between heading and content. Do not set margin-bottom on the
// inner H1 \u2014 it lives here.
//
// All page shells (PublicPageShell, AdminPageShell, PortalPageShell)
// render this internally when given a `title` prop, so most callers should
// pass title to the shell directly rather than placing PageHeader manually.

import React from 'react';
import PageTitle from './PageTitle';

type Props = {
  title: React.ReactNode;
  /** Small uppercase label rendered above the title (e.g. \"BILLING\"). */
  eyebrow?: React.ReactNode;
  /** Short paragraph rendered below the title in muted gray. */
  subtitle?: React.ReactNode;
  /** Right-aligned actions (buttons, links) on the same row as the title. */
  actions?: React.ReactNode;
  align?: 'left' | 'center';
  size?: 'lg' | 'md';
  className?: string;
};

export default function PageHeader({
  title,
  eyebrow,
  subtitle,
  actions,
  align = 'left',
  size = 'lg',
  className = '',
}: Props) {
  return (
    <header className={`mb-8 ${className}`.trim()}>
      <div
        className={
          actions
            ? 'flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4'
            : ''
        }
      >
        <div className={align === 'center' ? 'text-center w-full' : 'min-w-0'}>
          {eyebrow ? (
            <p
              className={`text-xs uppercase tracking-[0.25em] text-gray-500 font-medium mb-3 ${align === 'center' ? 'text-center' : ''}`.trim()}
            >
              {eyebrow}
            </p>
          ) : null}
          <PageTitle align={align} size={size}>
            {title}
          </PageTitle>
          {subtitle ? (
            <p
              className={`mt-3 max-w-2xl text-base leading-relaxed text-gray-600 ${align === 'center' ? 'mx-auto' : ''}`.trim()}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex items-center gap-2 sm:flex-shrink-0">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
