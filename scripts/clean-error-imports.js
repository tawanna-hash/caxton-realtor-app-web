#!/usr/bin/env node
// Remove unused withErrorHandling imports from files that now use withAdminTracking.
// Only removes it from the import if withErrorHandling is no longer used in the file body.

const fs = require('fs');
const path = require('path');

function findRouteFiles(dir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) findRouteFiles(fullPath, results);
    else if (entry.name === 'route.ts' || entry.name === 'route.tsx') results.push(fullPath);
  }
  return results;
}

const adminApiDir = path.join(__dirname, '..', 'app', 'api', 'admin');
const files = findRouteFiles(adminApiDir);

let cleaned = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf-8');

  // Skip if no withAdminTracking
  if (!content.includes('withAdminTracking')) continue;

  // Count occurrences of withErrorHandling in the file (excluding import line)
  const withoutImports = content.replace(/^import.*$/gm, '');
  const usageCount = (withoutImports.match(/withErrorHandling/g) || []).length;

  if (usageCount > 0) continue; // Still used in code, keep import

  // Check if withErrorHandling is in a combined import like { withErrorHandling, ApiError }
  const combinedImportRegex = /import\s*\{\s*([^}]+)\s*\}\s*from\s*'@\/lib\/server\/error';/;
  const match = content.match(combinedImportRegex);
  
  if (match) {
    const imports = match[1].split(',').map(s => s.trim());
    const filtered = imports.filter(i => i !== 'withErrorHandling');
    
    if (filtered.length === 0) {
      // Remove the entire import line
      content = content.replace(combinedImportRegex + '\n', '');
      // Actually need to handle the newline properly
      content = content.replace(/import\s*\{\s*withErrorHandling\s*\}\s*from\s*'@\/lib\/server\/error';\n?/, '');
    } else {
      // Rebuild the import without withErrorHandling
      const newImport = `import { ${filtered.join(', ')} } from '@/lib/server/error';`;
      content = content.replace(combinedImportRegex, newImport);
    }
    
    fs.writeFileSync(file, content, 'utf-8');
    cleaned++;
  } else {
    // Single import: import { withErrorHandling } from '@/lib/server/error';
    const singleImportRegex = /import\s*\{\s*withErrorHandling\s*\}\s*from\s*'@\/lib\/server\/error';\n?/;
    if (singleImportRegex.test(content)) {
      content = content.replace(singleImportRegex, '');
      fs.writeFileSync(file, content, 'utf-8');
      cleaned++;
    }
  }
}

console.log(`Cleaned unused imports: ${cleaned}`);
