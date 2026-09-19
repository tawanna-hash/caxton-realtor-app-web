export default function Loading() {
  return (
    <div className="animate-pulse space-y-4 p-6 max-w-3xl mx-auto">
      <div className="h-6 w-48 rounded bg-gray-200" />
      <div className="h-4 w-full max-w-md rounded bg-gray-200" />
      <div className="space-y-2">
        <div className="h-16 rounded bg-gray-100" />
        <div className="h-16 rounded bg-gray-100" />
        <div className="h-16 rounded bg-gray-100" />
      </div>
    </div>
  );
}
