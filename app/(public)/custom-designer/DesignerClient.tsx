'use client';

import { ArrowLeft, ArrowRight, Download, FileCode2, GripVertical, ImagePlus, RotateCcw } from 'lucide-react';
import { useRef, useState } from 'react';

type Product = 'signature' | 'flyer';
type FlyerSize = 'us-letter' | 'insta-square' | 'insta-story' | 'fb-banner' | 'linkedin-banner';
type ArtboardKey = 'headshot' | 'details' | 'logo';

type SignatureFields = {
  name: string;
  title: string;
  company: string;
  phone: string;
  photo: string;
  logo: string;
};

type FlyerFields = {
  title: string;
  meta: string;
  body: string;
  image: string;
};

const FLYER_SIZES: Record<FlyerSize, { label: string; width: number; height: number }> = {
  'us-letter': { label: 'US Letter Print (8.5 × 11 in)', width: 420, height: 544 },
  'insta-square': { label: 'Instagram Post (1:1)', width: 450, height: 450 },
  'insta-story': { label: 'Mobile Portrait / Story (9:16)', width: 340, height: 604 },
  'fb-banner': { label: 'Facebook Cover Display (16:9)', width: 520, height: 292 },
  'linkedin-banner': { label: 'LinkedIn Profile Header (4:1)', width: 560, height: 140 },
};

const SIGNATURE_PRESETS = ['Split Column (Classic)', 'Minimal Rows (Stack)'];
const FLYER_PRESETS = ['Editorial Poster', 'Impact Display'];
const DEFAULT_ARTBOARD_ORDER: ArtboardKey[] = ['headshot', 'details', 'logo'];

const DEFAULT_SIGNATURE: SignatureFields = {
  name: 'Sarah Jenkins',
  title: 'VP of Enterprise Infrastructure',
  company: 'Acme Cloud Systems',
  phone: '+1 (555) 839-2011',
  photo: '',
  logo: '',
};

const DEFAULT_FLYER: FlyerFields = {
  title: 'ENTERPRISE SCALE INFRASTRUCTURE',
  meta: 'THURS, NOV 12 · 09:00 AM CST',
  body: 'Deploy multi-format digital experiences, cross-channel design distribution parameters, and modular client layout pipelines across your infrastructure.',
  image: '',
};

