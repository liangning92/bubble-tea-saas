/**
 * Direct hardcoded string finder - searches for JSX text and attribute patterns
 */

const fs = require('fs');
const path = require('path');

const CLIENTS = ['client-admin', 'client-pos', 'client-staff'];

// Find all TS/TSX files
function getFiles(dir, results = []) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !['node_modules', 'dist', 'build'].includes(entry.name)) {
          getFiles(full, results);
        }
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        results.push(full);
      }
    }
  } catch (e) {}
  return results;
}

// Skip technical strings
const SKIP_STRINGS = new Set([
  'Promise', 'void', 'null', 'undefined', 'true', 'false',
  'GET', 'POST', 'PUT', 'DELETE', 'PATCH',
  'admin', 'manager', 'cashier', 'staff',
]);

function shouldSkip(text) {
  if (!text || text.length < 2) return true;
  if (SKIP_STRINGS.has(text)) return true;
  if (/^(https?|www\.)/.test(text)) return true;
  if (/^(data:|blob:)/.test(text)) return true;
  if (/^[\d\.\-\/\s]+$/.test(text)) return true;
  if (/^v?\d+(\.\d+)+$/.test(text)) return true;
  if (/^[A-Z][A-Z0-9_]+$/.test(text) && text.length > 3) return true; // UPPER_SNAKE
  if (/^[a-z_][a-z0-9_]*$/.test(text) && text.length > 3) return true; // snake_case
  if (/^\$[a-zA-Z]/.test(text)) return true;
  if (/^\/.*\/[gimsuy]*$/.test(text)) return true;
  if (text.includes('${')) return true;
  return false;
}

// Find hardcoded JSX text and attribute values
function scanFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const findings = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const trimmed = line.trim();

      // Skip imports, exports, comments
      if (/^(import|export|from|require|declare)/.test(trimmed)) continue;
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

      // Pattern: placeholder="...", title="...", aria-label="...", alt="...", label="..."
      const attrPatterns = [
        /(?:placeholder|title|aria-label|alt|label|aria-labelledby|aria-describedby|tooltip|hint|caption|footer|header|summary|htmlFor)\s*=\s*(['"])([^'"]+)\2/g,
      ];

      for (const attrRe of attrPatterns) {
        attrRe.lastIndex = 0;
        let match;
        while ((match = attrRe.exec(line)) !== null) {
          const text = match[2];
          if (shouldSkip(text)) continue;
          // Skip if it's t() call
          if (text.startsWith('t(')) continue;
          // Skip Tailwind class patterns
          if (/^(xs|sm|md|lg|xl|2xl)$/.test(text)) continue;
          if (/^[\d\.\-\/]+$/.test(text)) continue;
          findings.push({ text, line: lineNum, context: trimmed.substring(0, 180), file: filePath });
        }
      }

      // Pattern: JSX text content (not in t())
      // Match: > Text < where Text is not inside {} or t()
      // e.g. <span>Hardcoded Text</span> or <div>Click Here</div>
      // Look for lines that have >text< but NOT t('text')
      const jsxTextRe = /(?:^|>)\s*([^<{}\n]{2,80}?)\s*<(?!\/|})/g;
      while ((match = jsxTextRe.exec(line)) !== null) {
        const text = match[1].trim();
        if (shouldSkip(text)) continue;
        if (line.includes(`t('${text}')`) || line.includes(`t("${text}")`)) continue;
        if (line.includes('{') && line.includes('}')) continue; // inside JSX expression
        // Skip technical
        if (/^(https?|www\.)/.test(text)) continue;
        if (/^[A-Z][A-Z0-9_]+$/.test(text) && text.length > 3) continue;
        findings.push({ text, line: lineNum, context: trimmed.substring(0, 180), file: filePath });
      }
    }

    return findings;
  } catch (e) {
    return [];
  }
}

const allFindings = {};
let totalFiles = 0;

for (const client of CLIENTS) {
  const srcDir = path.join(__dirname, '..', client, 'src');
  if (!fs.existsSync(srcDir)) continue;

  const files = getFiles(srcDir);
  totalFiles += files.length;

  for (const f of files) {
    const results = scanFile(f);
    for (const r of results) {
      const key = `${r.file}:${r.line}:${r.text}`;
      if (!allFindings[key]) {
        allFindings[key] = r;
      }
    }
  }
}

// Group by file
const byFile = {};
for (const k of Object.keys(allFindings)) {
  const f = allFindings[k].file;
  if (!byFile[f]) byFile[f] = [];
  byFile[f].push(allFindings[k]);
}

console.error(`Scanned ${totalFiles} files, found ${Object.keys(allFindings).length} hardcoded strings\n`);

const sortedFiles = Object.keys(byFile).sort();
for (const f of sortedFiles) {
  const shortFile = f.replace(__dirname + '/..', '');
  console.log('');
  console.log('================================================================================');
  console.log(`FILE: ${shortFile}`);
  console.log('================================================================================');
  for (const r of byFile[f].sort((a, b) => a.line - b.line)) {
    console.log(`  L${r.line}: "${r.text}"`);
    console.log(`       ${r.context}`);
  }
}
