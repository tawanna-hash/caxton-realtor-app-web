'use client';

import type { ReactNode } from 'react';
import Tip from './Tip';

/** Zone 1: page header inside the border. 22px title, one subtitle line, up to two actions on the right. */
export function PageHead({ title, subtitle, actions, tip, className = '' }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; tip?: string; className?: string }) {
  return (
    <div className={`ds-pagehead mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-3 ${className}`} data-testid="page-head">
      <div className="min-w-0">
        <h2 className="text-[22px] font-semibold leading-tight text-[#1B1726]">{title}</h2>
        {tip && <Tip text={tip} />}
        {subtitle && <p className="mt-1 text-[14px] text-[#4A4757]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 max-sm:w-full max-sm:[&>*]:flex-1">{actions}</div>}
    </div>
  );
}

/** Zone 5: section card header. 15px title, muted count, hover tip, actions on the right. */
export function SecHead({ title, count, tip, actions, className = '' }: { title: ReactNode; count?: ReactNode; tip?: string; actions?: ReactNode; className?: string }) {
  return (
    <div className={`ds-sechead flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-[#E6E5EC] px-4 py-3 ${className}`}>
      <h3 className="text-[15px] font-semibold text-[#1B1726]">{title}</h3>
      {tip && <Tip text={tip} />}
      {count !== undefined && count !== null && count !== '' && <span className="text-[13px] text-[#6B6878]">{count}</span>}
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Zone 5: section card. 4px corners, thin gray border, no fills. */
export function Sec({ children, className = '', ...rest }: { children: ReactNode; className?: string } & Record<string, unknown>) {
  return <section className={`ds-sec min-w-0 overflow-hidden rounded-[4px] border border-[#E6E5EC] bg-white ${className}`} {...rest}>{children}</section>;
}
