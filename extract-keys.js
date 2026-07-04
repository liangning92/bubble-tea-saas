const fs = require('fs');
const content = fs.readFileSync('client-pos/src/i18n/index.ts', 'utf8');

// Extract all translation keys (simplified approach)
const keys = new Set();

// Match patterns like: keyName: 'value' or keyName: "value"
// But only within the translation object
const lines = content.split('\n');
let inTranslation = false;
let currentSection = '';

for (const line of lines) {
  if (line.includes('translation:')) {
    inTranslation = true;
    continue;
  }
  if (line.includes('},') && inTranslation && currentSection) {
    // End of section
  }
  
  // Check for section headers (auth:, pos:, common:, toolbar:, etc.)
  const sectionMatch = line.match(/^\s+(\w+):\s*\{/);
  if (sectionMatch && inTranslation) {
    currentSection = sectionMatch[1];
    continue;
  }
  
  // Check for key: value pairs
  const keyMatch = line.match(/^\s+(\w+):\s*['"][^'"]*['"]/);
  if (keyMatch && currentSection && inTranslation) {
    keys.add(`${currentSection}.${keyMatch[1]}`);
  }
}

// Output keys
console.log([...keys].sort().join('\n'));
