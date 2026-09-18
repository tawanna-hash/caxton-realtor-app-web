export default function Loading() {
  return (
    <div className="animate-pulse p-6 max-w-5xl mx-auto space-y-4">
      <div className="h-6 w-64 rounded bg-gray-200" />
      <div className="h-4 w-full max-w-md rounded bg-gray-100" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 rounded-md bg-gray-100" />
        ))}
      </div>
    </div>
  );
}
