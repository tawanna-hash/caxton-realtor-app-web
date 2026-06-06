import Link from "next/link";

export const metadata = {
  title: "Page not found · RealtyLine Austin",
  description: "The page you were looking for doesn&apos;t exist.",
};

export default function NotFound() {
  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
          Error 404
        </p>
        <h1
          className="text-4xl text-gray-900 mb-4"
          style={{ fontFamily: "Georgia, serif" }}
        >
          Page not found
        </h1>
        <p className="text-gray-600 mb-8 leading-relaxed">
          We couldn&apos;t find what you were looking for. The article may have
          moved, or the link may be out of date.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center min-h-[44px] px-6 py-3 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 transition"
          >
            Back to feed
          </Link>
          <Link
            href="/magazine"
            className="inline-flex items-center justify-center min-h-[44px] px-6 py-3 border border-gray-300 text-gray-900 text-sm font-medium rounded-md hover:bg-gray-50 transition"
          >
            Browse magazine
          </Link>
        </div>
        <p className="mt-10 text-xs text-gray-500">
          RealtyLine Austin · Published by Caxton Publications, Inc.
        </p>
      </div>
    </main>
  );
}
