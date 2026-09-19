export default function Loading() {
  return (
    <div className="animate-pulse p-6 max-w-5xl mx-auto space-y-4">
      <div className="h-6 w-40 rounded bg-gray-200" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-[3/4] rounded-md bg-gray-100" />
        ))}
      </div>
    </div>
  );
}
