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
  email: string;
  website: string;
  photo: string;
  logo: string;
};

type FlyerFields = {
  eyebrow: string;
  title: string;
  meta: string;
  body: string;
  image: string;
  image2: string;
  image3: string;
  image4: string;
  listing1Title: string;
  listing1Meta: string;
  listing2Title: string;
  listing2Meta: string;
  listing3Title: string;
  listing3Meta: string;
  features: string;
  contact: string;
  footer: string;
};

const FLYER_SIZES: Record<FlyerSize, { label: string; width: number; height: number }> = {
  'us-letter': { label: 'US Letter Print (8.5 × 11 in)', width: 420, height: 544 },
  'insta-square': { label: 'Instagram Post (1:1)', width: 450, height: 450 },
  'insta-story': { label: 'Mobile Portrait / Story (9:16)', width: 340, height: 604 },
  'fb-banner': { label: 'Facebook Cover Display (16:9)', width: 520, height: 292 },
  'linkedin-banner': { label: 'LinkedIn Profile Header (4:1)', width: 560, height: 140 },
};

const SIGNATURE_PRESETS = ['Split Column (Classic)', 'Minimal Rows (Stack)'];
const FLYER_PRESETS = ['Editorial Poster', 'Impact Display', 'Luxury Listings', 'Property Showcase'];
const DEFAULT_ARTBOARD_ORDER: ArtboardKey[] = ['headshot', 'details', 'logo'];

const DEFAULT_SIGNATURE: SignatureFields = {
  name: 'Sarah Jenkins',
  title: 'VP of Enterprise Infrastructure',
  company: 'Acme Cloud Systems',
  phone: '+1 (555) 839-2011',
  email: 'sarah@example.com',
  website: 'example.com',
  photo: '',
  logo: '',
};

