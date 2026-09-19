export default function Loading() {
  return (
    <div className="animate-pulse p-6 space-y-4">
      <div className="h-6 w-40 rounded bg-gray-200" />
      <div className="flex gap-3">
        <div className="h-9 w-64 rounded bg-gray-100" />
        <div className="h-9 w-32 rounded bg-gray-100" />
        <div className="h-9 w-32 rounded bg-gray-100" />
      </div>
      <div className="rounded-md border border-gray-200 overflow-hidden">
        <div className="h-10 bg-gray-100" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 border-t border-gray-100 bg-white flex items-center gap-4 px-4">
            <div className="h-8 w-8 rounded-full bg-gray-100" />
            <div className="h-3 w-40 rounded bg-gray-100" />
            <div className="h-3 w-24 rounded bg-gray-100" />
            <div className="h-3 w-20 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
