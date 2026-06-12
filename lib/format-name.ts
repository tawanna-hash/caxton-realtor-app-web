// lib/format-name.ts
//
// Personal-name display helpers. Real estate / title company team pages
// often render names in ALL CAPS (e.g. "ERNIE PEREZ") and our screenshot
// import path captures them verbatim, so we normalize before persisting
// and again defensively at render time.
//
// Goals:
//   * Convert "ERNIE PEREZ"   -> "Ernie Perez"
//   * Convert "ernie perez"   -> "Ernie Perez"
//   * Preserve "McDonald"     -> "McDonald" (don't lowercase the D)
//   * Preserve "O'Brien"      -> "O'Brien"
//   * Preserve hyphenated     -> "Mary-Jane Smith"
//   * Preserve roman numerals -> "John Smith III"
//   * Don't molest already-mixed input that wasn't fully upper:
//     if the input has at least one lowercase letter AND isn't
//     entirely uppercase, leave it alone.

const ROMAN = /^[IVXLCDM]+$/;
const SHORT_PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'da', 'das', 'do', 'dos', 'di', 'van', 'von', 'der', 'den', 'el', 'al', 'bin', 'ibn']);

/**
 * Title-case a single word, preserving apostrophes, hyphens, and common
 * Mc/Mac prefixes.
 */
function titleWord(word: string, isFirstOrLast: boolean): string {
  if (!word) return word;

  // Roman numerals (II, III, IV) stay uppercase
  if (ROMAN.test(word)) return word;

  // Lowercase short particles when they appear mid-name (van, de, la, etc.)
  // but capitalize at the very start or very end of the full name.
  const lower = word.toLowerCase();
  if (!isFirstOrLast && SHORT_PARTICLES.has(lower)) return lower;

  // Hyphenated: title-case each half
  if (word.includes('-')) {
    return word
      .split('-')
      .map((part, i, arr) => titleWord(part, isFirstOrLast && (i === 0 || i === arr.length - 1)))
      .join('-');
  }

  // Apostrophe: O'Brien, D'Angelo
  if (word.includes("'") || word.includes('\u2019')) {
    const sep = word.includes('\u2019') ? '\u2019' : "'";
    return word
      .split(sep)
      .map((part, i) => {
        if (part.length === 0) return part;
        // Capitalize both halves: "O'BRIEN" -> "O'Brien", but skip
        // tiny suffix like "'s" -> keep lowercase.
        if (i > 0 && part.length <= 2 && part.toLowerCase() === part) return part.toLowerCase();
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      })
      .join(sep);
  }

  // Mc/Mac prefixes: capitalize the next letter too
  if (lower.startsWith('mc') && word.length > 2) {
    return 'Mc' + word.charAt(2).toUpperCase() + word.slice(3).toLowerCase();
  }
  if (lower.startsWith('mac') && word.length > 3) {
    // Be conservative: only apply if the rest looks like a surname start.
    // "Macy" should stay "Macy", not "MacY". Heuristic: capitalize after
    // Mac only when the original input is fully upper (e.g. "MACDONALD"
    // becomes "MacDonald"); otherwise just sentence-case ("Macy"/"macy"
    // -> "Macy").
    const fullyUpper = word === word.toUpperCase();
    if (fullyUpper) {
      return 'Mac' + word.charAt(3).toUpperCase() + word.slice(4).toLowerCase();
    }
  }

  // Default: capitalize first letter, lowercase the rest.
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Title-case a full personal name. Returns the input unchanged if it
 * already looks correctly cased (has at least one lowercase letter and
 * isn't fully uppercase).
 */
export function toTitleCaseName(input: string | null | undefined): string {
  if (input === null || input === undefined) return '';
  const trimmed = String(input).trim();
  if (!trimmed) return '';

  const hasUpper = /[A-Z]/.test(trimmed);
  const hasLower = /[a-z]/.test(trimmed);

  // Already mixed-case AND not fully upper -> assume intentional.
  // (Names like "McDonald", "O'Brien", "DeLuca" pass through unchanged.)
  if (hasUpper && hasLower) return trimmed;

  // Fully uppercase, fully lowercase, or no-letters: rewrite.
  // Split on whitespace, title-case each word.
  const words = trimmed.split(/\s+/);
  return words
    .map((w, i) => titleWord(w, i === 0 || i === words.length - 1))
    .join(' ');
}

/**
 * Title-case a job title or role. More aggressive: lowercases common
 * filler words ("of", "and", "the") but always capitalizes the first
 * word and the last word.
 */
const TITLE_FILLER = new Set(['of', 'and', 'the', 'a', 'an', 'or', 'for', 'to', 'in', 'on', 'at']);

export function toTitleCaseRole(input: string | null | undefined): string {
  if (input === null || input === undefined) return '';
  const trimmed = String(input).trim();
  if (!trimmed) return '';

  const hasUpper = /[A-Z]/.test(trimmed);
  const hasLower = /[a-z]/.test(trimmed);
  if (hasUpper && hasLower) return trimmed;

  // Preserve known acronyms even after lowercasing pass.
  const ACRONYMS = new Set([
    'CEO', 'CFO', 'COO', 'CTO', 'CMO', 'VP', 'SVP', 'EVP', 'AVP',
    'VIP', 'MD', 'JD', 'PHD', 'PHD.', 'PH.D.', 'MBA',
    'HR', 'IT', 'PR', 'QA', 'AI',
    'MLS', 'IDX', 'REO', 'ABR', 'GRI', 'CRS', 'SRES', 'ALC', 'SIOR',
    'ESCROW', // not an acronym but often shown in caps in title-co websites — keep as Escrow via title-case path
  ]);

  const words = trimmed.split(/\s+/);
  return words
    .map((w, i) => {
      const stripped = w.replace(/[^A-Za-z]/g, '');
      const upper = stripped.toUpperCase();
      if (ACRONYMS.has(upper) && upper !== 'ESCROW') {
        // Preserve the acronym, keep any trailing punctuation.
        const suffix = w.slice(stripped.length);
        return upper + suffix;
      }
      const lower = w.toLowerCase();
      if (i > 0 && i < words.length - 1 && TITLE_FILLER.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}
