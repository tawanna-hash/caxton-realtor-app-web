export default function Loading() {
  return (
    <div className="animate-pulse p-6 space-y-5">
      <div className="h-6 w-48 rounded bg-gray-200" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-md border border-gray-200 bg-white p-4">
            <div className="h-3 w-20 rounded bg-gray-200" />
            <div className="h-6 w-16 rounded bg-gray-100 mt-3" />
          </div>
        ))}
      </div>
      <div className="rounded-md border border-gray-200 overflow-hidden">
        <div className="h-10 bg-gray-100" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 border-t border-gray-100 bg-white flex items-center gap-4 px-4">
            <div className="h-3 w-32 rounded bg-gray-100" />
            <div className="h-3 w-20 rounded bg-gray-100" />
            <div className="h-3 w-24 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
