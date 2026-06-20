'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function ComingSoon({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  const router = useRouter();

  return (
    <div className="min-h-[calc(100vh-180px)] flex items-center justify-center px-6 py-16">
      <div className="max-w-md text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-gray-400 font-medium mb-4">
          Coming soon
        </p>
        <h1 className="text-3xl font-semibold text-[#301D5D] tracking-tight mb-4">
          {title}
        </h1>
        {description && (
          <p className="text-base text-gray-600 leading-relaxed font-light mb-10">
            {description}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          <button
            onClick={() => router.back()}
            className="text-sm uppercase tracking-wider font-medium px-6 py-3 border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            ← Back
          </button>
          <Link
            href="/"
            className="text-sm uppercase tracking-wider font-medium px-6 py-3 bg-[#301D5D] text-white hover:bg-[#301D5D]"
          >
            Return to app
          </Link>
        </div>
      </div>
    </div>
  );
}
