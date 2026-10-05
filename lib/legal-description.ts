// Splits a CAD legal description such as "S7925 - Avery Ranch North Sec 2 Pud Amended, BLOCK B, Lot 7"
// into lot, block and addition. Anything that is not clearly present is left empty.
export function parseLegalDescription(text: string): { lot: string; block: string; addition: string } {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  const lot = /\bLOTS?\.?\s+([A-Za-z0-9-]+(?:\s*(?:,|&|AND)\s*[A-Za-z0-9-]+)*)/i.exec(t)?.[1]?.trim() ?? '';
  const block = /\b(?:BLOCK|BLK)\.?\s+([A-Za-z0-9-]+)/i.exec(t)?.[1]?.trim() ?? '';
  let rest = t.includes(' - ') ? t.slice(t.indexOf(' - ') + 3) : t;
  const first = rest.split(',')[0]?.trim() ?? '';
  const addition = /^(?:LOTS?|BLOCK|BLK)\b/i.test(first) ? '' : first;
  return { lot, block, addition };
}
