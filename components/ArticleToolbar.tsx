'use client';

interface ArticleToolbarProps {
  onBack: () => void;
  onMagazine?: () => void;
  onLatest: () => void;
  onShare: () => void;
}

/**
 * Floating bottom toolbar for the article reader (mobile only).
 * Hidden on desktop (md and above) — desktop uses keyboard / browser back.
 *
 * Layout: pill-shaped, semi-transparent dark background, 4 buttons:
 *   Back · Magazine · Latest · Share
 */
export function ArticleToolbar({ onBack, onMagazine, onLatest, onShare }: ArticleToolbarProps) {
  return (
    <div className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
      <div className="pointer-events-auto flex items-stretch gap-1 bg-black/85 backdrop-blur-md rounded-full px-2 py-1.5 shadow-lg">
        <ToolbarButton icon={<BackIcon />} label="Back" onClick={onBack} />
        <ToolbarButton icon={<MagazineIcon />} label="Magazine" onClick={onMagazine} />
        <ToolbarButton icon={<LatestIcon />} label="Latest" onClick={onLatest} />
        <ToolbarButton icon={<ShareIcon />} label="Share" onClick={onShare} />
      </div>
    </div>
  );
}

function ToolbarButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center min-w-[64px] px-2 py-1.5 rounded-full text-white/85 hover:text-white active:bg-white/10 transition-colors"
      aria-label={label}
    >
      {icon}
      <span className="text-[10px] uppercase tracking-wider mt-0.5 font-medium">{label}</span>
    </button>
  );
}

function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function MagazineIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function LatestIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
      <path d="M18 14h-8M15 18h-5M10 6h8M10 10h8" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v13" />
      <path d="M16 6l-4-4-4 4" />
      <rect x="4" y="9" width="16" height="13" rx="2" />
    </svg>
  );
}
