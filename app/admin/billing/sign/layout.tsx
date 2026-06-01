// app/admin/billing/sign/layout.tsx
//
// Standalone layout for the public sign wizard flow.
// Bypasses the admin AppShell so no admin nav is shown.

export default function SignLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {children}
    </div>
  );
}
