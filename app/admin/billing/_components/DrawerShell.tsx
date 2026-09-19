'use client';

// app/admin/billing/_components/DrawerShell.tsx
//
// Shared right-side slide-over scaffolding used by both AgreementDrawer
// and InvoiceDrawer.

import type React from 'react';

export function DrawerShell({
  title, subtitle, onClose, children, wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className={`flex h-dvh w-full flex-col bg-white shadow-xl ${wide ? 'max-w-[min(1180px,calc(100vw-48px))]' : 'max-w-xl'}`}>
        <div className="z-10 flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium">Billing</div>
            <h2 className="text-xl text-gray-900">{title}</h2>
            {subtitle && <div className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

export function DrawerFooter({
  saving, onCancel, onSubmit, submitLabel, tone = 'blue',
}: {
  saving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  tone?: 'blue' | 'orange';
}) {
  const submitColor = tone === 'orange'
    ? 'bg-orange-600 hover:bg-orange-700'
    : 'bg-blue-600 hover:bg-blue-700';

  return (
    <div className="sticky bottom-0 -mx-6 px-6 py-4 bg-white border-t border-gray-200 flex items-center justify-end gap-2">
      <button onClick={onCancel} className="px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 whitespace-nowrap">Cancel</button>
      <button onClick={onSubmit} disabled={saving} className={`px-4 py-2 rounded-md text-white text-sm disabled:opacity-50 whitespace-nowrap ${submitColor}`}>
        {saving ? 'Saving…' : submitLabel}
      </button>
    </div>
  );
}

export function Section({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`space-y-2 rounded-md border border-gray-200 bg-white p-3 ${className}`}>
      <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium">{title}</div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export function Field({
  label, children, className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <div className="text-xs text-gray-600 mb-1">{label}</div>
      {children}
    </label>
  );
}
