const fs = require('fs');
const content = fs.readFileSync('client-pos/src/i18n/index.ts', 'utf8');

// Extract all translation keys from the file
const keysInFile = new Set();
const regex = /(\w+)\s*:\s*\{[^}]*}/g;
let match;
while ((match = regex.exec(content)) !== null) {
  // Found a section like "pos: { ... }"
}
