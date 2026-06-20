// app/admin/reports/_components/EditReportDrawer.tsx
//
// Right-side slide-over drawer used by the Articles and Events tabs on
// /admin/reports to edit the three override fields applied to the
// generated report preview:
//
//   - title          (overrides the tracked article/event title)
//   - pub_display    (overrides the branded publication header)
//   - editorial_note (optional free-form note shown above the metrics)
//
// The drawer is fully controlled: parent owns the override state, this
// component just renders inputs and Copy HTML / Copy plain text actions.
// Closing the drawer keeps whatever was typed (parent state isn't reset).
//
// Matches the visual language of AdvertiserReportDrawer so all three
// tabs (Articles, Events, Advertisers) share the same edit affordance.

'use client';

import { useCallback, useEffect } from 'react';
import type { ReportOverrides } from '../_types';

type Kind = 'article' | 'event';

interface Props {
  open: boolean;
  kind: Kind;
  // Display label used in the drawer header — typically the resolved
  // article / event title (override or tracked fallback).
  subjectLabel: string;
  overrides: ReportOverrides;
  // Setters for the three fields. Parent owns state so the live preview
  // outside the drawer updates as the admin types.
  onTitleChange: (v: string) => void;
  onPubDisplayChange: (v: string) => void;
  onEditorialNoteChange: (v: string) => void;
  // Copy actions are owned by the parent because the HTML/text builders
  // need access to the full report object (which lives there).
  onCopyHtml: () => void;
  onCopyPlain: () => void;
  // Optional status string (e.g. "HTML copied to clipboard") shown
  // beneath the action row. The parent clears it on its own timer.
  copyStatus: string | null;
  // Placeholder shown when the title field is empty.
  titlePlaceholder?: string;
  onClose: () => void;
}

export default function EditReportDrawer({
  open,
  kind,
  subjectLabel,
  overrides,
  onTitleChange,
  onPubDisplayChange,
  onEditorialNoteChange,
  onCopyHtml,
  onCopyPlain,
  copyStatus,
  titlePlaceholder,
  onClose,
}: Props) {
  // Esc to close — handy when the admin has the keyboard active.
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, handleKey]);

  if (!open) return null;

  const noun = kind === 'article' ? 'article' : 'event';
  const examplePlaceholder = kind === 'article'
    ? 'e.g. This article was featured in your June newsletter and on the RealtyLine homepage May 10–12.'
    : 'e.g. This event was promoted in the May newsletter and on the homepage May 1–7.';

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${noun} report`}
    >
      {/* Backdrop — click to close */}
      <button
        type="button"
        aria-label="Close edit panel"
        onClick={onClose}
        className="flex-1 bg-black/40 rounded-md"
      />

      {/* Drawer panel */}
      <div className="w-full max-w-md bg-white shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-200">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-gray-500">
              Edit {noun} report
            </p>
            <h2 className="text-base font-semibold text-gray-900 truncate">
              {subjectLabel || `Untitled ${noun}`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none -mt-1"
          >
            ×
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {kind === 'article' ? 'Article title' : 'Event title'}{' '}
              <span className="text-gray-400 font-normal">(override)</span>
            </label>
            <input
              type="text"
              value={overrides.title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder={titlePlaceholder || `Untitled ${noun}`}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#301D5D]/30"
            />
            <p className="text-xs text-gray-500 mt-1">
              Leave blank to use the {noun}&apos;s tracked title
              {kind === 'article' ? ' (often missing for older articles)' : ''}.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Publication <span className="text-gray-400 font-normal">(override)</span>
            </label>
            <select
              value={overrides.pub_display}
              onChange={(e) => onPubDisplayChange(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#301D5D]/30"
            >
              <option value="">— Use tracked publication —</option>
              <option value="RealtyLine Austin">RealtyLine Austin</option>
              <option value="Newsline San Antonio">Newsline San Antonio</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">Drives header branding and colors.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Editorial note <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={overrides.editorial_note}
              onChange={(e) => onEditorialNoteChange(e.target.value)}
              placeholder={examplePlaceholder}
              rows={4}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#301D5D]/30"
            />
          </div>
        </div>

        {/* Footer actions */}
        <div className="border-t border-gray-200 px-5 py-4 flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={onCopyHtml}
            className="bg-[#301D5D] hover:bg-[#493676] text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            Copy HTML
          </button>
          <button
            type="button"
            onClick={onCopyPlain}
            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-md text-sm font-medium"
          >
            Copy plain text
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-sm text-gray-600 hover:text-gray-900"
          >
            Done
          </button>
          {copyStatus && (
            <span className="w-full text-xs text-gray-600 mt-1">{copyStatus}</span>
          )}
        </div>
      </div>
    </div>
  );
}
