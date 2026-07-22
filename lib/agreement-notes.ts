// lib/agreement-notes.ts
//
// Cleans the rep's typed note for display in the signer page and the
// agreement email. agreement.notes also carries an auto-fallback
// ("Quote drafted — …") when the rep left it blank, and an appended
// override-pricing line ("Rack $X → Quoted $Y (Z% off)") for custom
// pricing. Strip both so only what the rep actually typed is shown.

const OVERRIDE_LINE =
  /^(Rack|Unit rack) \$[\d,]+(?:\.\d+)? → [Qq]uoted \$[\d,]+(?:\.\d+)? \(\d+(?:\.\d+)?% off\)$/;

export function cleanRepNote(notes: string | null | undefined): string | null {
  const raw = (notes ?? '').trim();
  if (!raw || raw.startsWith('Quote drafted —')) return null;
  const kept = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !OVERRIDE_LINE.test(l));
  return kept.length ? kept.join('\n') : null;
}
