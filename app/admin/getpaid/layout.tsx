import GetPaidNav from './_components/GetPaidNav';

export default function GetPaidLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <GetPaidNav />
      {children}
    </div>
  );
}
