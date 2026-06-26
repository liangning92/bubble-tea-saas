const fs = require('fs');
const content = fs.readFileSync('client-staff/src/i18n/index.ts', 'utf8');

// Parse all three languages
function parseTranslations(content) {
  const result = {};
  
  // Extract each language section
  const langRegex = /^(id|en|zh):\s*\{\s*translation:\s*\{([\s\S]*?)(?=^\}\s*$|^\s*\}\s*\}\s*$)/gm;
  let match;
  
  while ((match = langRegex.exec(content)) !== null) {
    const lang = match[1];
    const block = match[2];
    result[lang] = parseBlock(block);
  }
  
  return result;
}

function parseBlock(block) {
  const translations = {};
  const lines = block.split('\n');
  let currentKey = '';
  let currentIndent = 0;
  let inObject = false;
  let objectContent = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const indent = line.search(/\S/);
    const isCloseBrace = line.trim() === '},' || line.trim() === '}';
    
    if (indent === 0 && line.match(/^\s{2}(\w+):\s*\{/)) {
      // Top-level key
      const keyMatch = line.match(/^\s{2}(\w+):\s*\{/);
      if (keyMatch) {
        currentKey = keyMatch[1];
        translations[currentKey] = {};
        currentIndent = indent + 2;
        inObject = true;
        objectContent = '';
      }
    } else if (inObject && indent <= currentIndent && isCloseBrace) {
      // End of object
      inObject = false;
      translations[currentKey] = parseObjectContent(objectContent);
    } else if (inObject) {
      objectContent += line + '\n';
    } else if (indent === 2 && line.match(/^\s{2}(\w+):\s*'([^']*)'/)) {
      // Simple key-value
      const kvMatch = line.match(/^\s{2}(\w+):\s*'([^']*)'/);
      if (kvMatch && !translations[kvMatch[1]]) {
        translations[kvMatch[1]] = kvMatch[2];
      }
    } else if (indent === 2 && line.match(/^\s{2}(\w+):\s*"([^"]*)"/)) {
      const kvMatch = line.match(/^\s{2}(\w+):\s*"([^"]*)"/);
      if (kvMatch && !translations[kvMatch[1]]) {
        translations[kvMatch[1]] = kvMatch[2];
      }
    }
  }
  
  return translations;
}

function parseObjectContent(content) {
  const obj = {};
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Match simple key-value pairs
    const simpleMatch = line.match(/^\s+(\w+):\s*'([^']*)'[,\n]/);
    if (simpleMatch) {
      obj[simpleMatch[1]] = simpleMatch[2];
      continue;
    }
    
    const dqMatch = line.match(/^\s+(\w+):\s*"([^"]*)"[,\n]/);
    if (dqMatch) {
      obj[dqMatch[1]] = dqMatch[2];
      continue;
    }
  }
  
  return obj;
}

// Better approach: split by language and parse recursively
const idMatch = content.match(/id:\s*\{\s*translation:\s*\{([\s\S]*?)(?=\n\s{1}\}\s*\}\s*\}\s*$)/);
const enMatch = content.match(/en:\s*\{\s*translation:\s*\{([\s\S]*?)(?=\n\s{1}\}\s*\}\s*\}\s*$)/);
const zhMatch = content.match(/zh:\s*\{\s*translation:\s*\{([\s\S]*?)(?=\n\s{1}\}\s*\}\s*\}\s*$)/);

function extractKeys(block, prefix = '') {
  const keys = {};
  const lines = block.split('\n');
  
  let currentSection = '';
  for (const line of lines) {
    // Section header (indent: 2 spaces, ends with : {)
    const sectionMatch = line.match(/^  (\w+):\s*\{/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      keys[currentSection] = {};
      continue;
    }
    
    // Simple key-value (indent: 4 spaces)
    const kvMatch = line.match(/^    (\w+):\s*'([^']*)'[,\n]?/);
    if (kvMatch && currentSection) {
      keys[currentSection][kvMatch[1]] = kvMatch[2];
    }
  }
  
  return keys;
}

const idKeys = extractKeys(idMatch ? idMatch[1] : '');
const enKeys = extractKeys(enMatch ? enMatch[1] : '');
const zhKeys = extractKeys(zhMatch ? zhMatch[1] : '');

console.log('═══════════════════════════════════════════════════════════');
console.log('           员工APP 翻译深度检查');
console.log('═══════════════════════════════════════════════════════════\n');

// Compare all sections
const allSections = new Set([...Object.keys(idKeys), ...Object.keys(enKeys), ...Object.keys(zhKeys)]);

let totalIssues = 0;

for (const section of allSections) {
  const idSection = idKeys[section] || {};
  const enSection = enKeys[section] || {};
  const zhSection = zhKeys[section] || {};
  
  const allKeys = new Set([...Object.keys(idSection), ...Object.keys(enSection), ...Object.keys(zhSection)]);
  
  if (allKeys.size > Object.keys(idSection).length || allKeys.size > Object.keys(enSection).length || allKeys.size > Object.keys(zhSection).length) {
    console.log('❌ [' + section + '] 缺少翻译:');
    
    for (const key of allKeys) {
      const missing = [];
      if (!idSection[key]) missing.push('id');
      if (!enSection[key]) missing.push('en');
      if (!zhSection[key]) missing.push('zh');
      if (missing.length > 0) {
        console.log('   - ' + key + ' (缺少: ' + missing.join(', ') + ')');
        totalIssues++;
      }
    }
    console.log('');
  }
}

// Check for mixed language (non-translated strings)
console.log('═══════════════════════════════════════════════════════════');
console.log('           检查混杂语言');
console.log('═══════════════════════════════════════════════════════════\n');

const mixedPatterns = [
  { lang: 'id', pattern: /[a-zA-Z]{5,}/g, name: '印尼语' },
  { lang: 'zh', pattern: /[a-zA-Z]{5,}/g, name: '中文' },
  { lang: 'en', pattern: /[一-龥]/g, name: '英语' },
];

for (const section in zhKeys) {
  const zhValues = Object.values(zhKeys[section]);
  const enValues = Object.values(enKeys[section] || {});
  const idValues = Object.values(idKeys[section] || {});
  
  // Check if zh has English words
  for (const [key, value] of Object.entries(zhKeys[section])) {
    if (/[a-zA-Z]{4,}/.test(value) && !value.includes('{')) {
      console.log('⚠️  [zh.' + section + '.' + key + '] 包含英文字符: "' + value.substring(0, 50) + '"');
      totalIssues++;
    }
  }
  
  // Check if id has Chinese words
  for (const [key, value] of Object.entries(idKeys[section] || {})) {
    if (/[一-龥]/.test(value)) {
      console.log('⚠️  [id.' + section + '.' + key + '] 包含中文字符: "' + value.substring(0, 50) + '"');
      totalIssues++;
    }
  }
  
  // Check if en has Chinese words
  for (const [key, value] of Object.entries(enKeys[section] || {})) {
    if (/[一-龥]/.test(value)) {
      console.log('⚠️  [en.' + section + '.' + key + '] 包含中文字符: "' + value.substring(0, 50) + '"');
      totalIssues++;
    }
  }
}

console.log('═══════════════════════════════════════════════════════════');
console.log('           检查结果汇总');
console.log('═══════════════════════════════════════════════════════════\n');

if (totalIssues === 0) {
  console.log('✅ 所有翻译检查通过！\n');
} else {
  console.log('❌ 发现 ' + totalIssues + ' 个翻译问题\n');
}
