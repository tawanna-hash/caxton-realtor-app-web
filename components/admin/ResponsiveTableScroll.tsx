// components/admin/ResponsiveTableScroll.tsx
//
// Shared wrapper that makes a wide admin table scroll horizontally inside its
// own box instead of stretching the whole page. Introduced alongside the
// responsive admin shell; the existing tables are migrated page-by-page in
// follow-up PRs rather than all at once.

/**
 * Wraps a wide table so it scrolls horizontally within its own container.
 *
 * The admin shell caps its main content at `max-w-full`, so a raw `<table>`
 * that's wider than the viewport would otherwise force the entire document to
 * scroll sideways — which is what makes the admin unusable on a phone. Wrap
 * the table here and only the table scrolls.
 *
 * The child table should carry `min-w-full` (or an explicit `min-w-[NNrem]`
 * when the columns need more room than the viewport) so it still fills the
 * container on desktop.
 *
 * @example
 * <ResponsiveTableScroll>
 *   <table className="min-w-full text-sm">…</table>
 * </ResponsiveTableScroll>
 */
export default function ResponsiveTableScroll({
  children,
  className = '',
}: {
  children: React.ReactNode;
  /** Extra classes for the scroll container (borders, rounding, margins). */
  className?: string;
}) {
  return (
    <div className={`w-full overflow-x-auto overscroll-x-contain ${className}`.trim()}>
      {children}
    </div>
  );
}
