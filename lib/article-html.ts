/**
 * Normalizes article body HTML so every article renders in the same house
 * style, regardless of where the HTML came from (WordPress, pasted from
 * InDesign/Pages/Word, or typed into the admin editor).
 *
 * - Drops pasted inline styles/classes (e.g. 9px Helvetica) so the shared
 *   `.caxton-article-prose` typography applies uniformly.
 * - Turns bare <div> blocks and loose leading text into real paragraphs.
 * - Promotes inline ALL-CAPS section labels into subheadings.
 * - Removes empty paragraphs, spacer <br>s and stray rules.
 *
 * Pure string transforms so it runs identically on the server and client.
 */

const BLOCK_START = /<(p|h[1-6]|ul|ol|blockquote|figure|table|pre|img|iframe)\b/i;

function splitCapsHeadings(html: string): string {
  // "...every time. SAFETY STARTS BEFORE THE SHOWING One of the easiest..."
  //  -> "...every time.</p><h3>Safety Starts Before The Showing</h3><p>One of..."
  const caps = /(^|[.!?”"’)]\s+)((?:[A-Z0-9][A-Z0-9’'&®:,-]*\s+){2,}[A-Z0-9][A-Z0-9’'&®:-]*)\s+(?=[A-Z][a-z])/g;
  return html.replace(/<p>([\s\S]*?)<\/p>/gi, (whole, inner: string) => {
    if (!caps.test(inner)) return whole;
    caps.lastIndex = 0;
    const replaced = inner.replace(caps, (_m, lead: string, heading: string) => {
      const title = heading.trim().toLowerCase().replace(/(^|\s|-)(\S)/g, (_x, s: string, c: string) => s + c.toUpperCase());
      return `${lead}</p><h3>${title}</h3><p>`;
    });
    return `<p>${replaced}</p>`;
  });
}

export function normalizeArticleHtml(raw: string | null | undefined): string {
  if (!raw) return '';
  let html = raw;

  // Pasted formatting: inline styles, classes, font/span wrappers.
  html = html
    .replace(/\s(?:style|class|face|size|color)\s*=\s*"[^"]*"/gi, '')
    .replace(/\s(?:style|class|face|size|color)\s*=\s*'[^']*'/gi, '')
    .replace(/<\/?(?:font|span)\b[^>]*>/gi, '')
    .replace(/<hr\b[^>]*\/?>/gi, '');

  // Bare divs are paragraphs in pasted content.
  html = html.replace(/<div\b[^>]*>/gi, '<p>').replace(/<\/div>/gi, '</p>');

  // Loose text before the first block element becomes a paragraph.
  const firstBlock = html.search(BLOCK_START);
  const lead = firstBlock === -1 ? html : html.slice(0, firstBlock);
  if (lead.replace(/<[^>]+>/g, '').trim()) {
    html = `<p>${lead}</p>${firstBlock === -1 ? '' : html.slice(firstBlock)}`;
  }

  // Collapse nested paragraphs produced by div -> p conversion.
  for (let i = 0; i < 4; i++) {
    const before = html;
    html = html.replace(/<p>\s*<p>/gi, '<p>').replace(/<\/p>\s*<\/p>/gi, '</p>');
    if (html === before) break;
  }

  html = splitCapsHeadings(html);

  // Empty paragraphs and spacer breaks.
  html = html
    .replace(/<p>(?:\s|&nbsp;|&#160;|<br\s*\/?>)*<\/p>/gi, '')
    .replace(/(?:<br\s*\/?>\s*){2,}/gi, '</p><p>')
    .replace(/<p>(?:\s|&nbsp;|&#160;|<br\s*\/?>)*<\/p>/gi, '');

  return html.trim();
}
