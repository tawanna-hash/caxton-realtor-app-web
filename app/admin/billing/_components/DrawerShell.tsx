'use client';

// app/admin/billing/_components/DrawerShell.tsx
//
// Shared right-side slide-over scaffolding used by both AgreementDrawer
// and InvoiceDrawer.

import type React from 'react';

export function DrawerShell({
  title, subtitle, onClose, children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-xl bg-white shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium">Billing</div>
            <h2 className="text-xl text-gray-900">{title}</h2>
            {subtitle && <div className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>
        <div className="p-6 space-y-6">{children}</div>
      </div>
    </div>
  );
}

export function DrawerFooter({
  saving, onCancel, onSubmit, submitLabel,
}: {
  saving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
}) {
  return (
    <div className="sticky bottom-0 -mx-6 px-6 py-4 bg-white border-t border-gray-200 flex items-center justify-end gap-2">
      <button onClick={onCancel} className="px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
      <button onClick={onSubmit} disabled={saving} className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50">
        {saving ? 'Saving…' : submitLabel}
      </button>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium">{title}</div>
      <div className="space-y-3">{children}</div>
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