const DEFAULT_FLYER: FlyerFields = {
  eyebrow: 'FEATURED COLLECTION',
  title: 'MODERN HOME FOR SALE',
  meta: '$3.5M · 4 Bed · 4 Bath · 3,200 sq ft',
  body: 'Discover thoughtfully selected properties with refined architecture, generous interiors, and exceptional locations.',
  image: '',
  image2: '',
  image3: '',
  image4: '',
  listing1Title: 'Residence One',
  listing1Meta: '$850,000 · 3 Bed · 2 Bath',
  listing2Title: 'Residence Two',
  listing2Meta: '$1.2M · 4 Bed · 3 Bath',
  listing3Title: 'Residence Three',
  listing3Meta: '$2M · 5 Bed · 4 Bath',
  features: 'Expert local guidance\nPremium property access\nMarket insight and support\nA tailored search experience',
  contact: 'Contact us\n(512) 555-0147\nhello@example.com',
  footer: 'Schedule a private tour or request complete property details.',
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
  const previewRef = useRef<HTMLDivElement>(null);

  const dimensions = product === 'signature'
    ? { width: 760, height: 220 }
    : FLYER_SIZES[flyerSize];

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

  const uploadFlyerArtwork = (key: 'image' | 'image2' | 'image3' | 'image4', file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setFlyer((value) => ({ ...value, [key]: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const selectTemplate = (value: string) => {
    const [nextProduct, rawPreset] = value.split(':') as [Product, string];
    const index = Number(rawPreset);
    setProduct(nextProduct);
    setPreset(index);
    setFontSize(nextProduct === 'signature' ? 16 : index >= 2 ? 30 : 24);
    if (nextProduct === 'flyer' && index >= 2) {
      setPrimary('#d8cdb9');
      setSecondary('#1c2d42');
      setFont(FONT_OPTIONS[1].value);
      setFontWeight(400);
    }
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

    if (preset >= 2 && previewRef.current) {
      await pdf.html(previewRef.current, {
        callback: (document) => document.save(`rnn-${flyerSize}.pdf`),
        x: 0,
        y: 0,
        width: dimensions.width,
        windowWidth: dimensions.width,
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      });
      return;
    }

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
    pdf.rect(0, complianceY - brokerSize * 3.4, dimensions.width, brokerSize * 3.4 + margin, 'F');
    let complianceX = margin;
    if (signature.logo) {
      try {
        const logoFormat = signature.logo.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        pdf.addImage(signature.logo, logoFormat, margin, complianceY - brokerSize * 2.3, 44, 22);
        complianceX += 52;
      } catch {}
    }
    pdf.setTextColor(15, 23, 42);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(Math.max(9, Math.ceil(brokerSize * 0.75)));
    pdf.text(`License holder: ${signature.name}`, complianceX, complianceY - brokerSize * 1.65);
    pdf.setFontSize(brokerSize);
    pdf.text(`Broker: ${signature.company}`, complianceX, complianceY - brokerSize * 0.65);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.text([signature.phone, signature.email, signature.website].filter(Boolean).join(' · '), complianceX, complianceY);
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
              <select value={`${product}:${preset}`} onChange={(event) => selectTemplate(event.target.value)} className="studio-control">
                <optgroup label="Email signatures">
                  {SIGNATURE_PRESETS.map((name, index) => <option key={`signature-${name}`} value={`signature:${index}`}>{name}</option>)}
                </optgroup>
                <optgroup label="Marketing flyers and social media">
                  {FLYER_PRESETS.map((name, index) => <option key={`flyer-${name}`} value={`flyer:${index}`}>{name}</option>)}
                </optgroup>
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

            <DividerLabel>Content data fields</DividerLabel>
            {product === 'signature' ? (
              <div className="space-y-4">
                <ArtworkPanel title="Personal details" description="Contact information and personal headshot">
                  <div className="space-y-3">
                    <TextControl label="Full name" value={signature.name} onChange={(name) => setSignature((value) => ({ ...value, name }))} />
                    <TextControl label="Job title" value={signature.title} onChange={(title) => setSignature((value) => ({ ...value, title }))} />
                    <TextControl label="Broker licensed or assumed business name (required)" value={signature.company} onChange={(company) => setSignature((value) => ({ ...value, company }))} />
                    <TextControl label="Direct phone" value={signature.phone} onChange={(phone) => setSignature((value) => ({ ...value, phone }))} />
                    <TextControl label="Email" value={signature.email} onChange={(email) => setSignature((value) => ({ ...value, email }))} />
                    <TextControl label="Website" value={signature.website} onChange={(website) => setSignature((value) => ({ ...value, website }))} />
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
                <TextControl label={preset >= 2 ? 'Eyebrow / label' : 'Main headline'} value={preset >= 2 ? flyer.eyebrow : flyer.title} onChange={(value) => setFlyer((current) => ({ ...current, [preset >= 2 ? 'eyebrow' : 'title']: value }))} />
                {preset >= 2 && (
                  <TextControl label="Main headline" value={flyer.title} onChange={(title) => setFlyer((value) => ({ ...value, title }))} />
                )}
                <TextControl label={preset >= 2 ? 'Price and property details' : 'Schedule matrix'} value={flyer.meta} onChange={(meta) => setFlyer((value) => ({ ...value, meta }))} />
                <Control label="Body summary copy">
                  <textarea value={flyer.body} onChange={(event) => setFlyer((value) => ({ ...value, body: event.target.value }))} rows={4} className="studio-control resize-y" />
                </Control>
                {preset < 2 ? (
                  <TextControl label="Hero content graphic URL" value={flyer.image} onChange={(image) => setFlyer((value) => ({ ...value, image }))} placeholder="https://…" />
                ) : (
                  <>
                    <ArtworkPanel title="Property photography" description="Upload the hero and three supporting property images.">
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          ['image', 'Hero photo'],
                          ['image2', 'Property photo 1'],
                          ['image3', 'Property photo 2'],
                          ['image4', 'Property photo 3'],
                        ] as const).map(([key, label]) => (
                          <FlyerImageUpload
                            key={key}
                            label={label}
                            value={flyer[key]}
                            onUpload={(file) => uploadFlyerArtwork(key, file)}
                            onClear={() => setFlyer((value) => ({ ...value, [key]: '' }))}
                          />
                        ))}
                      </div>
                    </ArtworkPanel>
                    <ArtworkPanel title="Property cards" description="Edit the three listing names and their price/detail lines.">
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <TextControl label="Property 1" value={flyer.listing1Title} onChange={(listing1Title) => setFlyer((value) => ({ ...value, listing1Title }))} />
                          <TextControl label="Details 1" value={flyer.listing1Meta} onChange={(listing1Meta) => setFlyer((value) => ({ ...value, listing1Meta }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <TextControl label="Property 2" value={flyer.listing2Title} onChange={(listing2Title) => setFlyer((value) => ({ ...value, listing2Title }))} />
                          <TextControl label="Details 2" value={flyer.listing2Meta} onChange={(listing2Meta) => setFlyer((value) => ({ ...value, listing2Meta }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <TextControl label="Property 3" value={flyer.listing3Title} onChange={(listing3Title) => setFlyer((value) => ({ ...value, listing3Title }))} />
                          <TextControl label="Details 3" value={flyer.listing3Meta} onChange={(listing3Meta) => setFlyer((value) => ({ ...value, listing3Meta }))} />
                        </div>
                      </div>
                    </ArtworkPanel>
                    <Control label="Feature list (one per line)">
                      <textarea value={flyer.features} onChange={(event) => setFlyer((value) => ({ ...value, features: event.target.value }))} rows={4} className="studio-control resize-y" />
                    </Control>
                    <TextControl label="Footer call to action" value={flyer.footer} onChange={(footer) => setFlyer((value) => ({ ...value, footer }))} />
                  </>
                )}
                <ArtworkPanel title="Contact and brand" description="Shared contact information and logo for every flyer and social format.">
                  <div className="space-y-3">
                    <TextControl label="Phone" value={signature.phone} onChange={(phone) => setSignature((value) => ({ ...value, phone }))} />
                    <TextControl label="Email" value={signature.email} onChange={(email) => setSignature((value) => ({ ...value, email }))} />
                    <TextControl label="Website" value={signature.website} onChange={(website) => setSignature((value) => ({ ...value, website }))} />
                    <Control label="Contact block copy">
                      <textarea value={flyer.contact} onChange={(event) => setFlyer((value) => ({ ...value, contact: event.target.value }))} rows={3} className="studio-control resize-y" />
                    </Control>
                    <ArtworkUpload
                      label="Company logo artwork"
                      actionLabel="Upload company logo"
                      value={signature.logo}
                      inputRef={logoRef}
                      onUpload={(file) => uploadSignatureArtwork('logo', file)}
                      onClear={() => clearSignatureArtwork('logo')}
                      previewClassName="object-contain"
                    />
                  </div>
                </ArtworkPanel>
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
              ref={previewRef}
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
                <FlyerPreview fields={flyer} identity={signature} preset={preset} primary={primary} secondary={secondary} font={font} fontSize={fontSize} fontWeight={fontWeight} dimensions={dimensions} />
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
        <span className="mt-1 block">{fields.email} · {fields.website}</span>
      </div>
    </div>
  ) : (
    <div className="w-full border-l-[3px] pl-4" style={{ borderColor: primary }}>
      <div className="leading-tight text-slate-900" style={{ fontSize, fontWeight }}>{fields.name}</div>
      <div className="mt-1 text-[13px] font-semibold" style={{ color: primary }}>{fields.title}</div>
      <div className="mt-0.5 font-bold" style={{ fontSize: brokerSize }}>{fields.company || 'Broker name required'}</div>
      <div className="mt-1 text-[11px]">☎ {fields.phone}</div>
      <div className="mt-0.5 text-[11px]">{fields.email} · {fields.website}</div>
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

function FlyerPreview({ fields, identity, preset, primary, secondary, font, fontSize, fontWeight, dimensions }: {
  fields: FlyerFields;
  identity: SignatureFields;
  preset: number;
  primary: string;
  secondary: string;
  font: string;
  fontSize: number;
  fontWeight: number;
  dimensions: { width: number; height: number };
}) {
  const brokerSize = Math.max(10, Math.ceil(fontSize * 0.5));
  const wide = dimensions.width / dimensions.height > 1.3;
  const compact = dimensions.height < 350;
  const complianceBlock = (
    <div className="mt-3 flex items-center gap-3 border-t border-slate-300 bg-white/95 px-3 py-2 text-slate-900">
      {identity.logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={identity.logo} alt="" className="max-h-8 w-16 shrink-0 object-contain" />
      )}
      <div className="min-w-0">
        <div className="font-semibold" style={{ fontSize: Math.max(9, Math.ceil(brokerSize * 0.75)) }}>
          License holder: {identity.name || 'Name required'}
        </div>
        <div className="font-extrabold" style={{ fontSize: brokerSize }}>
          Broker: {identity.company || 'Broker name required'}
        </div>
        <div className="truncate text-[8px] text-slate-600">
          {[identity.phone, identity.email, identity.website].filter(Boolean).join(' · ')}
        </div>
      </div>
    </div>
  );

  if (preset === 2) {
    const listings = [
      { image: fields.image2, title: fields.listing1Title, meta: fields.listing1Meta },
      { image: fields.image3, title: fields.listing2Title, meta: fields.listing2Meta },
      { image: fields.image4, title: fields.listing3Title, meta: fields.listing3Meta },
    ];
    if (wide) {
      return (
        <div className="grid h-full w-full grid-cols-[46%_54%] bg-white" style={{ fontFamily: font, color: secondary }}>
          <div className="relative overflow-hidden" style={{ backgroundColor: secondary }}>
            <FlyerPhoto src={fields.image} className="absolute inset-0 h-full w-full opacity-50" label="Hero property photo" />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 to-slate-950/20" />
            <div className="relative z-10 flex h-full flex-col justify-center px-4 text-white">
              <p className="text-[7px] uppercase tracking-[0.14em]" style={{ color: primary }}>{fields.eyebrow}</p>
              <h2 className="mt-1 leading-[0.9]" style={{ fontSize: compact ? 19 : 27, fontWeight }}>{fields.title}</h2>
              {!compact && <p className="mt-2 text-[8px] leading-relaxed text-slate-200">{fields.body}</p>}
            </div>
          </div>
          <div className="flex min-w-0 flex-col px-3 py-2">
            <div className="grid min-h-0 flex-1 grid-cols-3 gap-2">
              {listings.map((listing, index) => (
                <div key={index} className="min-w-0">
                  <FlyerPhoto src={listing.image} className={`${compact ? 'h-12' : 'h-24'} w-full`} label={`Property ${index + 1}`} />
                  <h3 className="mt-1 truncate text-[8px] font-bold">{listing.title}</h3>
                  <p className="truncate text-[6px] text-slate-500">{listing.meta}</p>
                </div>
              ))}
            </div>
            <div className="mt-1 flex items-end justify-between gap-2 border-t border-slate-200 pt-1 text-[6px]">
              <span className="truncate">{identity.phone} · {identity.email} · {identity.website}</span>
              {identity.logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={identity.logo} alt="" className="max-h-5 w-12 shrink-0 object-contain" />
              )}
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="flex h-full w-full flex-col bg-white" style={{ fontFamily: font, color: secondary }}>
        <div className="relative h-[43%] overflow-hidden" style={{ backgroundColor: secondary }}>
          <FlyerPhoto src={fields.image} className="absolute inset-0 h-full w-full opacity-55" label="Hero property photo" />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/55 to-transparent" />
          <div className="relative z-10 flex h-full max-w-[72%] flex-col justify-center px-6 text-white">
            <div className="mb-3 flex items-center gap-2 text-[8px] font-bold uppercase tracking-[0.16em]" style={{ color: primary }}>
              {identity.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={identity.logo} alt="" className="h-5 max-w-20 object-contain brightness-0 invert" />
              ) : identity.company}
            </div>
            <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: primary }}>{fields.eyebrow}</p>
            <h2 className="mt-1 whitespace-pre-line leading-[0.9] tracking-[-0.035em]" style={{ fontSize, fontWeight }}>{fields.title}</h2>
            <p className="mt-3 max-w-[240px] text-[9px] leading-relaxed text-slate-200">{fields.body}</p>
          </div>
        </div>
        <div className="grid flex-1 grid-cols-3 gap-3 px-5 py-4">
          {listings.map((listing, index) => (
            <div key={index} className="min-w-0">
              <FlyerPhoto src={listing.image} className="h-24 w-full" label={`Property ${index + 1}`} />
              <h3 className="mt-2 truncate text-[11px] font-semibold">{listing.title}</h3>
              <p className="mt-0.5 text-[8px] leading-snug text-slate-500">{listing.meta}</p>
              <div className="mt-2 border-t border-slate-200 pt-1 text-[7px] uppercase tracking-wide text-slate-400">Property details</div>
            </div>
          ))}
        </div>
        <div className="px-5 py-2 text-[8px]" style={{ backgroundColor: primary, color: secondary }}>
          <div>{fields.footer}</div>
          <div className="mt-1 font-semibold">License holder: {identity.name} · Broker: {identity.company} · {identity.phone} · {identity.email}</div>
        </div>
      </div>
    );
  }

  if (preset === 3) {
    const features = fields.features.split('\n').map((item) => item.trim()).filter(Boolean);
    if (wide) {
      return (
        <div className="grid h-full w-full grid-cols-[35%_37%_28%]" style={{ fontFamily: font }}>
          <FlyerPhoto src={fields.image} className="h-full w-full" label="Hero property photo" />
          <div className="flex min-w-0 flex-col justify-center px-4 text-white" style={{ backgroundColor: secondary }}>
            <p className="text-[7px] uppercase tracking-[0.14em]" style={{ color: primary }}>{fields.eyebrow}</p>
            <h2 className="mt-1 truncate leading-none" style={{ fontSize: compact ? 18 : 27, fontWeight }}>{fields.title}</h2>
            <p className="mt-1 truncate text-[7px]" style={{ color: primary }}>{fields.meta}</p>
            {!compact && <p className="mt-2 line-clamp-3 text-[8px] leading-relaxed text-slate-200">{fields.body}</p>}
          </div>
          <div className="flex min-w-0 flex-col justify-center p-3" style={{ backgroundColor: primary, color: secondary }}>
            {identity.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={identity.logo} alt="" className="mb-2 max-h-7 w-16 object-contain" />
            )}
            <div className="whitespace-pre-line text-[7px] leading-relaxed">{fields.contact}</div>
            <div className="mt-2 border-t border-slate-700/20 pt-1 text-[6px]">
              {identity.name} · {identity.company}<br />{identity.phone} · {identity.email}
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="grid h-full w-full grid-cols-[44%_56%]" style={{ fontFamily: font }}>
        <div className="flex h-full flex-col justify-between p-4" style={{ backgroundColor: primary, color: secondary }}>
          <div>
            <FlyerPhoto src={fields.image2} className="h-32 w-full" label="Property photo 1" />
            <div className="mt-2 flex items-start gap-2">
              <span className="text-2xl leading-none">01</span>
              <div className="min-w-0">
                <h3 className="text-[10px] font-bold uppercase">{fields.listing1Title}</h3>
                <p className="text-[8px]">{fields.listing1Meta}</p>
              </div>
            </div>
          </div>
          <div>
            <FlyerPhoto src={fields.image3} className="h-32 w-full" label="Property photo 2" />
            <div className="mt-2 flex items-start gap-2">
              <span className="text-2xl leading-none">02</span>
              <div className="min-w-0">
                <h3 className="text-[10px] font-bold uppercase">{fields.listing2Title}</h3>
                <p className="text-[8px]">{fields.listing2Meta}</p>
              </div>
            </div>
          </div>
          <div className="border-t border-slate-500/30 pt-2 text-[7px] font-semibold">
            License holder: {identity.name}<br />Broker: {identity.company}
          </div>
        </div>
        <div className="flex h-full flex-col text-white" style={{ backgroundColor: secondary }}>
          <FlyerPhoto src={fields.image} className="h-[35%] w-full" label="Hero property photo" />
          <div className="flex flex-1 flex-col p-5">
            <p className="text-[8px] uppercase tracking-[0.14em]" style={{ color: primary }}>{fields.eyebrow}</p>
            <h2 className="mt-1 leading-none" style={{ fontSize: Math.max(22, fontSize - 4), fontWeight }}>{fields.title}</h2>
            <p className="mt-1 text-[9px]" style={{ color: primary }}>{fields.meta}</p>
            <p className="mt-4 text-[9px] leading-relaxed text-slate-200">{fields.body}</p>
            <h3 className="mt-4 text-base">Why choose us?</h3>
            <ul className="mt-2 space-y-1.5 text-[8px] text-slate-200">
              {features.map((feature) => <li key={feature}>○ &nbsp;{feature}</li>)}
            </ul>
            <div className="mt-auto whitespace-pre-line border-t border-white/20 pt-3 text-[8px] leading-relaxed">
              {fields.contact}
              <div className="mt-1">{identity.phone} · {identity.email} · {identity.website}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

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

function FlyerPhoto({ src, className, label }: { src: string; className: string; label: string }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className={`${className} object-cover`} />
    );
  }
  return (
    <div className={`flex items-center justify-center bg-slate-200 text-center text-[8px] font-bold uppercase tracking-wider text-slate-500 ${className}`}>
      {label}
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

function FlyerImageUpload({ label, value, onUpload, onClear }: {
  label: string;
  value: string;
  onUpload: (file?: File) => void;
  onClear: () => void;
}) {
  return (
    <div className="rounded-md border border-slate-700 bg-[#090d16] p-2">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <label className="block cursor-pointer">
        <div className="flex h-20 items-center justify-center overflow-hidden rounded bg-slate-800 text-center text-[10px] font-semibold text-slate-400 hover:ring-1 hover:ring-sky-500">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="px-2">Upload image</span>
          )}
        </div>
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => onUpload(event.target.files?.[0])} className="sr-only" />
      </label>
      {value && (
        <button type="button" onClick={onClear} className="mt-2 w-full text-[10px] font-semibold text-slate-400 hover:text-white">
          Clear
        </button>
      )}
    </div>
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
    ? `<span style="display:block;font-size:${fontSize}px;font-weight:${fontWeight};color:#0f172a">${data.name}</span><span style="display:block;font-size:12px;color:${primary};font-weight:600;margin-top:4px">${data.title}</span><div style="border-top:1px solid #e2e8f0;padding-top:7px;margin-top:7px;font-size:11px"><strong style="color:#0f172a;font-size:${brokerSize}px">${data.company}</strong> &nbsp;·&nbsp; ☎ ${data.phone}<span style="display:block;margin-top:3px">${data.email} · ${data.website}</span></div>`
    : `<div style="border-left:3px solid ${primary};padding-left:14px"><div style="font-size:${fontSize}px;font-weight:${fontWeight};color:#0f172a;line-height:1.2">${data.name}</div><div style="font-size:13px;color:${primary};font-weight:600;margin-top:3px">${data.title}</div><div style="font-size:${brokerSize}px;font-weight:700">${data.company}</div><div style="font-size:11px;margin-top:4px">☎ ${data.phone}</div><div style="font-size:11px;margin-top:2px">${data.email} · ${data.website}</div></div>`;
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
  const phone = escapeHtml(identity.phone);
  const email = escapeHtml(identity.email);
  const website = escapeHtml(identity.website);
  const logoUrl = escapeHtml(identity.logo);
  const brokerSize = Math.max(10, Math.ceil(fontSize * 0.5));
  const logo = logoUrl ? `<img src="${logoUrl}" alt="" style="display:block;max-width:64px;max-height:32px;object-fit:contain;margin-right:10px">` : '';
  const compliance = `<div style="margin-top:12px;border-top:1px solid #cbd5e1;background:rgba(255,255,255,.95);padding:8px 10px;color:#0f172a;display:flex;align-items:center">${logo}<div><div style="font-size:${Math.max(9, Math.ceil(brokerSize * 0.75))}px;font-weight:600">License holder: ${licenseHolderName}</div><div style="font-size:${brokerSize}px;font-weight:800">Broker: ${brokerName}</div><div style="font-size:8px;color:#475569">${phone} · ${email} · ${website}</div></div></div>`;
  const image = data.image ? `<img src="${data.image}" alt="" style="width:100%;max-height:140px;object-fit:cover;border-radius:4px;margin-top:12px">` : '';
  const photo = (src: string, label: string, style: string) => src
    ? `<img src="${src}" alt="" style="display:block;object-fit:cover;${style}">`
    : `<div style="display:flex;align-items:center;justify-content:center;background:#e2e8f0;color:#64748b;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;text-align:center;${style}">${label}</div>`;
  const wide = dimensions.width / dimensions.height > 1.3;
  const compact = dimensions.height < 350;

  if (preset === 2) {
    if (wide) {
      const cards = [
        [data.image2, data.listing1Title, data.listing1Meta],
        [data.image3, data.listing2Title, data.listing2Meta],
        [data.image4, data.listing3Title, data.listing3Meta],
      ].map(([src, title, meta], index) => `<div style="min-width:0">${photo(src, `Property ${index + 1}`, `width:100%;height:${compact ? 48 : 96}px`)}<div style="font-size:8px;font-weight:700;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</div><div style="font-size:6px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${meta}</div></div>`).join('');
      return `<div style="font-family:${font};width:${dimensions.width}px;height:${dimensions.height}px;color:${secondary};display:grid;grid-template-columns:46% 54%;background:#fff;overflow:hidden">
        <div style="position:relative;overflow:hidden;background:${secondary}">${photo(data.image, 'Hero property photo', 'position:absolute;inset:0;width:100%;height:100%;opacity:.5')}<div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(2,6,23,.9),rgba(2,6,23,.2))"></div><div style="position:relative;height:100%;display:flex;flex-direction:column;justify-content:center;color:#fff;padding:16px;box-sizing:border-box"><div style="font-size:7px;text-transform:uppercase;letter-spacing:.14em;color:${primary}">${data.eyebrow}</div><h1 style="font-size:${compact ? 19 : 27}px;font-weight:${fontWeight};line-height:.9;margin:4px 0 0">${data.title}</h1>${compact ? '' : `<p style="font-size:8px;line-height:1.4;color:#e2e8f0">${data.body}</p>`}</div></div>
        <div style="padding:8px 12px;display:flex;flex-direction:column;box-sizing:border-box;min-width:0"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;min-height:0;flex:1">${cards}</div><div style="font-size:6px;border-top:1px solid #e2e8f0;padding-top:4px;margin-top:4px;display:flex;justify-content:space-between;gap:8px"><span>${phone} · ${email} · ${website}</span>${logo}</div></div>
      </div>`;
    }
    const listings = [
      [data.image2, data.listing1Title, data.listing1Meta],
      [data.image3, data.listing2Title, data.listing2Meta],
      [data.image4, data.listing3Title, data.listing3Meta],
    ].map(([src, title, meta], index) => `
      <div style="min-width:0">
        ${photo(src, `Property ${index + 1}`, 'width:100%;height:96px')}
        <div style="font-size:11px;font-weight:600;margin-top:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</div>
        <div style="font-size:8px;color:#64748b;line-height:1.35;margin-top:2px">${meta}</div>
        <div style="font-size:7px;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;border-top:1px solid #e2e8f0;margin-top:8px;padding-top:4px">Property details</div>
      </div>`).join('');
    return `<div style="font-family:${font};width:${dimensions.width}px;height:${dimensions.height}px;color:${secondary};display:flex;flex-direction:column;background:#fff;overflow:hidden">
      <div style="position:relative;height:43%;overflow:hidden;background:${secondary}">
        ${photo(data.image, 'Hero property photo', 'position:absolute;inset:0;width:100%;height:100%;opacity:.55')}
        <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(2,6,23,.9),rgba(2,6,23,.55),transparent)"></div>
        <div style="position:relative;color:#fff;height:100%;display:flex;flex-direction:column;justify-content:center;box-sizing:border-box;padding:24px;max-width:72%">
          <div style="font-size:8px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${primary};margin-bottom:12px">${brokerName}</div>
          <div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${primary}">${data.eyebrow}</div>
          <h1 style="font-size:${fontSize}px;font-weight:${fontWeight};line-height:.9;letter-spacing:-.035em;margin:4px 0 0">${data.title}</h1>
          <p style="font-size:9px;line-height:1.45;color:#e2e8f0;margin:12px 0 0">${data.body}</p>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;flex:1;padding:16px 20px;box-sizing:border-box">${listings}</div>
      <div style="font-size:8px;background:${primary};color:${secondary};padding:8px 20px">
        <div>${data.footer}</div><div style="font-weight:600;margin-top:4px">License holder: ${licenseHolderName} · Broker: ${brokerName} · ${phone} · ${email}</div>
      </div>
    </div>`;
  }

  if (preset === 3) {
    if (wide) {
      return `<div style="font-family:${font};width:${dimensions.width}px;height:${dimensions.height}px;display:grid;grid-template-columns:35% 37% 28%;overflow:hidden">
        ${photo(data.image, 'Hero property photo', 'width:100%;height:100%')}
        <div style="background:${secondary};color:#fff;padding:12px 16px;display:flex;flex-direction:column;justify-content:center;box-sizing:border-box;min-width:0"><div style="font-size:7px;text-transform:uppercase;letter-spacing:.14em;color:${primary}">${data.eyebrow}</div><h1 style="font-size:${compact ? 18 : 27}px;font-weight:${fontWeight};line-height:1;margin:4px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${data.title}</h1><div style="font-size:7px;color:${primary};margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${data.meta}</div>${compact ? '' : `<p style="font-size:8px;line-height:1.4;color:#e2e8f0">${data.body}</p>`}</div>
        <div style="background:${primary};color:${secondary};padding:12px;display:flex;flex-direction:column;justify-content:center;box-sizing:border-box">${logo}<div style="font-size:7px;line-height:1.4;white-space:pre-line">${data.contact}</div><div style="font-size:6px;border-top:1px solid rgba(15,23,42,.2);padding-top:4px;margin-top:8px">${licenseHolderName} · ${brokerName}<br>${phone} · ${email}</div></div>
      </div>`;
    }
    const featureItems = data.features.split('\n').map((item) => item.trim()).filter(Boolean)
      .map((item) => `<li style="margin-bottom:6px">○ &nbsp;${item}</li>`).join('');
    return `<div style="font-family:${font};width:${dimensions.width}px;height:${dimensions.height}px;display:grid;grid-template-columns:44% 56%;overflow:hidden">
      <div style="background:${primary};color:${secondary};padding:16px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between">
        <div>${photo(data.image2, 'Property photo 1', 'width:100%;height:128px')}<div style="display:flex;gap:8px;margin-top:8px"><span style="font-size:24px;line-height:1">01</span><div><b style="font-size:10px;text-transform:uppercase">${data.listing1Title}</b><div style="font-size:8px">${data.listing1Meta}</div></div></div></div>
        <div>${photo(data.image3, 'Property photo 2', 'width:100%;height:128px')}<div style="display:flex;gap:8px;margin-top:8px"><span style="font-size:24px;line-height:1">02</span><div><b style="font-size:10px;text-transform:uppercase">${data.listing2Title}</b><div style="font-size:8px">${data.listing2Meta}</div></div></div></div>
        <div style="font-size:7px;font-weight:600;border-top:1px solid rgba(15,23,42,.25);padding-top:8px">License holder: ${licenseHolderName}<br>Broker: ${brokerName}</div>
      </div>
      <div style="background:${secondary};color:#fff;display:flex;flex-direction:column">
        ${photo(data.image, 'Hero property photo', 'width:100%;height:35%')}
        <div style="padding:20px;display:flex;flex:1;flex-direction:column;box-sizing:border-box">
          <div style="font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:${primary}">${data.eyebrow}</div>
          <h1 style="font-size:${Math.max(22, fontSize - 4)}px;font-weight:${fontWeight};line-height:1;margin:4px 0 0">${data.title}</h1>
          <div style="font-size:9px;color:${primary};margin-top:4px">${data.meta}</div>
          <p style="font-size:9px;line-height:1.5;color:#e2e8f0;margin:16px 0 0">${data.body}</p>
          <h2 style="font-size:16px;margin:16px 0 0">Why choose us?</h2>
          <ul style="font-size:8px;color:#e2e8f0;list-style:none;padding:0;margin:8px 0 0">${featureItems}</ul>
          <div style="font-size:8px;line-height:1.5;white-space:pre-line;border-top:1px solid rgba(255,255,255,.2);padding-top:12px;margin-top:auto">${data.contact}<div style="margin-top:4px">${phone} · ${email} · ${website}</div></div>
        </div>
      </div>
    </div>`;
  }

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
