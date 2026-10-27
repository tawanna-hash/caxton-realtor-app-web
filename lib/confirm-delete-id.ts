'use client';

/**
 * Typed-ID delete confirmation with a copy trigger: the ID is copied to the
 * clipboard first so the admin can paste it (Cmd/Ctrl+V) into the prompt.
 */
export function promptDeleteWithCopy(message: string, id: string): string | null {
  let copied = false;
  try {
    if (navigator.clipboard?.writeText) { void navigator.clipboard.writeText(id); copied = true; }
  } catch { copied = false; }
  if (!copied) {
    try {
      const ta = document.createElement('textarea');
      ta.value = id; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      copied = document.execCommand('copy');
      ta.remove();
    } catch { copied = false; }
  }
  const hint = copied ? '\n\nID copied to clipboard - paste it below (Cmd+V / Ctrl+V).' : '';
  const typed = window.prompt(`${message}\n${id}${hint}`);
  return typed === null ? null : typed.trim();
}
