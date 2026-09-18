export default function Loading() {
  return (
    <div className="animate-pulse p-6 space-y-5">
      <div className="h-6 w-52 rounded bg-gray-200" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-md border border-gray-200 bg-white p-4">
            <div className="h-3 w-20 rounded bg-gray-200" />
            <div className="h-6 w-14 rounded bg-gray-100 mt-3" />
          </div>
        ))}
      </div>
      <div className="rounded-md border border-gray-200 bg-white p-4">
        <div className="h-56 rounded bg-gray-100" />
      </div>
    </div>
  );
}
