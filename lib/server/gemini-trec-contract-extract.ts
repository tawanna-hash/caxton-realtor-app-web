import { logger } from './logger';

export type TrecExtractedWorksheet = Record<string, string>;

export interface TrecContractExtract {
  title?: string;
  worksheet: TrecExtractedWorksheet;
  addenda: Record<string, boolean>;
  warnings: string[];
}

export type TrecContractExtractResult =
  | { ok: true; data: TrecContractExtract }
  | { ok: false; reason: 'no-key' | 'rate-limit' | 'parse-error' | 'http-error' | 'timeout'; detail?: string };

const MODEL = process.env.GEMINI_VISION_MODEL ?? 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const TIMEOUT_MS = 55_000;

const WORKSHEET_KEYS = [
  'buyerNames',
  'sellerNames',
  'propertyAddress',
  'county',
  'legalDescription',
  'improvementsAndAccessories',
  'exclusions',
  'cashPortion',
  'loanAmount',
  'salesPrice',
  'financingType',
  'financingNotes',
  'earnestMoney',
  'titleCompany',
  'optionFee',
  'optionDays',
  'additionalEarnestMoney',
  'additionalEarnestMoneyDays',
  'financingDeadlineDays',
  'appraisalDeadlineDays',
  'titleCommitmentDays',
  'surveyDays',
  'titleObjectionDays',
  'titlePolicyPayer',
  'surveyPlan',
  'titleAndSurveyNotes',
  'conditionAndRepairNotes',
  'closingDate',
  'possessionPlan',
  'specialProvisionsNotes',
  'settlementNotes',
  'notices',
  'effectiveDate',
] as const;

const ADDENDA = [
  'Third-Party Financing Addendum',
  'HOA Addendum',
  'Seller’s Disclosure',
  'Lead-Based Paint Addendum',
  'Non-Realty Items Addendum',
  'Temporary Lease Addendum',
  'Back-Up Contract Addendum',
  'VA Loan Addendum',
  'PID / MUD Notice',
] as const;

const SYSTEM_PROMPT = `You are a high-precision information-extraction service for an executed Texas TREC 1-4 One to Four Family Residential Contract (Resale) and its attached addenda.

Read the uploaded PDF or image and return ONLY valid JSON, with no markdown or commentary. This is a suggestion layer for an admin to review, never a legal determination.

Schema:
{
  "title": "short property/deal label or null",
  "worksheet": {
    "buyerNames": "string or null",
    "sellerNames": "string or null",
    "propertyAddress": "string or null",
    "county": "string or null",
    "legalDescription": "string or null",
    "improvementsAndAccessories": "string or null",
    "exclusions": "string or null",
    "cashPortion": "string or null",
    "loanAmount": "string or null",
    "salesPrice": "string or null",
    "financingType": "string or null",
    "financingNotes": "string or null",
    "earnestMoney": "string or null",
    "titleCompany": "string or null",
    "optionFee": "string or null",
    "optionDays": "whole-number string or null",
    "additionalEarnestMoney": "string or null",
    "additionalEarnestMoneyDays": "whole-number string or null",
    "financingDeadlineDays": "whole-number string or null",
    "appraisalDeadlineDays": "whole-number string or null",
    "titleCommitmentDays": "whole-number string or null",
    "surveyDays": "whole-number string or null",
    "titleObjectionDays": "whole-number string or null",
    "titlePolicyPayer": "string or null",
    "surveyPlan": "string or null",
    "titleAndSurveyNotes": "string or null",
    "conditionAndRepairNotes": "string or null",
    "closingDate": "YYYY-MM-DD or null",
    "possessionPlan": "string or null",
    "specialProvisionsNotes": "string or null",
    "settlementNotes": "string or null",
    "notices": "string or null",
    "effectiveDate": "YYYY-MM-DD or null"
  },
  "addenda": {
    "Third-Party Financing Addendum": true or false,
    "HOA Addendum": true or false,
    "Seller’s Disclosure": true or false,
    "Lead-Based Paint Addendum": true or false,
    "Non-Realty Items Addendum": true or false,
    "Temporary Lease Addendum": true or false,
    "Back-Up Contract Addendum": true or false,
    "VA Loan Addendum": true or false,
    "PID / MUD Notice": true or false
  },
  "warnings": ["brief ambiguity or unreadable item"]
}

Rules:
- Extract only information visibly present in the uploaded contract and addenda. Do not infer, calculate, complete blanks, or guess.
- Preserve names, dollar amounts, legal descriptions, addresses, and contract language as shown. Do not add legal wording.
- Use YYYY-MM-DD only when the exact date is visible or unambiguous. For effectiveDate, use the final executed effective date only when it is clearly shown; otherwise null.
- Return days only where the signed contract or an attached addendum clearly specifies that period. Do not derive deadline days from a calendar date.
- Do not populate actual delivered-date fields because the document cannot establish actual delivery. Do not return them.
- For a checkbox/addendum that is not visibly attached or selected, return false. If it is unclear, return false and put the uncertainty in warnings.
- If a field is absent or unreadable, use null.`;

