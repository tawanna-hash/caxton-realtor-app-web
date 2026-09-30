// Placeholder shown while the home list streams in. Mirrors the card rows
// (96px thumbnail + text lines) so the page doesn't jump when data arrives.
export default function InventoryListSkeleton() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading homes">
      <div className="h-10 w-full rounded-md bg-gray-100 mb-4" />
      <div className="divide-y divide-gray-100">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-4 py-4">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-md bg-gray-100 flex-shrink-0" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-4 w-2/3 rounded bg-gray-200" />
              <div className="h-3 w-1/2 rounded bg-gray-100" />
              <div className="h-3 w-1/3 rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