const FONT_OPTIONS = [
  { label: 'Modern Sans-Serif', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Classic Serif (Georgia)', value: 'Georgia, Times, serif' },
  { label: 'Technical Monospace', value: "'Courier New', monospace" },
  { label: 'Montserrat', value: 'Montserrat, Arial, sans-serif' },
  { label: 'Playfair Display', value: "'Playfair Display', Georgia, serif" },
  { label: 'Oswald Display', value: 'Oswald, Arial, sans-serif' },
  { label: 'Inter UI', value: 'Inter, Arial, sans-serif' },
];

export default function DesignerClient() {
  const [product, setProduct] = useState<Product>('signature');
  const [preset, setPreset] = useState(0);
  const [flyerSize, setFlyerSize] = useState<FlyerSize>('us-letter');
  const [primary, setPrimary] = useState('#0284c7');
  const [secondary, setSecondary] = useState('#475569');
  const [font, setFont] = useState(FONT_OPTIONS[0].value);
  const [fontWeight, setFontWeight] = useState(700);
  const [fontSize, setFontSize] = useState(16);
  const [background, setBackground] = useState('');
  const [signature, setSignature] = useState(DEFAULT_SIGNATURE);
  const [flyer, setFlyer] = useState(DEFAULT_FLYER);
  const [artboardOrder, setArtboardOrder] = useState<ArtboardKey[]>(DEFAULT_ARTBOARD_ORDER);
  const fileRef = useRef<HTMLInputElement>(null);
  const headshotRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  const presets = product === 'signature' ? SIGNATURE_PRESETS : FLYER_PRESETS;
  const dimensions = product === 'signature'
    ? { width: 760, height: 220 }
    : FLYER_SIZES[flyerSize];

  const switchProduct = (next: Product) => {
    setProduct(next);
    setPreset(0);
    setFontSize(next === 'signature' ? 16 : 24);
  };

  const uploadBackground = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setBackground(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(file);
  };

  const uploadSignatureArtwork = (kind: 'photo' | 'logo', file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSignature((value) => ({ ...value, [kind]: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const clearSignatureArtwork = (kind: 'photo' | 'logo') => {
    setSignature((value) => ({ ...value, [kind]: '' }));
    const target = kind === 'photo' ? headshotRef : logoRef;
    if (target.current) target.current.value = '';
  };

  const reorderArtboards = (source: ArtboardKey, target: ArtboardKey) => {
    if (source === target) return;
    setArtboardOrder((current) => {
      const next = [...current];
      const sourceIndex = next.indexOf(source);
      const targetIndex = next.indexOf(target);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, source);
      return next;
    });
  };

  const moveArtboard = (key: ArtboardKey, direction: -1 | 1) => {
    setArtboardOrder((current) => {
      const index = current.indexOf(key);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const clearBackground = () => {
    setBackground('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const reset = () => {
    setPreset(0);
    setFlyerSize('us-letter');
    setPrimary('#0284c7');
    setSecondary('#475569');
    setFont(FONT_OPTIONS[0].value);
    setFontWeight(700);
    setFontSize(product === 'signature' ? 16 : 24);
    setBackground('');
    setSignature(DEFAULT_SIGNATURE);
    setFlyer(DEFAULT_FLYER);
    setArtboardOrder(DEFAULT_ARTBOARD_ORDER);
    if (fileRef.current) fileRef.current.value = '';
    if (headshotRef.current) headshotRef.current.value = '';
    if (logoRef.current) logoRef.current.value = '';
  };

  const exportHtml = () => {
    if (!signature.name.trim() || !signature.company.trim()) {
      window.alert('TREC identification is required. Enter the license holder name and the broker licensed or assumed business name before exporting.');
      return;
    }
    const markup = product === 'signature'
      ? signatureMarkup(signature, preset, primary, secondary, font, fontSize, fontWeight, background, artboardOrder)
      : flyerMarkup(flyer, signature, preset, primary, secondary, font, fontSize, fontWeight, background, dimensions);
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RNN Custom Design</title></head><body style="margin:0">${markup}</body></html>`;
    downloadBlob(html, `rnn-${product}.html`, 'text/html');
  };

  const exportPdf = async () => {
    if (product !== 'flyer') return;
    if (!signature.name.trim() || !signature.company.trim()) {
      window.alert('TREC identification is required. Enter the license holder name and the broker licensed or assumed business name before exporting.');
      return;
    }
    const { jsPDF } = await import('jspdf');
    const landscape = dimensions.width > dimensions.height;
    const pdf = new jsPDF({
      orientation: landscape ? 'landscape' : 'portrait',
      unit: 'px',
      format: [dimensions.width, dimensions.height],
    });

    if (background) {
      try {
        const imageFormat = background.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        pdf.addImage(background, imageFormat, 0, 0, dimensions.width, dimensions.height);
      } catch {}
    }
    if (preset === 1) {
      pdf.setFillColor(15, 23, 42);
      pdf.rect(0, dimensions.height * 0.45, dimensions.width, dimensions.height * 0.55, 'F');
      pdf.setTextColor(255, 255, 255);
    } else {
      pdf.setFillColor(255, 255, 255);
      if (!background) pdf.rect(0, 0, dimensions.width, dimensions.height, 'F');
      pdf.setTextColor(15, 23, 42);
    }
    const margin = Math.max(20, Math.round(dimensions.width * 0.05));
    const startY = preset === 1 ? Math.round(dimensions.height * 0.64) : margin + 36;
    pdf.setFont('helvetica', fontWeight >= 700 ? 'bold' : 'normal');
    pdf.setFontSize(fontSize);
    const titleLines = pdf.splitTextToSize(flyer.title, dimensions.width - margin * 2);
    pdf.text(titleLines, margin, startY);
    const titleDepth = titleLines.length * fontSize * 1.1;
    pdf.setTextColor(primary);
    pdf.setFontSize(11);
    pdf.text(flyer.meta, margin, startY + titleDepth + 8);
    pdf.setTextColor(preset === 1 ? secondary : '#475569');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.text(pdf.splitTextToSize(flyer.body, dimensions.width - margin * 2), margin, startY + titleDepth + 28);
    const brokerSize = Math.max(10, Math.ceil(fontSize * 0.5));
    const complianceY = dimensions.height - margin;
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, complianceY - brokerSize * 2.8, dimensions.width, brokerSize * 2.8 + margin, 'F');
    pdf.setTextColor(15, 23, 42);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(Math.max(9, Math.ceil(brokerSize * 0.75)));
    pdf.text(`License holder: ${signature.name}`, margin, complianceY - brokerSize * 1.25);
    pdf.setFontSize(brokerSize);
    pdf.text(`Broker: ${signature.company}`, margin, complianceY);
    pdf.save(`rnn-${flyerSize}.pdf`);
  };

  return (
    <main className="min-h-[calc(100vh-64px)] bg-slate-300">
      <div className="grid min-h-[calc(100vh-64px)] xl:grid-cols-[410px_minmax(0,1fr)]">
        <aside className="overflow-y-auto border-r border-slate-800 bg-[#090d16] p-5 text-slate-100 xl:max-h-[calc(100vh-64px)]">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-400">Platinum Tools</p>
              <h1 className="text-lg font-extrabold tracking-tight">Design Engine Pro</h1>
            </div>
            <button type="button" onClick={reset} className="studio-secondary-button">
              <RotateCcw size={14} /> Reset
            </button>
          </div>

          <div className="space-y-4">
            <Control label="Product category">
              <select value={product} onChange={(event) => switchProduct(event.target.value as Product)} className="studio-control">
                <option value="signature">Email Signature Template</option>
                <option value="flyer">Marketing Flyer / Poster</option>
              </select>
            </Control>

            <Control label="Canvas background image">
              <div className="flex gap-2">
                <label className="flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-800 bg-[#111729] px-3 text-xs font-semibold text-slate-300 hover:border-sky-500">
                  <ImagePlus size={15} />
                  {background ? 'Replace image' : 'Upload image'}
                  <input ref={fileRef} type="file" accept="image/*" onChange={(event) => uploadBackground(event.target.files?.[0])} className="sr-only" />
                </label>
                <button type="button" onClick={clearBackground} className="studio-secondary-button">Clear</button>
              </div>
            </Control>

            <div className="grid grid-cols-2 gap-3">
              <ColorControl label="Primary brand color" value={primary} onChange={setPrimary} />
              <ColorControl label="Secondary accent" value={secondary} onChange={setSecondary} />
            </div>

            <Control label="Font family">
              <select value={font} onChange={(event) => setFont(event.target.value)} className="studio-control">
                {FONT_OPTIONS.map((option) => <option key={option.label} value={option.value}>{option.label}</option>)}
              </select>
            </Control>

            <div className="grid grid-cols-2 gap-3">
              <Control label="Headline weight">
                <select value={fontWeight} onChange={(event) => setFontWeight(Number(event.target.value))} className="studio-control">
                  <option value={300}>Light (300)</option>
                  <option value={400}>Regular (400)</option>
                  <option value={700}>Bold (700)</option>
                  <option value={900}>Black (900)</option>
                </select>
              </Control>
              <Control label={`Headline scale (${fontSize}px)`}>
                <input
                  type="range"
                  min={product === 'signature' ? 14 : 18}
                  max={product === 'signature' ? 22 : 36}
                  value={fontSize}
                  onChange={(event) => setFontSize(Number(event.target.value))}
                  className="studio-control accent-sky-500"
                />
              </Control>
            </div>

            {product === 'flyer' && (
              <Control label="Target medium / aspect ratio">
                <select value={flyerSize} onChange={(event) => setFlyerSize(event.target.value as FlyerSize)} className="studio-control">
                  {Object.entries(FLYER_SIZES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
                </select>
              </Control>
            )}

            <DividerLabel>Baseline layout presets</DividerLabel>
            <div className="grid grid-cols-2 gap-2">
              {presets.map((name, index) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setPreset(index)}
                  className={`min-h-14 rounded-md border-2 px-2 py-2 text-xs font-semibold ${preset === index ? 'border-sky-400 bg-sky-950 text-white' : 'border-slate-800 bg-[#111729] text-slate-400 hover:border-slate-600 hover:text-white'}`}
                >
                  {name}
                </button>
              ))}
            </div>

            <DividerLabel>Content data fields</DividerLabel>
            {product === 'signature' ? (
              <div className="space-y-4">
                <ArtworkPanel title="Personal details" description="Contact information and personal headshot">
                  <div className="space-y-3">
                    <TextControl label="Full name" value={signature.name} onChange={(name) => setSignature((value) => ({ ...value, name }))} />
                    <TextControl label="Job title" value={signature.title} onChange={(title) => setSignature((value) => ({ ...value, title }))} />
                    <TextControl label="Broker licensed or assumed business name (required)" value={signature.company} onChange={(company) => setSignature((value) => ({ ...value, company }))} />
                    <TextControl label="Direct phone" value={signature.phone} onChange={(phone) => setSignature((value) => ({ ...value, phone }))} />
                    <ArtworkUpload
                      label="Personal headshot"
                      actionLabel="Upload headshot"
                      value={signature.photo}
                      inputRef={headshotRef}
                      onUpload={(file) => uploadSignatureArtwork('photo', file)}
                      onClear={() => clearSignatureArtwork('photo')}
                      previewClassName="rounded-full object-cover"
                    />
                  </div>
                </ArtworkPanel>

                <ArtworkPanel title="Company logo" description="Upload the brokerage or company logo separately">
                  <ArtworkUpload
                    label="Company logo artwork"
                    actionLabel="Upload company logo"
                    value={signature.logo}
                    inputRef={logoRef}
                    onUpload={(file) => uploadSignatureArtwork('logo', file)}
                    onClear={() => clearSignatureArtwork('logo')}
                    previewClassName="object-contain"
                  />
                </ArtworkPanel>
              </div>
            ) : (
              <div className="space-y-3">
                <TextControl label="Main headline" value={flyer.title} onChange={(title) => setFlyer((value) => ({ ...value, title }))} />
                <TextControl label="Schedule matrix" value={flyer.meta} onChange={(meta) => setFlyer((value) => ({ ...value, meta }))} />
                <Control label="Body summary copy">
                  <textarea value={flyer.body} onChange={(event) => setFlyer((value) => ({ ...value, body: event.target.value }))} rows={4} className="studio-control resize-y" />
                </Control>
                <TextControl label="Hero content graphic URL" value={flyer.image} onChange={(image) => setFlyer((value) => ({ ...value, image }))} placeholder="https://…" />
                <ArtworkPanel title="TREC advertising identification" description="Protected identification appears on every flyer and cannot be removed from exports.">
                  <div className="space-y-3">
                    <TextControl label="License holder name (required)" value={signature.name} onChange={(name) => setSignature((value) => ({ ...value, name }))} />
                    <TextControl label="Broker licensed or assumed business name (required)" value={signature.company} onChange={(company) => setSignature((value) => ({ ...value, company }))} />
                    <p className="text-[11px] leading-relaxed text-slate-400">
                      Broker text automatically renders at no less than 50% of the largest agent or contact text.
                    </p>
                  </div>
                </ArtworkPanel>
              </div>
            )}

            <DividerLabel>Export distributions</DividerLabel>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={exportHtml} className="studio-export-button bg-sky-600 hover:bg-sky-700">
                <FileCode2 size={15} /> Download HTML
              </button>
              <button type="button" onClick={exportPdf} disabled={product !== 'flyer'} className="studio-export-button bg-emerald-600 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-35">
                <Download size={15} /> Generate PDF
              </button>
            </div>
          </div>
        </aside>

        <section className="flex min-h-[560px] flex-col">
          <div className="border-b border-slate-200 bg-white px-5 py-3 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
            Multi-format workspace preview
          </div>
          <div className="flex flex-1 items-center justify-center overflow-auto p-5 sm:p-10">
            <div
              className={`relative max-w-full overflow-hidden rounded shadow-2xl transition-[width,height] duration-300 ${product === 'signature' ? 'signature-preview-board' : ''}`}
              style={{
                width: product === 'signature' ? '100%' : dimensions.width,
                maxWidth: product === 'signature' ? dimensions.width : undefined,
                height: product === 'signature' ? 'auto' : dimensions.height,
                minHeight: product === 'signature' ? dimensions.height : undefined,
                backgroundColor: '#ffffff',
                backgroundImage: background ? `url(${background})` : undefined,
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: 'cover',
              }}
            >
              {product === 'signature' ? (
                <SignaturePreview
                  fields={signature}
                  preset={preset}
                  primary={primary}
                  secondary={secondary}
                  font={font}
                  fontSize={fontSize}
                  fontWeight={fontWeight}
                  order={artboardOrder}
                  onReorder={reorderArtboards}
                  onMove={moveArtboard}
                />
              ) : (
                <FlyerPreview fields={flyer} identity={signature} preset={preset} primary={primary} secondary={secondary} font={font} fontSize={fontSize} fontWeight={fontWeight} />
              )}
            </div>
          </div>
        </section>
      </div>

      <style jsx global>{`
        .studio-control {
          width: 100%;
          min-height: 40px;
          border: 1px solid #1e293b;
          border-radius: 6px;
          background: #111729;
          padding: 8px;
          color: white;
          font-size: 13px;
          outline: none;
        }
        .studio-control:focus { border-color: #38bdf8; }
        .studio-secondary-button {
          display: inline-flex;
          min-height: 40px;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border-radius: 6px;
          background: #1e293b;
          padding: 0 12px;
          color: white;
          font-size: 12px;
          font-weight: 600;
        }
        .studio-secondary-button:hover { background: #334155; }
        .studio-export-button {
          display: inline-flex;
          min-height: 44px;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border-radius: 6px;
          padding: 8px;
          color: white;
          font-size: 12px;
          font-weight: 700;
        }
        @media (max-width: 640px) {
          .signature-preview-board {
            min-height: 0 !important;
          }
          .signature-artboard-grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }
          .signature-artboard {
            min-height: 170px;
          }
        }
      `}</style>
    </main>
  );
}

function SignaturePreview({ fields, preset, primary, secondary, font, fontSize, fontWeight, order, onReorder, onMove }: {
  fields: SignatureFields;
  preset: number;
  primary: string;
  secondary: string;
  font: string;
  fontSize: number;
  fontWeight: number;
  order: ArtboardKey[];
  onReorder: (source: ArtboardKey, target: ArtboardKey) => void;
  onMove: (key: ArtboardKey, direction: -1 | 1) => void;
}) {
  const brokerSize = Math.max(10, Math.ceil(fontSize * 0.5));
  const headshot = fields.photo ? (
    // User-supplied headshot artwork must render directly in the signature.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={fields.photo} alt={`${fields.name} headshot`} className="h-24 w-24 rounded-full object-cover" />
  ) : (
    <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-200 text-2xl font-bold text-slate-500">
      {initials(fields.name)}
    </div>
  );

  const companyLogo = fields.logo ? (
    // User-supplied logo artwork must render directly in the signature.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={fields.logo} alt={`${fields.company} logo`} className="max-h-20 w-full object-contain" />
  ) : (
    <div className="text-center text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
      Company logo
    </div>
  );

  const details = preset === 1 ? (
    <div className="w-full">
      <div>
        <span style={{ color: '#0f172a', fontSize, fontWeight }}>{fields.name}</span>
        <span className="mt-1 block text-xs font-semibold" style={{ color: primary }}>{fields.title}</span>
      </div>
      <div className="mt-2 border-t border-slate-200 pt-2 text-[11px]">
        <strong className="text-slate-900" style={{ fontSize: brokerSize }}>{fields.company || 'Broker name required'}</strong>
        <span> &nbsp;·&nbsp; ☎ {fields.phone}</span>
      </div>
    </div>
  ) : (
    <div className="w-full border-l-[3px] pl-4" style={{ borderColor: primary }}>
      <div className="leading-tight text-slate-900" style={{ fontSize, fontWeight }}>{fields.name}</div>
      <div className="mt-1 text-[13px] font-semibold" style={{ color: primary }}>{fields.title}</div>
      <div className="mt-0.5 font-bold" style={{ fontSize: brokerSize }}>{fields.company || 'Broker name required'}</div>
      <div className="mt-1 text-[11px]">☎ {fields.phone}</div>
    </div>
  );

  const artboards: Record<ArtboardKey, { label: string; content: React.ReactNode }> = {
    headshot: { label: 'Headshot image', content: headshot },
    details: { label: 'Personal details', content: details },
    logo: { label: 'Company logo', content: companyLogo },
  };

  return (
    <div
      className="signature-artboard-grid grid w-full grid-cols-[170px_minmax(0,1fr)_190px] gap-3 p-4"
      style={{ fontFamily: font, color: secondary }}
    >
      {order.map((key, index) => (
        <SignatureArtboard
          key={key}
          artboardKey={key}
          label={artboards[key].label}
          index={index}
          total={order.length}
          onReorder={onReorder}
          onMove={onMove}
        >
          {artboards[key].content}
        </SignatureArtboard>
      ))}
    </div>
  );
}

function SignatureArtboard({
  artboardKey,
  label,
  index,
  total,
  onReorder,
  onMove,
  children,
}: {
  artboardKey: ArtboardKey;
  label: string;
  index: number;
  total: number;
  onReorder: (source: ArtboardKey, target: ArtboardKey) => void;
  onMove: (key: ArtboardKey, direction: -1 | 1) => void;
  children: React.ReactNode;
}) {
  return (
    <section
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', artboardKey);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(event) => {
        event.preventDefault();
        const source = event.dataTransfer.getData('text/plain') as ArtboardKey;
        if (source) onReorder(source, artboardKey);
      }}
      className="signature-artboard relative flex min-w-0 cursor-grab items-center justify-center rounded-md border border-slate-300 bg-white/95 p-4 pt-10 shadow-sm active:cursor-grabbing"
    >
      <div className="absolute inset-x-2 top-2 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
          <GripVertical size={12} className="shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        <span className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => onMove(artboardKey, -1)}
            disabled={index === 0}
            aria-label={`Move ${label} earlier`}
            className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowLeft size={12} />
          </button>
          <button
            type="button"
            onClick={() => onMove(artboardKey, 1)}
            disabled={index === total - 1}
            aria-label={`Move ${label} later`}
            className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowRight size={12} />
          </button>
        </span>
      </div>
      <div className="flex w-full items-center justify-center">{children}</div>
    </section>
  );
}

function FlyerPreview({ fields, identity, preset, primary, secondary, font, fontSize, fontWeight }: {
  fields: FlyerFields;
  identity: SignatureFields;
  preset: number;
  primary: string;
  secondary: string;
  font: string;
  fontSize: number;
  fontWeight: number;
}) {
  const brokerSize = Math.max(10, Math.ceil(fontSize * 0.5));
  const complianceBlock = (
    <div className="mt-3 border-t border-slate-300 bg-white/95 px-3 py-2 text-slate-900">
      <div className="font-semibold" style={{ fontSize: Math.max(9, Math.ceil(brokerSize * 0.75)) }}>
        License holder: {identity.name || 'Name required'}
      </div>
      <div className="font-extrabold" style={{ fontSize: brokerSize }}>
        Broker: {identity.company || 'Broker name required'}
      </div>
    </div>
  );

  if (preset === 1) {
    return (
      <div className="flex h-full w-full flex-col justify-end bg-gradient-to-b from-slate-900/5 via-slate-900/20 to-slate-950/95 p-5 text-white" style={{ fontFamily: font }}>
        <h2 className="m-0 leading-[1.1] text-white drop-shadow" style={{ fontSize, fontWeight }}>{fields.title}</h2>
        <p className="mt-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: primary }}>{fields.meta}</p>
        <p className="mt-3 max-w-none text-[11px] leading-relaxed" style={{ color: '#cbd5e1' }}>{fields.body}</p>
        {complianceBlock}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col justify-between p-5" style={{ fontFamily: font, color: secondary }}>
      <div>
        <span className="inline-block rounded px-2.5 py-1 text-[10px] font-bold tracking-wider text-white" style={{ backgroundColor: primary }}>INDUSTRY SYMPOSIUM</span>
        <h2 className="mt-3 uppercase leading-[1.1] tracking-tight text-slate-900" style={{ fontSize, fontWeight }}>{fields.title}</h2>
        <p className="mt-2 text-[11px] font-bold tracking-wide" style={{ color: primary }}>{fields.meta}</p>
        {fields.image && (
          // User-supplied URLs must render directly in the design preview.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fields.image} alt="" className="mt-3 max-h-36 w-full rounded object-cover" />
        )}
        <p className="mt-3 max-w-none rounded border border-slate-100 bg-white/90 p-3 text-xs leading-relaxed">{fields.body}</p>
      </div>
      <div>
        <div className="border-t border-slate-200 pt-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400">Corporate Resource Hub Access</div>
        {complianceBlock}
      </div>
    </div>
  );
}

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.05em] text-slate-400">{label}</span>{children}</label>;
}

function TextControl({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <Control label={label}><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="studio-control" /></Control>;
}

function ArtworkPanel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-700 bg-[#0d1321] p-3">
      <div className="mb-3 border-b border-slate-800 pb-3">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{description}</p>
      </div>
      {children}
    </section>
  );
}

function ArtworkUpload({
  label,
  actionLabel,
  value,
  inputRef,
  onUpload,
  onClear,
  previewClassName,
}: {
  label: string;
  actionLabel: string;
  value: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onUpload: (file?: File) => void;
  onClear: () => void;
  previewClassName: string;
}) {
  return (
    <Control label={label}>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(event) => {
          event.preventDefault();
          onUpload(event.dataTransfer.files?.[0]);
        }}
        className="rounded-md border border-dashed border-slate-700 bg-[#090d16] p-3 transition-colors hover:border-sky-500"
      >
        {value && (
          <div className="mb-3 flex h-20 items-center justify-center rounded bg-white p-2">
            {/* User-supplied artwork must render directly in its upload preview. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" className={`h-full max-w-full ${previewClassName}`} />
          </div>
        )}
        <p className="mb-2 text-center text-[11px] text-slate-500">
          Drag and drop an image here, or use the upload control.
        </p>
        <div className="flex gap-2">
          <label className="flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-sky-600 px-3 text-xs font-bold text-white hover:bg-sky-700">
            <ImagePlus size={15} />
            {value ? `Replace ${actionLabel.replace('Upload ', '')}` : actionLabel}
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(event) => onUpload(event.target.files?.[0])}
              className="sr-only"
            />
          </label>
          {value && (
            <button type="button" onClick={onClear} className="studio-secondary-button">
              Clear
            </button>
          )}
        </div>
      </div>
    </Control>
  );
}

function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Control label={label}>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-10 shrink-0 cursor-pointer rounded border border-slate-800 bg-transparent" />
        <input value={value.toUpperCase()} onChange={(event) => /^#[0-9a-fA-F]{6}$/.test(event.target.value) && onChange(event.target.value)} className="studio-control font-mono" />
      </div>
    </Control>
  );
}

function DividerLabel({ children }: { children: React.ReactNode }) {
  return <p className="border-t border-slate-800 pt-4 text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-500">{children}</p>;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'RNN';
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[character] ?? character);
}

function backgroundStyle(background: string) {
  return background ? `background-image:url('${background}');background-size:cover;background-position:center;` : '';
}

function signatureMarkup(fields: SignatureFields, preset: number, primary: string, secondary: string, font: string, fontSize: number, fontWeight: number, background: string, order: ArtboardKey[]) {
  const data = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, escapeHtml(value)])) as SignatureFields;
  const brokerSize = Math.max(10, Math.ceil(fontSize * 0.5));
  const labelStyle = 'display:block;font-size:9px;line-height:1;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;font-weight:700;margin-bottom:16px';
  const cellStyle = 'vertical-align:middle;background:rgba(255,255,255,.95);border:1px solid #cbd5e1;border-radius:6px;padding:12px';
  const avatar = data.photo
    ? `<img src="${data.photo}" alt="${data.name} headshot" width="96" height="96" style="border-radius:50%;display:block;object-fit:cover;margin:auto">`
    : `<div style="width:96px;height:96px;border-radius:50%;background:#e2e8f0;margin:auto"></div>`;
  const logo = data.logo
    ? `<img src="${data.logo}" alt="${data.company} logo" width="150" style="display:block;max-height:80px;object-fit:contain;margin:auto">`
    : `<div style="font-size:11px;text-align:center;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;font-weight:700">Company logo</div>`;
  const details = preset === 1
    ? `<span style="display:block;font-size:${fontSize}px;font-weight:${fontWeight};color:#0f172a">${data.name}</span><span style="display:block;font-size:12px;color:${primary};font-weight:600;margin-top:4px">${data.title}</span><div style="border-top:1px solid #e2e8f0;padding-top:7px;margin-top:7px;font-size:11px"><strong style="color:#0f172a;font-size:${brokerSize}px">${data.company}</strong> &nbsp;·&nbsp; ☎ ${data.phone}</div>`
    : `<div style="border-left:3px solid ${primary};padding-left:14px"><div style="font-size:${fontSize}px;font-weight:${fontWeight};color:#0f172a;line-height:1.2">${data.name}</div><div style="font-size:13px;color:${primary};font-weight:600;margin-top:3px">${data.title}</div><div style="font-size:${brokerSize}px;font-weight:700">${data.company}</div><div style="font-size:11px;margin-top:4px">☎ ${data.phone}</div></div>`;
  const cells: Record<ArtboardKey, string> = {
    headshot: `<td width="170" style="${cellStyle}"><span style="${labelStyle}">Headshot image</span>${avatar}</td>`,
    details: `<td style="${cellStyle}"><span style="${labelStyle}">Personal details</span>${details}</td>`,
    logo: `<td width="190" style="${cellStyle}"><span style="${labelStyle}">Company logo</span>${logo}</td>`,
  };
  const orderedCells = order.map((key) => cells[key]).join('');

  return `<table cellpadding="0" cellspacing="10" border="0" style="font-family:${font};color:${secondary};line-height:${preset === 1 ? '1.3' : '1.4'};width:760px;height:220px;padding:6px;box-sizing:border-box;border-collapse:separate;${backgroundStyle(background)}"><tr>${orderedCells}</tr></table>`;
}

function flyerMarkup(fields: FlyerFields, identity: SignatureFields, preset: number, primary: string, secondary: string, font: string, fontSize: number, fontWeight: number, background: string, dimensions: { width: number; height: number }) {
  const data = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, escapeHtml(value)])) as FlyerFields;
  const licenseHolderName = escapeHtml(identity.name);
  const brokerName = escapeHtml(identity.company);
  const brokerSize = Math.max(10, Math.ceil(fontSize * 0.5));
  const compliance = `<div style="margin-top:12px;border-top:1px solid #cbd5e1;background:rgba(255,255,255,.95);padding:8px 10px;color:#0f172a"><div style="font-size:${Math.max(9, Math.ceil(brokerSize * 0.75))}px;font-weight:600">License holder: ${licenseHolderName}</div><div style="font-size:${brokerSize}px;font-weight:800">Broker: ${brokerName}</div></div>`;
  const image = data.image ? `<img src="${data.image}" alt="" style="width:100%;max-height:140px;object-fit:cover;border-radius:4px;margin-top:12px">` : '';
  if (preset === 1) {
    const imageBackground = background || data.image;
    return `<div style="font-family:${font};width:${dimensions.width}px;height:${dimensions.height}px;color:#fff;display:flex;flex-direction:column;justify-content:flex-end;box-sizing:border-box;padding:20px;background:linear-gradient(to bottom,rgba(15,23,42,.1),rgba(15,23,42,.95))${imageBackground ? `,url('${imageBackground}')` : ''};background-size:cover;background-position:center"><h1 style="font-size:${fontSize}px;font-weight:${fontWeight};line-height:1.1;margin:0">${data.title}</h1><div style="font-size:11px;font-weight:700;color:${primary};margin-top:8px">${data.meta}</div><p style="font-size:11px;color:#cbd5e1;line-height:1.4;margin:10px 0 0">${data.body}</p>${compliance}</div>`;
  }
  return `<div style="font-family:${font};width:${dimensions.width}px;height:${dimensions.height}px;color:${secondary};display:flex;flex-direction:column;justify-content:space-between;box-sizing:border-box;padding:20px;${backgroundStyle(background)}"><div><span style="background:${primary};color:#fff;padding:4px 10px;font-size:10px;font-weight:700;letter-spacing:1px;border-radius:3px">INDUSTRY SYMPOSIUM</span><h1 style="font-size:${fontSize}px;font-weight:${fontWeight};color:#0f172a;line-height:1.1;margin:12px 0 6px;text-transform:uppercase">${data.title}</h1><div style="font-size:11px;font-weight:700;color:${primary}">${data.meta}</div>${image}<p style="font-size:12px;line-height:1.4;background:rgba(255,255,255,.9);padding:8px;border:1px solid #f1f5f9;border-radius:4px">${data.body}</p></div><div><div style="font-size:10px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:8px;font-weight:600">CORPORATE RESOURCE HUB ACCESS</div>${compliance}</div></div>`;
}

function downloadBlob(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
