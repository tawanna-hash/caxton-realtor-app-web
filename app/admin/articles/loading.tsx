export default function Loading() {
  return (
    <div className="animate-pulse p-6 space-y-4">
      <div className="h-6 w-40 rounded bg-gray-200" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-md border border-gray-200 bg-white p-3">
            <div className="h-14 w-20 rounded bg-gray-100 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded bg-gray-200" />
              <div className="h-3 w-1/2 rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
