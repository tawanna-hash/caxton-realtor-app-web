import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const rewriteSchema = z.object({
  mode: z.enum(['polish', 'shorten', 'friendly', 'persuasive']),
  subject: z.string().max(998),
  previewText: z.string().max(150),
  body: z.string().max(100_000),
}).strict().refine(
  (value) => value.subject.trim().length > 0 || value.body.replace(/<[^>]*>/g, '').trim().length > 0,
  { message: 'Add a subject or message before requesting a rewrite.' },
);

const MODE_INSTRUCTIONS = {
  polish: 'Improve clarity, grammar, flow, and professionalism without changing the meaning or length unnecessarily.',
  shorten: 'Make the email noticeably shorter and easier to scan while retaining every important fact and call to action.',
  friendly: 'Make the email warmer, more conversational, and approachable while remaining professional.',
  persuasive: 'Make the value proposition and call to action more compelling without hype, pressure, or invented claims.',
} as const;

const EMAIL_ALLOWED_TAGS = [
  'p', 'br', 'hr', 'strong', 'em', 'b', 'i', 'u', 's', 'sub', 'sup',
  'a', 'span', 'div',
  'h1', 'h2', 'h3', 'h4',
  'ul', 'ol', 'li',
  'blockquote',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
];
const EMAIL_ALLOWED_ATTR = [
  'href', 'title', 'target', 'rel', 'class', 'align',
  'width', 'height', 'colspan', 'rowspan', 'style',
];

function fallbackScrub(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<(object|embed|form|input|button|meta|link|iframe)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '');
}

async function sanitizeEmailHtml(html: string): Promise<string> {
  try {
    const mod = await import('isomorphic-dompurify');
    const DOMPurify = mod.default ?? mod;
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: EMAIL_ALLOWED_TAGS,
      ALLOWED_ATTR: EMAIL_ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'button', 'meta', 'link', 'iframe'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit'],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    });
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      '[crm-email-rewrite] DOMPurify unavailable; using fallback scrubber',
    );
    return fallbackScrub(html);
  }
}

function extractJsonBlob(raw: string): string | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first === -1 || last < first) return null;
  return trimmed.slice(first, last + 1);
}

function candidateText(payload: unknown): string {
  const candidates = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })?.candidates;
  return candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('')
    .trim() ?? '';
}

function uniqueMatches(value: string, regex: RegExp): string[] {
  return Array.from(new Set(value.match(regex) ?? []));
}

export const POST = withAdminTracking(async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = rewriteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid rewrite request.' },
      { status: 400 },
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Rewrite suggestions are not configured yet.' },
      { status: 503 },
    );
  }

  const input = parsed.data;
  const model = process.env.GEMINI_TEXT_MODEL ?? 'gemini-2.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const sourceTokens = uniqueMatches(
    `${input.subject}\n${input.previewText}\n${input.body}`,
    /\{\{\s*[a-zA-Z0-9_.-]+\s*\}\}/g,
  );
  const sourceLinks = uniqueMatches(input.body, /https?:\/\/[^\s"'<>]+/g);
  const hasSignatureMarker = /<!--\s*signature-here\s*-->/.test(input.body);

  const prompt = `Rewrite this real-estate business email.

Rewrite goal:
${MODE_INSTRUCTIONS[input.mode]}

Safety and fidelity rules:
- Preserve the original meaning, all factual details, names, dates, prices, contact information, and calls to action.
- Do not invent facts, offers, deadlines, testimonials, or promises.
- Preserve every personalization token exactly, including its double braces.
- Preserve every URL exactly.
- Preserve the exact comment <!-- signature-here --> if it appears.
- Return body as an HTML fragment using simple email-safe formatting. Do not return a full HTML document.
- Keep previewText at 150 characters or fewer.
- Return only valid JSON with exactly these string fields: subject, previewText, body.

Original subject:
${input.subject}

Original preview text:
${input.previewText}

Original body HTML:
${input.body}`;

  let response: Response;
  try {
    response = await fetch(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 4_000,
          response_mime_type: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : String(error) },
      '[crm-email-rewrite] request failed',
    );
    return NextResponse.json(
      { error: 'The rewrite service did not respond. Please try again.' },
      { status: 502 },
    );
  }

  if (response.status === 429) {
    return NextResponse.json(
      { error: 'Rewrite suggestions are temporarily busy. Please try again in a moment.' },
      { status: 429 },
    );
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    logger.warn(
      { status: response.status, detail: detail.slice(0, 400) },
      '[crm-email-rewrite] non-2xx response',
    );
    return NextResponse.json(
      { error: 'The rewrite service could not create a suggestion.' },
      { status: 502 },
    );
  }

  const payload = await response.json().catch(() => null);
  const blob = extractJsonBlob(candidateText(payload));
  if (!blob) {
    return NextResponse.json({ error: 'The rewrite suggestion was incomplete. Please try again.' }, { status: 502 });
  }

  let suggestion: { subject?: unknown; previewText?: unknown; body?: unknown };
  try {
    suggestion = JSON.parse(blob) as typeof suggestion;
  } catch {
    return NextResponse.json({ error: 'The rewrite suggestion was incomplete. Please try again.' }, { status: 502 });
  }

  if (
    typeof suggestion.subject !== 'string'
    || typeof suggestion.previewText !== 'string'
    || typeof suggestion.body !== 'string'
  ) {
    return NextResponse.json({ error: 'The rewrite suggestion was incomplete. Please try again.' }, { status: 502 });
  }

  const suggestedBody = suggestion.body;
  const combinedSuggestion = `${suggestion.subject}\n${suggestion.previewText}\n${suggestedBody}`;
  const missingToken = sourceTokens.find((token) => !combinedSuggestion.includes(token));
  const missingLink = sourceLinks.find((link) => !suggestedBody.includes(link));
  if (missingToken || missingLink || (hasSignatureMarker && !/<!--\s*signature-here\s*-->/.test(suggestedBody))) {
    logger.warn(
      { missingToken: missingToken ?? null, missingLink: missingLink ?? null, hasSignatureMarker },
      '[crm-email-rewrite] protected content was not preserved',
    );
    return NextResponse.json(
      { error: 'The suggestion could not safely preserve all tokens and links. Please try again.' },
      { status: 502 },
    );
  }

  const cleanBody = await sanitizeEmailHtml(suggestedBody);
  if (hasSignatureMarker && !/<!--\s*signature-here\s*-->/.test(cleanBody)) {
    // DOMPurify can drop comments, so restore the known server-side signature marker.
    suggestion.body = `${cleanBody}\n<!-- signature-here -->`;
  } else {
    suggestion.body = cleanBody;
  }

  return NextResponse.json({
    suggestion: {
      subject: suggestion.subject.trim().slice(0, 998),
      previewText: suggestion.previewText.trim().slice(0, 150),
      body: suggestion.body,
    },
  });
});
