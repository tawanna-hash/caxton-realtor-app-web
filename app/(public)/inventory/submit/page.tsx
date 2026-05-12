// app/(public)/inventory/submit/page.tsx
//
// Public submission form for builder/developer clients.
// Wraps the client-side SubmissionForm component with standard page chrome.

import SubmissionForm from '@/components/inventory/SubmissionForm';

export const metadata = {
  title: 'Submit inventory — HarmonyOne',
  description:
    'Builders and developers: submit a new home listing or promotion for publication in RealtyLine and Newsline.',
};

export default function Page() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
            For Builder &amp; Developer Clients
          </p>
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 tracking-tight mb-3">
            Submit inventory or a promotion
          </h1>
          <p className="text-base text-gray-700 font-light leading-relaxed">
            Share a new home listing, quick move-in, model home event, or limited-time promotion. Submissions go to our editorial team for review before publication.
          </p>
        </div>

        <SubmissionForm />
      </div>
    </main>
  );
}
