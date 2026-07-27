#!/usr/bin/env node
// Script to replace withErrorHandling with withAdminTracking in all admin API routes.
// Only touches files that currently import withErrorHandling.

const fs = require('fs');
const path = require('path');

function findRouteFiles(dir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findRouteFiles(fullPath, results);
    } else if (entry.name === 'route.ts' || entry.name === 'route.tsx') {
      results.push(fullPath);
    }
  }
  return results;
}

const adminApiDir = path.join(__dirname, '..', 'app', 'api', 'admin');
const files = findRouteFiles(adminApiDir);

let modified = 0;
let skipped = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf-8');

  // Skip if doesn't import withErrorHandling
  if (!content.includes('withErrorHandling')) {
    skipped++;
    continue;
  }

  // Skip if already has withAdminTracking
  if (content.includes('withAdminTracking')) {
    skipped++;
    continue;
  }

  // Add import for withAdminTracking
  const importLine = "import { withAdminTracking } from '@/lib/server/admin-tracking';";
  
  // Find the withErrorHandling import and add withAdminTracking after it
  const withErrorImportRegex = /import\s*\{[^}]*withErrorHandling[^}]*\}\s*from\s*'@\/lib\/server\/error';/;
  
  if (withErrorImportRegex.test(content)) {
    // Add withAdminTracking import after the error import
    content = content.replace(
      withErrorImportRegex,
      (match) => match + '\n' + importLine
    );
  } else {
    // Find any import line and add after it
    const firstImport = content.match(/^import .+ from .+;$/m);
    if (firstImport) {
      content = content.replace(firstImport[0], firstImport[0] + '\n' + importLine);
    }
  }

  // Replace withErrorHandling( with withAdminTracking(
  // But only in export statements (where it's used as a wrapper)
  // Pattern: export const POST = withErrorHandling(
  //          export const GET = withErrorHandling(
  //          export const PUT = withErrorHandling(
  //          export const PATCH = withErrorHandling(
  //          export const DELETE = withErrorHandling(
  content = content.replace(
    /export const (GET|POST|PUT|PATCH|DELETE)\s*=\s*withErrorHandling\(/g,
    'export const $1 = withAdminTracking('
  );

  fs.writeFileSync(file, content, 'utf-8');
  modified++;
}

console.log(`Modified: ${modified}, Skipped: ${skipped}, Total: ${files.length}`);
