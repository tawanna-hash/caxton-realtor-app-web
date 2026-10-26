// Display helpers shared by the ABOR, SABOR and DFW market report cards.
// Report rows come from admin entry or PDF extraction, so strings can arrive
// without Spanish accents and deltas can arrive incomplete. These helpers
// repair what can be repaired and hide what cannot, instead of showing garbage.

const ES_FIXES: Array<[RegExp, string]> = [
  [/\bano tras ano\b/gi, 'año tras año'],
  [/\bano\b/gi, 'año'],
  [/\bcomparacion\b/gi, 'comparación'],
  [/\bsesion\b/gi, 'sesión'],
  [/\bDias\b/g, 'Días'],
  [/\bdias\b/g, 'días'],
  [/\barea\b/gi, 'área'],
  [/\bmetropolitana\b/gi, 'metropolitana'],
  [/\bdescarga\b/gi, 'descarga'],
  [/\bmas\b/g, 'más'],
  [/\bAlquiler\b/g, 'Alquiler'],
  [/\bcomercial\b/g, 'comercial'],
];

const MONTHS_ES: Record<string, string> = {
  january: 'Enero', february: 'Febrero', march: 'Marzo', april: 'Abril',
  may: 'Mayo', june: 'Junio', july: 'Julio', august: 'Agosto',
  september: 'Septiembre', october: 'Octubre', november: 'Noviembre', december: 'Diciembre',
};

/** Restore accents on ASCII-only Spanish and translate English month names. */
export function esText(s: string | undefined | null): string {
  if (!s) return '';
  let out = s;
  for (const [re, rep] of ES_FIXES) {
    out = out.replace(re, (m) => (m[0] === m[0].toUpperCase() && m[0] !== m[0].toLowerCase() && rep[0] === rep[0].toLowerCase()
      ? rep[0].toUpperCase() + rep.slice(1)
      : rep));
  }
  out = out.replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/gi,
    (m) => MONTHS_ES[m.toLowerCase()]);
  // "SEPTIEMBRE 2026" stays shouty only if the source was shouty.
  return out;
}

export type Dir = 'up' | 'down' | 'flat' | undefined;

/**
 * A delta is shown only when it is a clean number (optionally with % or a
 * leading "<") and a direction is known. Anything else (missing direction,
 * lone "%", "2,.8%", or a prior-year comparison value) is dropped.
 */
export function cleanDelta(delta: string | undefined, dir: Dir): { delta: string; dir: Dir } | null {
  if (!delta || !dir) return null;
  const d = delta.trim();
  if (!/^<?\d+(\.\d+)?%?$/.test(d)) return null;
  return { delta: d, dir };
}

/** Drop stats that have no value (e.g. an empty duplicate of the headline). */
export function hasValue(s: { value?: string }): boolean {
  return !!s.value && s.value.trim().length > 0;
}
