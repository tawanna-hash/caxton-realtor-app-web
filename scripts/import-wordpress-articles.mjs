#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { XMLParser } from 'fast-xml-parser';
import { Pool } from '@neondatabase/serverless';
import { put } from '@vercel/blob';

const args = process.argv.slice(2);
const inputIndex = args.indexOf('--input');
const publicationIndex = args.indexOf('--publication');
const outputIndex = args.indexOf('--output');
const input = inputIndex >= 0 ? args[inputIndex + 1] : null;
const publication = publicationIndex >= 0 ? args[publicationIndex + 1] : 'austin';
const output = outputIndex >= 0 ? args[outputIndex + 1] : null;
const dryRun = args.includes('--dry-run');
const skipMedia = args.includes('--skip-media');

if (!input) {
  throw new Error('Usage: node scripts/import-wordpress-articles.mjs --input export.xml --publication austin [--dry-run]');
}
if (!['austin', 'san_antonio'].includes(publication)) {
  throw new Error('publication must be austin or san_antonio');
}

const text = (value) => {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object') return String(value['#cdata'] ?? value['#text'] ?? '');
  return '';
};
const asArray = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);
const stripHtml = (value) =>
  text(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#038;/gi, '&')
    .replace(/&#8217;/gi, '\u2019')
    .replace(/&#8211;/gi, '\u2013')
    .replace(/&#8212;/gi, '\u2014')
    .replace(/&hellip;/gi, '\u2026')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
const sanitizeHtml = (value) =>
  text(value)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<(object|embed|form|input|button|meta|link)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/\sstyle\s*=\s*"[^"]*"/gi, '')
    .replace(/\sstyle\s*=\s*'[^']*'/gi, '');

const categoryMap = {
  'austin-board-of-realtors': 'ABoR',
  'five-points-board-of-realtors': 'Five Points',
  'five-points-realtors': 'Five Points',
  'womens-council-of-realtors': 'WCR Austin',
  'texas-residential-real-estate-council': 'TRERC',
  'featured-advertiser': 'Featured Partners',
  'featured-advertisers': 'Featured Partners',
  'editors-choice': "Editor's Choice",
  'faces-of-real-estate': 'Faces of Real Estate',
  marketing: 'Marketing',
  strategy: 'Strategy',
  podcast: 'Podcast',
  content: 'Content',
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: '#cdata',
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: false,
  isArray: (tagName) =>
    ['item', 'wp:author', 'wp:postmeta', 'category'].includes(tagName),
});

const xml = await fs.readFile(path.resolve(input), 'utf8');
const parsed = parser.parse(xml);
const channel = parsed?.rss?.channel;
if (!channel) throw new Error('Invalid WordPress WXR export: channel not found');

const items = asArray(channel.item);
const authors = new Map(
  asArray(channel['wp:author']).map((author) => [
    text(author['wp:author_login']),
    text(author['wp:author_display_name']) || 'Staff',
  ]),
);
const attachments = new Map(
  items
    .filter((item) => text(item['wp:post_type']) === 'attachment')
    .map((item) => [text(item['wp:post_id']), text(item['wp:attachment_url'])]),
);
const posts = items.filter(
  (item) =>
    text(item['wp:post_type']) === 'post' &&
    text(item['wp:status']) === 'publish',
);

if (posts.length === 0) throw new Error('The export contains zero published posts');

async function fetchLivePosts() {
  const base = publication === 'austin' ? 'https://www.realtyline.us' : 'https://www.newslinesa.com';
  const response = await fetch(
    `${base}/wp-json/wp/v2/posts?per_page=100&_embed=1&orderby=date&order=desc`,
    { signal: AbortSignal.timeout(20_000) },
  );
  if (!response.ok) return new Map();
  const rows = await response.json();
  return new Map(rows.map((row) => [String(row.id), row]));
}

const livePosts = await fetchLivePosts().catch(() => new Map());

function featuredFromLive(live) {
  const media = live?._embedded?.['wp:featuredmedia']?.[0];
  const sizes = media?.media_details?.sizes || {};
  const imageUrl = sizes.large?.source_url || sizes.full?.source_url || media?.source_url || null;
  const imageThumb =
    sizes.medium?.source_url || sizes.thumbnail?.source_url || imageUrl;
  return { imageUrl, imageThumb };
}

const rows = posts.map((item) => {
  const numericId = text(item['wp:post_id']);
  const fullId = `${publication}-${numericId}`;
  const metadata = new Map(
    asArray(item['wp:postmeta']).map((meta) => [
      text(meta['wp:meta_key']),
      text(meta['wp:meta_value']),
    ]),
  );
  const live = livePosts.get(numericId);
  const liveMedia = featuredFromLive(live);
  const thumbnailId = metadata.get('_thumbnail_id');
  const attachmentImage = thumbnailId ? attachments.get(thumbnailId) : null;
  const categories = asArray(item.category);
  const category = categories.find((entry) => entry?.['@_domain'] === 'category');
  const categorySlug = category?.['@_nicename'] || '';
  const tags = categories
    .filter((entry) => entry?.['@_domain'] === 'post_tag')
    .map((entry) => text(entry))
    .filter(Boolean);
  const rawContent = text(item['content:encoded']) || live?.content?.rendered || '';
  const excerpt =
    stripHtml(item['excerpt:encoded']) ||
    stripHtml(live?.excerpt?.rendered) ||
    stripHtml(rawContent).slice(0, 240);
  const creator = text(item['dc:creator']);
  const liveAuthor = live?._embedded?.author?.[0];
  const avatarUrls = liveAuthor?.avatar_urls || {};

  return {
    publication,
    wpPostId: fullId,
    slug: text(item['wp:post_name']) || live?.slug || numericId,
    head: stripHtml(item.title) || stripHtml(live?.title?.rendered) || 'Untitled',
    excerpt,
    contentHtml: sanitizeHtml(rawContent),
    imageUrl: liveMedia.imageUrl || attachmentImage || null,
    imageThumb: liveMedia.imageThumb || attachmentImage || null,
    authorName: liveAuthor?.name || authors.get(creator) || creator || 'Staff',
    authorAvatar: avatarUrls['96'] || avatarUrls['48'] || null,
    cat: categoryMap[categorySlug] || "Editor's Choice",
    tags,
    publishedAt: text(item['wp:post_date_gmt']) || text(item['wp:post_date']),
    modifiedAt: text(item['wp:post_modified_gmt']) || text(item['wp:post_modified']) || null,
    sourceUrl: text(item.link) || live?.link || null,
  };
});

const mediaUrls = new Set();
for (const row of rows) {
  if (row.imageUrl) mediaUrls.add(row.imageUrl);
  if (row.imageThumb) mediaUrls.add(row.imageThumb);
  for (const match of row.contentHtml.matchAll(/https?:\/\/[^\s"'<>]+\/wp-content\/uploads\/[^\s"'<>]+/gi)) {
    mediaUrls.add(match[0].replace(/&amp;/g, '&'));
  }
}

console.log(
  JSON.stringify(
    {
      mode: dryRun ? 'dry-run' : 'import',
      publication,
      posts: rows.length,
      livePostsMatched: rows.filter((row) => livePosts.has(row.wpPostId.split('-').at(-1))).length,
      mediaUrls: mediaUrls.size,
      dateRange: [
        rows.map((row) => row.publishedAt).sort()[0],
        rows.map((row) => row.publishedAt).sort().at(-1),
      ],
    },
    null,
    2,
  ),
);

if (output) {
  await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await fs.writeFile(path.resolve(output), `${JSON.stringify(rows)}\n`, 'utf8');
  console.log(`Wrote ${rows.length} normalized articles to ${path.resolve(output)}`);
}

if (dryRun) process.exit(0);

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!skipMedia && !process.env.BLOB_READ_WRITE_TOKEN) {
  throw new Error('BLOB_READ_WRITE_TOKEN is required unless --skip-media is used');
}

const replacements = new Map();
const mediaFailures = [];

if (!skipMedia) {
  const queue = [...mediaUrls];
  const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
    while (queue.length) {
      const url = queue.shift();
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const pathname = new URL(url).pathname;
        const uploadPart = pathname.split('/wp-content/uploads/')[1];
        const blobPath = `articles/${publication}/wordpress/${uploadPart || path.basename(pathname)}`;
        const blob = await put(blobPath, Buffer.from(await response.arrayBuffer()), {
          access: 'public',
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: response.headers.get('content-type') || undefined,
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });
        replacements.set(url, blob.url);
      } catch (error) {
        mediaFailures.push({ url, error: error instanceof Error ? error.message : String(error) });
      }
    }
  });
  await Promise.all(workers);
}