function asTrimmedString(value: unknown, max = 20_000): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function asIsoDate(value: unknown): string | undefined {
  const stringValue = asTrimmedString(value);
  return stringValue && /^\d{4}-\d{2}-\d{2}$/.test(stringValue) ? stringValue : undefined;
}

function asWholeNumber(value: unknown): string | undefined {
  const stringValue = asTrimmedString(value);
  return stringValue && /^\d+$/.test(stringValue) ? stringValue : undefined;
}

function extractText(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidates = (payload as Record<string, unknown>).candidates;
  if (!Array.isArray(candidates)) return null;
  for (const candidate of candidates) {
    const content = candidate && typeof candidate === 'object'
      ? (candidate as Record<string, unknown>).content
      : null;
    const parts = content && typeof content === 'object'
      ? (content as Record<string, unknown>).parts
      : null;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') {
        return (part as Record<string, string>).text;
      }
    }
  }
  return null;
}

function normalize(raw: unknown): TrecContractExtract {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const sourceWorksheet = source.worksheet && typeof source.worksheet === 'object'
    ? source.worksheet as Record<string, unknown>
    : {};
  const sourceAddenda = source.addenda && typeof source.addenda === 'object'
    ? source.addenda as Record<string, unknown>
    : {};
  const worksheet: TrecExtractedWorksheet = {};
  for (const key of WORKSHEET_KEYS) {
    const value = ['effectiveDate', 'closingDate'].includes(key)
      ? asIsoDate(sourceWorksheet[key])
      : key.endsWith('Days')
        ? asWholeNumber(sourceWorksheet[key])
        : asTrimmedString(sourceWorksheet[key]);
    if (value) worksheet[key] = value;
  }

  const addenda: Record<string, boolean> = {};
  for (const addendum of ADDENDA) {
    addenda[addendum] = sourceAddenda[addendum] === true;
  }

  const warnings = Array.isArray(source.warnings)
    ? source.warnings.map((item) => asTrimmedString(item, 500)).filter((item): item is string => Boolean(item)).slice(0, 12)
    : [];
  const title = asTrimmedString(source.title, 180);
  return { ...(title ? { title } : {}), worksheet, addenda, warnings };
}

export async function extractTrecContract({
  base64,
  mimeType,
}: {
  base64: string;
  mimeType: string;
}): Promise<TrecContractExtractResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, reason: 'no-key', detail: 'GEMINI_API_KEY not set' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{
          role: 'user',
          parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            { text: 'Extract the contract facts into the requested JSON schema.' },
          ],
        }],
        generation_config: {
          temperature: 0,
          response_mime_type: 'application/json',
          max_output_tokens: 8192,
        },
      }),
    });
    if (response.status === 429) return { ok: false, reason: 'rate-limit', detail: 'Gemini rate limit' };
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      logger.warn({}, `[trec-contract-extract] Gemini status=${response.status} detail=${detail.slice(0, 300)}`);
      return { ok: false, reason: 'http-error', detail: `status ${response.status}` };
    }
    const text = extractText(await response.json());
    if (!text) return { ok: false, reason: 'parse-error', detail: 'empty extraction response' };
    try {
      return { ok: true, data: normalize(JSON.parse(text)) };
    } catch {
      return { ok: false, reason: 'parse-error', detail: 'extraction response was not valid JSON' };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('aborted')) return { ok: false, reason: 'timeout', detail: 'Extraction timed out' };
    return { ok: false, reason: 'http-error', detail: message };
  } finally {
    clearTimeout(timeout);
  }
}
