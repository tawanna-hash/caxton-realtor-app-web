/* eslint-disable @typescript-eslint/no-explicit-any -- Deliberately malformed fixtures exercise API validation. */
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import sharp from 'sharp';
import QRCode from 'qrcode';
import { PDFDocument, PDFName, PDFString, StandardFonts } from 'pdf-lib';
import { ensureHotspotWorkspace } from '../../lib/server/hotspot-workspace';
import { POST, GET } from '../../app/api/admin/magazines/[id]/hotspot-workspace/route';
import { insertExtracted, extractQrCodes, extractPdfLinkAnnotations, extractPdfTextContacts } from '../../lib/server/hotspot-extractors';
import { extractVisualHotspots } from '../../lib/server/hotspot-vision';
import { destinationIdentity, safeTestDestination, samePlacement } from '../../lib/hotspot-review';
const db=new PGlite();
await db.exec(`CREATE TABLE magazines(id BIGINT PRIMARY KEY,page_count INT); INSERT INTO magazines VALUES(1,3);
CREATE TABLE magazine_hotspots(id BIGSERIAL PRIMARY KEY,magazine_id BIGINT REFERENCES magazines(id),page_idx INT,
x_frac REAL,y_frac REAL,w_frac REAL,h_frac REAL,type TEXT,config JSONB,label TEXT,advertiser_id BIGINT,advertiser_name TEXT,
is_published BOOLEAN DEFAULT FALSE,z_index INT DEFAULT 0,source TEXT,was_imported BOOLEAN DEFAULT FALSE,
created_by TEXT,updated_by TEXT,created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW());`);
const sql=async (parts:TemplateStringsArray,...values:any[])=>{
 const query=parts.map((s,i)=>s+(i<values.length?`$${i+1}`:'')).join('');
 return (await db.query<Record<string,any>>(query,values)).rows;
};
(globalThis as any).__sql=sql;
(globalThis as any).__admin={email:'qa@example.org'};
let tests=0;
const ok=(label:string)=>{tests++;console.log('PASS',label)};
await ensureHotspotWorkspace();
await ensureHotspotWorkspace();ok('additive PostgreSQL migration and repeat initialization');
const rectangle={page_idx:0,x_frac:.1,y_frac:.2,w_frac:.2,h_frac:.1};
const row={...rectangle,type:'link',config:{type:'link',url:'https://example.org/Case',open_in:'new_tab'},identity:'example.org/Case',label:'QR destination',origin:'qr_code'};
let result=await insertExtracted(sql as any,[row,{...row,x_frac:.6},row] as any,{magazineId:1,adminEmail:'qa@example.org',advertisers:[],pageCount:3,wipeImports:true});
assert.equal(result.inserted,2);assert.equal(result.skipped_duplicates,1);ok('spatial dedupe preserves separate placements');
let rows=await sql`SELECT * FROM magazine_hotspots ORDER BY id`;
assert(rows.every((h:any)=>!h.is_published && h.review_status==='pending'));ok('all automatic detections are unpublished drafts');
const ctx={params:Promise.resolve({id:'1'})};
const post=async(changes:any[])=>POST(new Request('http://localhost/api/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({changes})}) as any,ctx);
let response=await post([{id:rows[0].id,version:0,values:{config:{type:'link',url:''}}}]);
assert.equal(response.status,200);
response=await post([{id:rows[0].id,version:1,values:{review_status:'approved',is_published:true}}]);
assert.equal(response.status,400);ok('empty drafts save but cannot be approved or published');
response=await post([{id:rows[0].id,version:1,values:{config:{type:'link',url:'https://example.org/corrected'},x_frac:.3}}]);
assert.equal(response.status,200);
response=await post([{id:rows[1].id,version:0,values:{review_status:'rejected',is_deleted:true}}]);assert.equal(response.status,200);
result=await insertExtracted(sql as any,[row,{...row,x_frac:.6}] as any,{magazineId:1,adminEmail:null,advertisers:[],pageCount:3,wipeImports:true});
assert.equal(result.inserted,0);ok('rescans preserve moved/corrected and rejected/deleted original detections');
response=await post([{id:rows[0].id,version:2,values:{review_status:'approved',is_published:true}},{id:rows[1].id,version:0,values:{label:'stale'}}]);
assert.equal(response.status,400);
rows=await sql`SELECT * FROM magazine_hotspots ORDER BY id`;
assert.equal(rows[0].is_published,false);ok('stale batch rejected atomically without partial changes');
response=await post([{id:rows[0].id,version:2,values:{review_status:'approved',is_published:true,editor_hidden:true,editor_locked:true}}]);
assert.equal(response.status,200);rows=await sql`SELECT * FROM magazine_hotspots ORDER BY id`;
assert.equal(rows[0].is_published,true);assert.equal(rows[0].editor_version,3);ok('approval publishes; hide and lock do not affect reader publication');
response=await post([{id:rows[0].id,version:3,values:{is_deleted:true}}]);assert.equal(response.status,200);
rows=await sql`SELECT * FROM magazine_hotspots ORDER BY id`;assert.equal(rows[0].is_published,false);ok('deletion always removes publication');
(globalThis as any).__admin=null;
assert.equal((await GET(new Request('http://localhost') as any,ctx)).status,401);ok('unauthorized access blocked');(globalThis as any).__admin={email:'qa@example.org'};
assert.notEqual(destinationIdentity({type:'link',url:'https://example.org/Case',open_in:'new_tab'}),destinationIdentity({type:'link',url:'https://example.org/case',open_in:'new_tab'}));
assert.equal(safeTestDestination({type:'link',url:'javascript:alert(1)',open_in:'new_tab'}),null);
assert.equal(samePlacement(rectangle,{...rectangle,x_frac:.6}),false);ok('safe protocols and case-sensitive URL identities');
const qr1=await QRCode.toBuffer('https://example.org/qr',{width:240,margin:2});
const qr2=await QRCode.toBuffer('mailto:qa@example.org',{width:220,margin:2});
const qrPage=await sharp({create:{width:900,height:1200,channels:4,background:'#ffffff'}}).composite([{input:qr1,left:70,top:100},{input:qr2,left:570,top:790}]).png().toBuffer();
const realFetch=globalThis.fetch;
globalThis.fetch=async()=>new Response(qrPage as any);
const qrRows=await extractQrCodes(['test-image']);
assert.equal(qrRows.length,2);assert(qrRows.some(r=>r.type==='email'));assert(qrRows.some(r=>r.x_frac>.6 && r.y_frac>.6));ok('multiple QR codes decoded with correct page positions');
const rotated=await sharp(qrPage).rotate(90).png().toBuffer();
globalThis.fetch=async()=>new Response(rotated as any);
assert.equal((await extractQrCodes(['rotated-image'])).length,2);ok('rotated page QR decoding');
const pdf=await PDFDocument.create();const p=pdf.addPage([600,800]);const font=await pdf.embedFont(StandardFonts.Helvetica);
p.drawText('Email qa@example.org or call (512) 555-0100', {x:60,y:400,size:18,font});
const annotation=pdf.context.obj({Type:'Annot',Subtype:'Link',Rect:[60,600,250,630],A:{Type:'Action',S:'URI',URI:PDFString.of('https://example.org/pdf')}});
p.node.set(PDFName.of('Annots'),pdf.context.obj([pdf.context.register(annotation)]));
const bytes=await pdf.save();const ab=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const links=await extractPdfLinkAnnotations(ab as ArrayBuffer);assert(links.some(r=>r.config.url==='https://example.org/pdf'));
const contacts=await extractPdfTextContacts(ab as ArrayBuffer);assert(contacts.some(r=>r.type==='email'));assert(contacts.some(r=>r.type==='phone'));ok('embedded PDF URLs and printed text contacts');
process.env.GEMINI_API_KEY='synthetic-test-only';
const visual=[{kind:'logo',text:'Unknown',target:'https://invented.invalid',advertiser_id:999,box_2d:[10,20,60,180]},
{kind:'partner',text:'Known Partner',target:'https://wrong.invalid',advertiser_id:12,box_2d:[90,20,140,190]},
{kind:'email',text:'qa@example.org',target:'qa@example.org',box_2d:[200,20,220,190]},
{kind:'phone',text:'512-555-0100',target:'512-555-0100',box_2d:[300,20,320,190]},
{kind:'url',text:'example.org',target:'example.org',box_2d:[400,20,420,190]},
{kind:'qr',text:'QR',target:'https://invented.invalid',box_2d:[500,20,650,190]}];
globalThis.fetch=async(url:any)=>String(url).includes('googleapis')?new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(visual)}]}}]})):new Response(qrPage as any);
const detected=await extractVisualHotspots('test-image',0,[{id:12,name:'Known Partner',slug:'known',website:'https://known.example.org',avatar_url:null}]);
assert.equal(detected.length,6);assert.equal(detected[0].config.url,'');assert.equal(detected[0].advertiser_id,null);assert.equal(detected[1].config.url,'https://known.example.org');assert.equal(detected[5].config.url,'');ok('visual extraction handles every kind and never invents unknown logo/QR destinations');
globalThis.fetch=realFetch;await db.close();
console.log(`${tests} server regression checks passed`);
