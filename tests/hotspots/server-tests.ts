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
import { destinationIdentity, overlappingDuplicates, safeTestDestination, sameDetectedAction, samePlacement } from '../../lib/hotspot-review';
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
const badBrand=[{kind:'logo',text:'Other Builder',advertiser_id:12,box_2d:[20,20,60,180]}];
globalThis.fetch=async(url:any)=>String(url).includes('googleapis')?new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(badBrand)}]}}]})):new Response(qrPage as any);
const unmatched=await extractVisualHotspots('test-image',0,[{id:12,name:'Known Partner',slug:'known',website:'https://known.example.org',avatar_url:null}]);
assert.equal(unmatched[0].advertiser_id,null);assert.equal(unmatched[0].config.url,'');ok('incorrect vision partner IDs never prefill a website');
const cover=[
 {kind:'logo',text:'Capital Title',advertiser_id:12,box_2d:[200,200,245,350]},
 {kind:'partner',text:'Capital Title',advertiser_id:12,box_2d:[210,210,235,340]},
 {kind:'partner',text:'Capital Title',advertiser_id:12,box_2d:[700,210,735,340]},
 {kind:'logo',text:'',advertiser_id:null,box_2d:[300,300,325,330]},
 {kind:'url',text:'Tracker Map.',target:'Tracker Map.',box_2d:[400,400,420,520]},
];
globalThis.fetch=async(url:any)=>String(url).includes('googleapis')?new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(cover)}]}}]})):new Response(qrPage as any);
const coverRows=await extractVisualHotspots('test-image',2,[{id:12,name:'Capital Title',slug:'capital-title',website:null,avatar_url:null}]);
assert.equal(coverRows.length,3);
assert.equal(sameDetectedAction(coverRows[0],coverRows[1]),true);
assert.equal(sameDetectedAction(coverRows[0],coverRows[2]),false);
const coverResult=await insertExtracted(sql as any,coverRows as any,{magazineId:1,adminEmail:null,advertisers:[],pageCount:3,wipeImports:false});
assert.equal(coverResult.inserted,2);assert.equal(coverResult.skipped_duplicates,1);
const coverDrafts=coverRows.map((r,i)=>({...r,id:400+i,magazine_id:1,review_status:'pending',is_deleted:false,is_published:false,source:'pdf_import'}));
assert.deepEqual(overlappingDuplicates(coverDrafts as any).map(h=>h.id),[401]);
ok('Newsline logo and partner layers consolidate; separate occurrences survive');
globalThis.fetch=realFetch;

// Rescan regressions: existing page links are authoritative even when a model
// shifts, enlarges, or detects a different printed instance of the same target.
const opts={magazineId:1,adminEmail:null,advertisers:[],pageCount:3,wipeImports:false};
const known={...row,page_idx:1,identity:'known.example.org',config:{type:'link',url:'https://known.example.org',open_in:'new_tab'}};
assert.equal((await insertExtracted(sql as any,[known] as any,opts)).inserted,1);
await sql`UPDATE magazine_hotspots SET detection = NULL, is_published = true, review_status = 'approved' WHERE page_idx = 1`;
result=await insertExtracted(sql as any,[
  {...known,x_frac:.65,y_frac:.8,w_frac:.05,h_frac:.01,config:{type:'link',url:'https://www.known.example.org/?utm_source=scan',open_in:'new_tab'}},
  {...known,identity:'new.example.org',config:{type:'link',url:'https://new.example.org',open_in:'new_tab'}},
  {...known,page_idx:2},
] as any,opts);
assert.equal(result.inserted,2);assert.equal(result.skipped_duplicates,1);ok('rescan skips shifted legacy page links and tracking/www variants but adds new targets and other pages');
const once=await sql`SELECT COUNT(*)::int AS count FROM magazine_hotspots`;
assert.equal((await insertExtracted(sql as any,[{...known,x_frac:.4,y_frac:.5}] as any,opts)).inserted,0);
assert.equal((await sql`SELECT COUNT(*)::int AS count FROM magazine_hotspots`)[0].count,once[0].count);ok('repeated rescans do not grow existing page link counts');
result=await insertExtracted(sql as any,[{...row,x_frac:.8,y_frac:.8,w_frac:.05,h_frac:.05}] as any,opts);
assert.equal(result.inserted,0);ok('rescans cannot recreate corrected or deleted detections at a shifted position');

const partner={...known,page_idx:2,identity:'partner:77',advertiser_id:77,origin:'logo_match'};
await sql`UPDATE magazine_hotspots SET advertiser_id=77, config='{"type":"link","url":"https://human-corrected.example.org"}'::jsonb WHERE page_idx=2`;
assert.equal((await insertExtracted(sql as any,[{...partner,x_frac:.7}] as any,opts)).inserted,0);ok('rescan preserves the existing matched partner instead of adding another logo link');

const fixture={...rectangle,id:100,type:'link',config:{type:'link',url:'https://example.org/Case'},is_published:true,source:'manual',review_status:'approved'};
const nested={...fixture,id:101,source:'pdf_import',is_published:false,x_frac:.13,y_frac:.22,w_frac:.05,h_frac:.02};
assert.equal(samePlacement(fixture,nested),true);
const duplicateRows=overlappingDuplicates([
  {...fixture,id:'100'}, {...nested,id:'101'},
  {...nested,id:'102',x_frac:.65}, // distinct placement stays
  {...nested,id:'103',config:{type:'link',url:'https://different.example.org'}},
  {...nested,id:'104',type:'phone',config:{type:'phone',number:'+15125550100'}},
  {...nested,id:'105',is_deleted:true},
] as any);
assert.deepEqual(duplicateRows.map(h=>h.id),['101']);ok('cleanup catches nested duplicate boxes with production string IDs while preserving distinct links and placements');

// Invalid already-published legacy data must still be removable, never used as
// a loophole to publish or change destination/position without validation.
await sql`INSERT INTO magazine_hotspots(magazine_id,page_idx,x_frac,y_frac,w_frac,h_frac,type,config,is_published,review_status,z_index)
  VALUES(1,0,.9,.2,.2,.1,'link','{"type":"link","url":"https://example.com"}',true,'approved',0)`;
const [legacy]=await sql`SELECT * FROM magazine_hotspots ORDER BY id DESC LIMIT 1`;
response=await post([{id:String(legacy.id),version:0,values:{is_deleted:true,is_published:false}}]);
assert.equal(response.status,200);
const [removed]=await sql`SELECT * FROM magazine_hotspots WHERE id=${legacy.id}`;
assert.equal(removed.is_deleted,true);assert.equal(removed.is_published,false);
assert.equal(removed.x_frac,legacy.x_frac);assert.deepEqual(removed.config,legacy.config);ok('cleanup removes invalid legacy published rows without requiring destination or geometry repair');
response=await post([{id:String(legacy.id),version:1,values:{is_deleted:true,config:{type:'link',url:'javascript:alert(1)'}}}]);
assert.equal(response.status,400);
response=await post([{id:String(legacy.id),version:1,values:{is_deleted:false,is_published:true}}]);
assert.equal(response.status,400);ok('removal exemption cannot modify invalid content or restore it to publication');
assert.notEqual(destinationIdentity({type:'link',url:'https://example.org/?item=1'} as any),destinationIdentity({type:'link',url:'https://example.org/?item=2'} as any));
assert.notEqual(destinationIdentity({type:'link',url:'https://example.org:8443/path'} as any),destinationIdentity({type:'link',url:'https://example.org/path'} as any));ok('dedupe preserves meaningful queries, URL path case, and ports');
await db.close();
console.log(`${tests} server regression checks passed`);
