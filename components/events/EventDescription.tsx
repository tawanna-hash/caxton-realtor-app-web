import type { ReactNode } from 'react';
import { tidyDescription } from '@/lib/events/text';

/**
 * Preset description design for every calendar event (scraped or manual).
 * Rules, applied to the whitespace-normalized text:
 *   - blank lines separate paragraphs (consistent 16px rhythm)
 *   - a short line ending in ":" becomes a small-caps subheading
 *   - consecutive "-", "*" or bullet lines become a tidy list
 *   - single line breaks inside a paragraph are kept
 *   - bare URLs and email addresses become links
 */
const URL_RE = /(https?:\/\/[^\s<>]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const BULLET_RE = /^\s*(?:[-*\u2022\u25cf\u25aa]|\d{1,2}[.)])\s+/;

function linkify(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(URL_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    let raw = m[0];
    let trail = '';
    const t = /[.,;:!?)]+$/.exec(raw);
    if (t) {
      trail = t[0];
      raw = raw.slice(0, -trail.length);
    }
    const href = raw.includes('@') && !raw.startsWith('http') ? `mailto:${raw}` : raw;
    out.push(
      <a
        key={`l${i++}`}
        href={href}
        className="text-[#2a1b5c] underline underline-offset-2 break-words"
        {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {raw}
      </a>,
    );
    if (trail) out.push(trail);
    last = idx + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'para'; lines: string[] };

function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of text.split(/\n{2,}/)) {
    const lines = chunk.split('\n').filter((l) => l.trim());
    if (!lines.length) continue;
    let para: string[] = [];
    let list: string[] = [];
    const flushPara = () => {
      if (para.length) blocks.push({ kind: 'para', lines: para });
      para = [];
    };
    const flushList = () => {
      if (list.length) blocks.push({ kind: 'list', items: list });
      list = [];
    };
    for (const line of lines) {
      if (BULLET_RE.test(line)) {
        flushPara();
        list.push(line.replace(BULLET_RE, ''));
      } else if (/^[^.!?]{2,60}:$/.test(line.trim())) {
        flushPara();
        flushList();
        blocks.push({ kind: 'heading', text: line.trim().replace(/:$/, '') });
      } else {
        flushList();
        para.push(line);
      }
    }
    flushPara();
    flushList();
  }
  return blocks;
}

export default function EventDescription({ text }: { text: string | null | undefined }) {
  const clean = tidyDescription(text);
  if (!clean) return null;
  const blocks = toBlocks(clean);
  return (
    <div className="max-w-prose space-y-4 text-base leading-relaxed font-light text-gray-700">
      {blocks.map((b, i) => {
        if (b.kind === 'heading') {
          return (
            <h3 key={i} className="pt-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
              {b.text}
            </h3>
          );
        }
        if (b.kind === 'list') {
          return (
            <ul key={i} className="list-disc space-y-1.5 pl-5 marker:text-gray-400">
              {b.items.map((it, j) => (
                <li key={j}>{linkify(it)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {b.lines.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {linkify(l)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
