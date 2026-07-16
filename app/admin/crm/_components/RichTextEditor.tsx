// app/admin/marketing/_components/RichTextEditor.tsx
//
// Dependency-free contentEditable rich text editor for the marketing email
// composer. Uses the legacy document.execCommand API — it's deprecated but
// still works in every browser we ship to, and for email-grade HTML it's
// the right tool: the output is plain <p>/<b>/<i>/<u>/<ul>/<ol>/<a>/<h2>
// /<blockquote>/<hr> which renders identically in every email client.
//
// Toolbar:
//   • Bold / Italic / Underline / Strikethrough
//   • H2 / H3 / Paragraph
//   • Bulleted + numbered lists
//   • Link (with prompt) / Unlink
//   • Quote / Horizontal rule
//   • Align left / center / right
//   • Insert token (passed in as prop)
//
// Output: HTML string via onChange(html). Tokens like {{first_name}} pass
// through untouched and are substituted on render.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  tokens?: Array<{ key: string; label: string }>;
  minHeight?: number;
};

// Wrap selection or insert at caret. execCommand is deprecated but the only
// portable way to manipulate a contentEditable; the alternative (Selection
// API + Range gymnastics) is much more error-prone for our needs.
function exec(cmd: string, value?: string) {
  try {
    document.execCommand(cmd, false, value);
  } catch {
    // Some commands (e.g. formatBlock) throw in older Safari. Ignore.
  }
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  tokens,
  minHeight = 220,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmittedRef = useRef<string>('');
  const [tokenMenuOpen, setTokenMenuOpen] = useState(false);
  const tokenMenuRef = useRef<HTMLDivElement>(null);

  // Sync external value -> DOM (only when it diverges from what we last
  // emitted, so we don't blow away the cursor while the user is typing).
  useEffect(() => {
    if (!editorRef.current) return;
    if (value === lastEmittedRef.current) return;
    if (editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  // Emit the editor's current HTML to the parent. All ref reads are
  // funneled through this single useCallback so the react-hooks/refs lint
  // rule sees a stable, hooked function rather than a factory created at
  // render-time.
  const emit = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    lastEmittedRef.current = html;
    onChange(html);
  }, [onChange]);

  // ── Toolbar handlers ────────────────────────────────────────────
  // Single stable handler taking command + optional value as data, called
  // from inline onClick={(e) => runCmd(e, 'bold')}. Avoids creating handler
  // factories during render (which trips react-hooks/refs).
  const runCmd = useCallback((e: React.MouseEvent, cmd: string, val?: string) => {
    e.preventDefault();
    editorRef.current?.focus();
    exec(cmd, val);
    emit();
  }, [emit]);

  const insertLink = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const url = window.prompt('Link URL', 'https://');
    if (!url) return;
    // Basic guard — only allow http(s) and mailto.
    if (!/^(https?:|mailto:)/i.test(url)) {
      window.alert('Only http(s) and mailto links are allowed.');
      return;
    }
    editorRef.current?.focus();
    exec('createLink', url);
    emit();
  }, [emit]);

  const insertToken = useCallback((token: string) => {
    editorRef.current?.focus();
    // Insert as plain text so the recipient render path can find it.
    exec('insertText', token);
    setTokenMenuOpen(false);
    emit();
  }, [emit]);

  const clearFormatting = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    editorRef.current?.focus();
    exec('removeFormat');
    exec('unlink');
    emit();
  }, [emit]);

  // Paste handler — strip MS Word / Google Docs noise to plain text +
  // paragraph breaks. Email clients hate the markup these editors produce.
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    // Replace double newlines with paragraph breaks, single newlines with <br>.
    const html = text
      .split(/\n{2,}/)
      .map((p) => p.replace(/\n/g, '<br>'))
      .map((p) => `<p>${escapeHtml(p)}</p>`)
      .join('');
    exec('insertHTML', html);
    emit();
  }, [emit]);

  // Click outside the token menu to close it.
  useEffect(() => {
    if (!tokenMenuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!tokenMenuRef.current) return;
      if (!tokenMenuRef.current.contains(e.target as Node)) {
        setTokenMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [tokenMenuOpen]);

  return (
    <div className="rounded-md border border-gray-300 bg-white overflow-hidden focus-within:border-brand-700 focus-within:ring-1 focus-within:ring-brand-700">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-gray-50 px-2 py-1.5">
        <Group>
          <ToolBtn label="B" title="Bold (⌘B)" onClick={(e) => runCmd(e, 'bold')} bold />
          <ToolBtn label="I" title="Italic (⌘I)" onClick={(e) => runCmd(e, 'italic')} italic />
          <ToolBtn label="U" title="Underline (⌘U)" onClick={(e) => runCmd(e, 'underline')} underline />
          <ToolBtn label="S" title="Strikethrough" onClick={(e) => runCmd(e, 'strikeThrough')} strike />
        </Group>

        <Group>
          <ToolBtn label="H2" title="Heading" onClick={(e) => runCmd(e, 'formatBlock', '<h2>')} />
          <ToolBtn label="H3" title="Subheading" onClick={(e) => runCmd(e, 'formatBlock', '<h3>')} />
          <ToolBtn label="¶" title="Paragraph" onClick={(e) => runCmd(e, 'formatBlock', '<p>')} />
        </Group>

        <Group>
          <ToolBtn label="• List" title="Bulleted list" onClick={(e) => runCmd(e, 'insertUnorderedList')} />
          <ToolBtn label="1. List" title="Numbered list" onClick={(e) => runCmd(e, 'insertOrderedList')} />
        </Group>

        <Group>
          <ToolBtn label="🔗" title="Insert link" onClick={insertLink} />
          <ToolBtn label="⊘" title="Remove link" onClick={(e) => runCmd(e, 'unlink')} />
          <ToolBtn label="❝" title="Quote" onClick={(e) => runCmd(e, 'formatBlock', '<blockquote>')} />
          <ToolBtn label="—" title="Horizontal rule" onClick={(e) => runCmd(e, 'insertHorizontalRule')} />
        </Group>

        <Group>
          <ToolBtn label="⇤" title="Align left" onClick={(e) => runCmd(e, 'justifyLeft')} />
          <ToolBtn label="↔" title="Align center" onClick={(e) => runCmd(e, 'justifyCenter')} />
          <ToolBtn label="⇥" title="Align right" onClick={(e) => runCmd(e, 'justifyRight')} />
        </Group>

        {tokens && tokens.length > 0 && (
          <Group>
            <div className="relative" ref={tokenMenuRef}>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); setTokenMenuOpen((v) => !v); }}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                {`{ }`} Token ▾
              </button>
              {tokenMenuOpen && (
                <div className="absolute left-0 top-full z-10 mt-1 min-w-[200px] rounded-md border border-gray-200 bg-white shadow-lg">
                  {tokens.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => insertToken(t.key)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs hover:bg-gray-50"
                    >
                      <span className="text-gray-700">{t.label}</span>
                      <code className="text-[10px] text-gray-500">{t.key}</code>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Group>
        )}

        <Group>
          <ToolBtn label="✕ Format" title="Clear formatting" onClick={clearFormatting} />
        </Group>
      </div>

      {/* Editable surface */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        onPaste={handlePaste}
        data-placeholder={placeholder ?? 'Write your email…'}
        className="rte-surface prose prose-sm max-w-none px-4 py-3 text-sm leading-relaxed text-gray-900 outline-none"
        style={{ minHeight }}
      />

      <style jsx>{`
        .rte-surface:empty::before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
        .rte-surface :global(h2) {
          font-family: Georgia, serif;
          font-size: 1.35rem;
          font-weight: 600;
          line-height: 1.3;
          margin: 0.75em 0 0.4em;
          color: #111827;
        }
        .rte-surface :global(h3) {
          font-family: Georgia, serif;
          font-size: 1.1rem;
          font-weight: 600;
          line-height: 1.3;
          margin: 0.6em 0 0.3em;
          color: #111827;
        }
        .rte-surface :global(p) {
          margin: 0 0 0.85em;
        }
        .rte-surface :global(ul),
        .rte-surface :global(ol) {
          margin: 0.5em 0 0.85em 1.4em;
        }
        .rte-surface :global(ul) { list-style: disc; }
        .rte-surface :global(ol) { list-style: decimal; }
        .rte-surface :global(li) { margin: 0.2em 0; }
        .rte-surface :global(a) {
          color: var(--color-brand-700, #301D5D);
          text-decoration: underline;
        }
        .rte-surface :global(blockquote) {
          margin: 0.5em 0 0.85em;
          padding: 0.4em 0.9em;
          border-left: 3px solid var(--color-brand-700, #301D5D);
          background: #fafafa;
          color: #4b5563;
          font-style: italic;
        }
        .rte-surface :global(hr) {
          border: 0;
          border-top: 1px solid #e5e7eb;
          margin: 1.2em 0;
        }
      `}</style>
    </div>
  );
}

// ── Tiny presentational helpers ────────────────────────────────────
function Group({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-0.5 pr-1 mr-1 border-r border-gray-200 last:border-r-0 last:mr-0 last:pr-0">
      {children}
    </div>
  );
}

function ToolBtn({
  label, title, onClick, bold, italic, underline, strike,
}: {
  label: string;
  title: string;
  onClick: (e: React.MouseEvent) => void;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={[
        'rounded-md px-2 py-1 text-xs text-gray-700 hover:bg-white hover:shadow-sm',
        'min-w-[26px] text-center',
        bold ? 'font-bold' : '',
        italic ? 'italic' : '',
        underline ? 'underline' : '',
        strike ? 'line-through' : '',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
