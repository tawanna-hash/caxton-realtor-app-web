export default function Loading() {
  return (
    <div className="animate-pulse space-y-8">
      <header className="space-y-2">
        <div className="h-3 w-32 rounded bg-gray-200" />
        <div className="h-8 w-64 rounded bg-gray-200" />
        <div className="h-4 w-80 rounded bg-gray-100" />
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="h-24 rounded-md border border-gray-200 bg-white p-4">
          <div className="h-3 w-16 rounded bg-gray-200" />
          <div className="h-8 w-10 rounded bg-gray-100 mt-3" />
        </div>
        <div className="h-24 rounded-md border border-gray-200 bg-white p-4">
          <div className="h-3 w-16 rounded bg-gray-200" />
          <div className="h-8 w-10 rounded bg-gray-100 mt-3" />
        </div>
        <div className="h-24 rounded-md border border-gray-200 bg-white p-4">
          <div className="h-3 w-16 rounded bg-gray-200" />
          <div className="h-8 w-10 rounded bg-gray-100 mt-3" />
        </div>
        <div className="h-24 rounded-md border border-gray-200 bg-white p-4">
          <div className="h-3 w-16 rounded bg-gray-200" />
          <div className="h-8 w-10 rounded bg-gray-100 mt-3" />
        </div>
      </section>

      <section className="rounded-md border border-gray-200 bg-white p-6 space-y-3">
        <div className="h-5 w-56 rounded bg-gray-200" />
        <div className="h-4 w-full rounded bg-gray-100" />
        <div className="h-4 w-5/6 rounded bg-gray-100" />
        <div className="h-4 w-2/3 rounded bg-gray-100" />
      </section>
    </div>
  );
}
