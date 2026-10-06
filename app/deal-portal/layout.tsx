// Client portal: a standalone page. It deliberately skips the Realty News Now site header, footer and navigation.
export default function DealPortalLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white">{children}</div>;
}
