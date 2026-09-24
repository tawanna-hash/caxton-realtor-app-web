type Props = {
  category?: string | null;
  headline: string;
  summary?: string | null;
  date?: string | null;
  imageUrl?: string | null;
};

export default function ArticleFeedCardBody({ category, headline, summary, date, imageUrl }: Props) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex-1 min-w-0">
        {category && <span className="text-xs uppercase tracking-[0.15em] font-medium text-brand-700 mb-2 block">{category}</span>}
        <h3 className="text-lg text-gray-900 leading-snug mb-2 font-semibold">{headline}</h3>
        {summary && <p className="text-sm text-gray-500 leading-relaxed mb-3 font-light">{summary}</p>}
        {date && <span className="text-xs text-gray-400 font-light">{date}</span>}
      </div>
      {imageUrl && (
        <div className="flex-shrink-0 w-32 h-28 bg-gray-100 border border-gray-200 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        </div>
      )}
    </div>
  );
}
