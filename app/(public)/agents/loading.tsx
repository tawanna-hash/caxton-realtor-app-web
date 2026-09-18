export default function Loading() {
  return (
    <div className="animate-pulse p-6 max-w-4xl mx-auto space-y-4">
      <div className="h-6 w-48 rounded bg-gray-200" />
      <div className="h-4 w-full max-w-md rounded bg-gray-100" />
      <div className="space-y-3">
        <div className="h-24 rounded-md bg-gray-100" />
        <div className="h-24 rounded-md bg-gray-100" />
        <div className="h-24 rounded-md bg-gray-100" />
      </div>
    </div>
  );
}
