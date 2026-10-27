import PageTitle from '@/components/ui/PageTitle';
import { termsForChannel } from '@/lib/agreement-terms';

export const metadata = {
  title: 'Advertising Agreement Terms — Realty News Now',
  description:
    'The Advertising Agreement Terms that apply to RealtyLine Austin and Newsline San Antonio advertising, published by Caxton Publications, Inc.',
};

export default function AdvertisingTermsPage() {
  const lines = termsForChannel('print').split('\n').filter((l) => l.trim());
  const [title, ...rest] = lines;
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
            Terms of Service
          </p>
          <PageTitle size="md">{title}</PageTitle>
          <p className="text-sm text-gray-500 font-light">
            Caxton Publications, Inc., P.O. Box 81366, Austin, Texas 78708
          </p>
        </header>
        <section className="space-y-3 text-gray-700 text-base leading-relaxed font-light">
          {rest.map((l, i) =>
            /^\d+\.\s/.test(l) ? (
              <h2 key={i} className="text-xl font-semibold text-gray-900 pt-4">{l}</h2>
            ) : /^\d+\.\d+\s/.test(l) ? (
              <h3 key={i} className="text-base font-semibold text-gray-900 pt-2">{l}</h3>
            ) : (
              <p key={i}>{l}</p>
            ),
          )}
        </section>
      </div>
    </div>
  );
}
