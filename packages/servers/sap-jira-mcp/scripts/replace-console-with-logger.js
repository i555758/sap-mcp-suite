#!/usr/bin/env node

/**
 * Script to replace console logging calls with logger calls
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node replace-console-with-logger.js <file-path>');
  process.exit(1);
}

const absolutePath = resolve(filePath);
console.log(`Processing file: ${absolutePath}`);

let content = readFileSync(absolutePath, 'utf8');

// Add logger import if not present
if (!content.includes('import { logger }')) {
  // Find the last import statement
  const importRegex = /^import\s+.*from\s+['"].*['"];?\s*$/gm;
  const imports = content.match(importRegex);

  if (imports && imports.length > 0) {
    const lastImport = imports[imports.length - 1];
    const lastImportIndex = content.lastIndexOf(lastImport);
    const insertPosition = lastImportIndex + lastImport.length;

    content = content.slice(0, insertPosition) +
              '\nimport { logger } from "../utils/logger.js";' +
              content.slice(insertPosition);

    console.log('Added logger import');
  }
}

// Replace console.error with logger.error
let count = 0;
content = content.replace(/console\.error\(/g, () => {
  count++;
  return 'logger.error(';
});
console.log(`Replaced ${count} console.error calls`);

// Replace console.log with logger.info (since most console.log are informational)
count = 0;
content = content.replace(/console\.log\(/g, () => {
  count++;
  return 'logger.info(';
});
console.log(`Replaced ${count} console.log calls`);

// Replace console.warn with logger.warn
count = 0;
content = content.replace(/console\.warn\(/g, () => {
  count++;
  return 'logger.warn(';
});
console.log(`Replaced ${count} console.warn calls`);

// Replace console.debug with logger.debug
count = 0;
content = content.replace(/console\.debug\(/g, () => {
  count++;
  return 'logger.debug(';
});
console.log(`Replaced ${count} console.debug calls`);

// Write the modified content back
writeFileSync(absolutePath, content, 'utf8');
console.log(`Successfully updated ${absolutePath}`);
