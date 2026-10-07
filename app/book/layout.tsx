// Booking pages stand alone like the client portal: no site header, footer or navigation.
export default function BookLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#F6F3FB]">{children}</div>;
}
