'use client';

export function EventSkeleton() {
  return (
    <div className="bg-white border-b border-gray-200 animate-pulse">
      <div className="px-4 py-5 flex gap-4">
        <div className="flex-shrink-0 w-16 h-16 rounded bg-gray-200" />
        <div className="flex-1 space-y-2">
          <div className="h-5 bg-gray-200 rounded w-3/4" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-4 bg-gray-200 rounded w-2/3" />
        </div>
      </div>
    </div>
  );
}
