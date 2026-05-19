'use client';

export function DetailSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-semibold mb-2">{label}</p>
      <div className="border-t border-gray-300 pt-3">{children}</div>
    </div>
  );
}
