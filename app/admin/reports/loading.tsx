export default function Loading() {
  return (
    <div className="mx-auto max-w-[1500px] px-5 py-7 lg:px-8 animate-pulse space-y-5">
      <div className="h-6 w-40 rounded bg-gray-200" />
      <div className="flex gap-2">
        <div className="h-8 w-24 rounded bg-gray-100" />
        <div className="h-8 w-24 rounded bg-gray-100" />
        <div className="h-8 w-24 rounded bg-gray-100" />
      </div>
      <div className="rounded-md border border-gray-200 bg-white p-4 space-y-3">
        <div className="h-4 w-56 rounded bg-gray-200" />
        <div className="h-40 rounded bg-gray-100" />
      </div>
      <div className="space-y-2">
        <div className="h-14 rounded bg-gray-100" />
        <div className="h-14 rounded bg-gray-100" />
        <div className="h-14 rounded bg-gray-100" />
      </div>
    </div>
  );
}