for (const row of rows) {
  if (row.imageUrl && replacements.has(row.imageUrl)) row.imageUrl = replacements.get(row.imageUrl);
  if (row.imageThumb && replacements.has(row.imageThumb)) row.imageThumb = replacements.get(row.imageThumb);
  for (const [oldUrl, newUrl] of replacements) {
    row.contentHtml = row.contentHtml.split(oldUrl).join(newUrl);
  }
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(`
    CREATE TABLE IF NOT EXISTS wp_article_archive (
      publication TEXT NOT NULL CHECK (publication IN ('austin', 'san_antonio')),
      wp_post_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      head TEXT NOT NULL,
      excerpt TEXT NOT NULL DEFAULT '',
      content_html TEXT NOT NULL DEFAULT '',
      image_url TEXT,
      image_thumb TEXT,
      author_name TEXT NOT NULL DEFAULT 'Staff',
      author_avatar TEXT,
      cat TEXT NOT NULL,
      tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      published_at TIMESTAMPTZ NOT NULL,
      modified_at TIMESTAMPTZ,
      source_url TEXT,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (publication, wp_post_id),
      UNIQUE (publication, slug)
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_wp_article_archive_publication_date
      ON wp_article_archive (publication, published_at DESC)
  `);

  for (const row of rows) {
    await client.query(
      `INSERT INTO wp_article_archive
        (publication, wp_post_id, slug, head, excerpt, content_html,
         image_url, image_thumb, author_name, author_avatar, cat, tags,
         published_at, modified_at, source_url, imported_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW())
       ON CONFLICT (publication, wp_post_id) DO UPDATE SET
         slug = EXCLUDED.slug,
         head = EXCLUDED.head,
         excerpt = EXCLUDED.excerpt,
         content_html = EXCLUDED.content_html,
         image_url = EXCLUDED.image_url,
         image_thumb = EXCLUDED.image_thumb,
         author_name = EXCLUDED.author_name,
         author_avatar = EXCLUDED.author_avatar,
         cat = EXCLUDED.cat,
         tags = EXCLUDED.tags,
         published_at = EXCLUDED.published_at,
         modified_at = EXCLUDED.modified_at,
         source_url = EXCLUDED.source_url,
         updated_at = NOW()`,
      [
        row.publication,
        row.wpPostId,
        row.slug,
        row.head,
        row.excerpt,
        row.contentHtml,
        row.imageUrl,
        row.imageThumb,
        row.authorName,
        row.authorAvatar,
        row.cat,
        row.tags,
        row.publishedAt,
        row.modifiedAt,
        row.sourceUrl,
      ],
    );
  }
  await client.query('COMMIT');

  const result = await client.query(
    `SELECT COUNT(*)::int AS count,
            COUNT(image_url)::int AS with_image,
            MIN(published_at) AS oldest,
            MAX(published_at) AS newest
       FROM wp_article_archive
      WHERE publication = $1`,
    [publication],
  );
  console.log(
    JSON.stringify(
      {
        imported: rows.length,
        mediaUploaded: replacements.size,
        mediaFailures,
        database: result.rows[0],
      },
      null,
      2,
    ),
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
