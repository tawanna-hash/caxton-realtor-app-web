import type { FooterTemplateId } from './footer-templates';

export const CUSTOM_DESIGN_VERSION = 1 as const;
export const CUSTOM_DESIGN_ELEMENT_KINDS = [
  'name',
  'title',
  'brokerage',
  'contact',
  'logo',
  'photo',
  'text',
  'qr',
  'block',
  'image',
  'line',
] as const;

export type CustomDesignElementKind = (typeof CUSTOM_DESIGN_ELEMENT_KINDS)[number];

export interface CustomDesignElement {
  id: string;
  kind: CustomDesignElementKind;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  color?: string;
  text?: string;
  zIndex?: number;
  fontFamily?: string;
  fontWeight?: number;
  textAlign?: 'left' | 'center' | 'right';
  backgroundColor?: string;
  borderRadius?: number;
  opacity?: number;
  src?: string;
}

export interface CustomDesignConfig {
  version: typeof CUSTOM_DESIGN_VERSION;
  layout: FooterTemplateId;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  elements: CustomDesignElement[];
}

export const PROTECTED_BROKER_ELEMENT_ID = 'brokerage';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const VALID_LAYOUTS: readonly FooterTemplateId[] = ['business-card', 'banner', 'signature', 'two-column'];
const VALID_KINDS: readonly CustomDesignElementKind[] = CUSTOM_DESIGN_ELEMENT_KINDS;
const VALID_FONT_FAMILIES = ['Arial', 'Georgia', 'Helvetica', 'Times New Roman', 'Verdana'] as const;
const VALID_TEXT_ALIGNMENTS = ['left', 'center', 'right'] as const;

const layouts: Record<FooterTemplateId, CustomDesignElement[]> = {
  'business-card': [
    { id: 'logo', kind: 'logo', x: 4, y: 18, width: 18, height: 42 },
    { id: PROTECTED_BROKER_ELEMENT_ID, kind: 'brokerage', x: 3, y: 63, width: 23, height: 22, fontSize: 15 },
    { id: 'name', kind: 'name', x: 29, y: 20, width: 29, height: 16, fontSize: 24 },
    { id: 'title', kind: 'title', x: 29, y: 38, width: 29, height: 12, fontSize: 12 },
    { id: 'contact', kind: 'contact', x: 61, y: 32, width: 34, height: 48, fontSize: 13 },
  ],
  banner: [
    { id: 'photo', kind: 'photo', x: 4, y: 8, width: 19, height: 55 },
    { id: 'name', kind: 'name', x: 3, y: 66, width: 22, height: 13, fontSize: 18, color: '#ffffff' },
    { id: 'title', kind: 'title', x: 3, y: 80, width: 22, height: 10, fontSize: 10, color: '#ffffff' },
    { id: 'contact', kind: 'contact', x: 31, y: 22, width: 36, height: 56, fontSize: 13 },
    { id: 'logo', kind: 'logo', x: 76, y: 17, width: 17, height: 32 },
    { id: PROTECTED_BROKER_ELEMENT_ID, kind: 'brokerage', x: 72, y: 55, width: 25, height: 28, fontSize: 15 },
  ],
  signature: [
    { id: 'photo', kind: 'photo', x: 3, y: 14, width: 23, height: 69 },
    { id: 'name', kind: 'name', x: 32, y: 13, width: 34, height: 15, fontSize: 23 },
    { id: 'title', kind: 'title', x: 32, y: 29, width: 32, height: 10, fontSize: 11 },
    { id: 'contact', kind: 'contact', x: 35, y: 45, width: 34, height: 45, fontSize: 13 },
    { id: 'logo', kind: 'logo', x: 77, y: 16, width: 16, height: 30 },
    { id: PROTECTED_BROKER_ELEMENT_ID, kind: 'brokerage', x: 72, y: 52, width: 25, height: 24, fontSize: 15 },
  ],
  'two-column': [
    { id: 'logo', kind: 'logo', x: 4, y: 15, width: 15, height: 35 },
    { id: PROTECTED_BROKER_ELEMENT_ID, kind: 'brokerage', x: 20, y: 18, width: 24, height: 33, fontSize: 15 },
    { id: 'name', kind: 'name', x: 48, y: 13, width: 30, height: 14, fontSize: 21 },
    { id: 'title', kind: 'title', x: 48, y: 29, width: 28, height: 10, fontSize: 10 },
    { id: 'contact', kind: 'contact', x: 48, y: 42, width: 31, height: 38, fontSize: 12 },
    {
      id: 'tagline',
      kind: 'text',
      x: 4,
      y: 84,
      width: 92,
      height: 12,
      fontSize: 14,
      color: '#ffffff',
      text: 'Results that move you.',
    },
  ],
};

export function createCustomDesignPreset(layout: FooterTemplateId): CustomDesignConfig {
  const palette = layout === 'two-column'
    ? { backgroundColor: '#ffffff', textColor: '#111827', accentColor: '#222222' }
    : { backgroundColor: '#ffffff', textColor: '#153f83', accentColor: '#08ace0' };
  return {
    version: CUSTOM_DESIGN_VERSION,
    layout,
    ...palette,
    elements: layouts[layout].map((element, index) => ({ ...element, zIndex: index + 1 })),
  };
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function safeColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : fallback;
}

function safeText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.slice(0, max);
}

function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().slice(0, 2_000);
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed) || /^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(trimmed)) {
    return trimmed;
  }
  return undefined;
}

export function normalizeCustomDesign(
  value: unknown,
  fallbackLayout: FooterTemplateId = 'business-card',
): CustomDesignConfig {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const layout = VALID_LAYOUTS.includes(raw.layout as FooterTemplateId)
    ? raw.layout as FooterTemplateId
    : fallbackLayout;
  const fallback = createCustomDesignPreset(layout);
  const rawElements = Array.isArray(raw.elements) ? raw.elements.slice(0, 24) : fallback.elements;
  const ids = new Set<string>();
  const elements: CustomDesignElement[] = [];

  for (const [index, item] of rawElements.entries()) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Record<string, unknown>;
    if (!VALID_KINDS.includes(candidate.kind as CustomDesignElementKind)) continue;
    const kind = candidate.kind as CustomDesignElementKind;
    const isBrokerage = kind === 'brokerage';
    let requestedId = typeof candidate.id === 'string'
      ? candidate.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60)
      : '';
    if (isBrokerage) requestedId = PROTECTED_BROKER_ELEMENT_ID;
    else if (requestedId === PROTECTED_BROKER_ELEMENT_ID) requestedId = `${kind}-${index + 1}`;
    const id = requestedId && !ids.has(requestedId) ? requestedId : `${kind}-${index + 1}`;
    if (ids.has(id)) continue;
    ids.add(id);
    elements.push({
      id,
      kind,
      x: finiteNumber(candidate.x, 10, 0, 96),
      y: finiteNumber(candidate.y, 10, 0, 96),
      width: finiteNumber(candidate.width, 24, isBrokerage ? 18 : 4, 100),
      height: finiteNumber(candidate.height, 16, isBrokerage ? 10 : 4, 100),
      fontSize: ['name', 'title', 'brokerage', 'contact', 'text'].includes(kind)
        ? finiteNumber(candidate.fontSize, 14, isBrokerage ? 12 : 8, 48)
        : undefined,
      color: typeof candidate.color === 'string'
        ? safeColor(candidate.color, fallback.textColor)
        : undefined,
      text: kind === 'text' || kind === 'qr' ? safeText(candidate.text, 500) : undefined,
      zIndex: finiteNumber(candidate.zIndex, index + 1, 0, 999),
      fontFamily: typeof candidate.fontFamily === 'string'
        && VALID_FONT_FAMILIES.includes(candidate.fontFamily as (typeof VALID_FONT_FAMILIES)[number])
        ? candidate.fontFamily
        : undefined,
      fontWeight: finiteNumber(candidate.fontWeight, kind === 'name' || kind === 'brokerage' ? 700 : 400, 300, 900),
      textAlign: typeof candidate.textAlign === 'string'
        && VALID_TEXT_ALIGNMENTS.includes(candidate.textAlign as (typeof VALID_TEXT_ALIGNMENTS)[number])
        ? candidate.textAlign as CustomDesignElement['textAlign']
        : undefined,
      backgroundColor: typeof candidate.backgroundColor === 'string'
        ? safeColor(candidate.backgroundColor, fallback.accentColor)
        : undefined,
      borderRadius: finiteNumber(candidate.borderRadius, 0, 0, 100),
      opacity: finiteNumber(candidate.opacity, 1, 0.1, 1),
      src: kind === 'image' ? safeUrl(candidate.src) : undefined,
    });
  }

  // TREC requires the broker's licensed/registered name to remain visible.
  if (!elements.some((element) => element.kind === 'brokerage')) {
    const broker = fallback.elements.find((element) => element.kind === 'brokerage');
    if (broker) elements.push({ ...broker, zIndex: 999 });
  }

  const protectedBroker = elements.find((element) => element.kind === 'brokerage');
  if (protectedBroker) {
    protectedBroker.id = PROTECTED_BROKER_ELEMENT_ID;
    protectedBroker.zIndex = 999;
    protectedBroker.opacity = 1;
  }

  return {
    version: CUSTOM_DESIGN_VERSION,
    layout,
    backgroundColor: safeColor(raw.backgroundColor, fallback.backgroundColor),
    textColor: safeColor(raw.textColor, fallback.textColor),
    accentColor: safeColor(raw.accentColor, fallback.accentColor),
    elements,
  };
}

export function isCustomElement(
  element: CustomDesignElement,
): element is CustomDesignElement & { kind: 'text' | 'qr' } {
  return element.kind === 'text' || element.kind === 'qr';
}

export function hexToRgb(hex: string, fallback: [number, number, number]): [number, number, number] {
  if (!HEX_COLOR.test(hex)) return fallback;
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}
