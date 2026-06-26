const fs = require('fs');
const content = fs.readFileSync('client-staff/src/i18n/index.ts', 'utf8');

// Extract all translation keys for each language
function extractAllKeys(block, lang) {
  const keys = {};
  const lines = block.split('\n');
  
  let currentSection = '';
  let sectionKeys = {};
  
  for (const line of lines) {
    // Section header
    const sectionMatch = line.match(/^  (\w+): \{/);
    if (sectionMatch) {
      if (currentSection && Object.keys(sectionKeys).length > 0) {
        keys[currentSection] = sectionKeys;
      }
      currentSection = sectionMatch[1];
      sectionKeys = {};
      continue;
    }
    
    // Key-value pair
    const kvMatch = line.match(/^    (\w+):\s*'([^']*)'/);
    if (kvMatch) {
      sectionKeys[kvMatch[1]] = kvMatch[2];
    }
  }
  
  // Save last section
  if (currentSection && Object.keys(sectionKeys).length > 0) {
    keys[currentSection] = sectionKeys;
  }
  
  return keys;
}

// Find blocks
const idStart = content.indexOf('id:');
const enStart = content.indexOf('en:');
const zhStart = content.indexOf('zh:');
const lastBrace = content.lastIndexOf('}');

const idBlock = content.substring(idStart + 3, enStart);
const enBlock = content.substring(enStart + 3, zhStart);
const zhBlock = content.substring(zhStart + 3, lastBrace);

const idKeys = extractAllKeys(idBlock, 'id');
const enKeys = extractAllKeys(enBlock, 'en');
const zhKeys = extractAllKeys(zhBlock, 'zh');

console.log('═══════════════════════════════════════════════════════════');
console.log('         员工APP 完整翻译key检查');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('印尼语(id) sections:', Object.keys(idKeys).length);
console.log('英语(en) sections:', Object.keys(enKeys).length);
console.log('中文(zh) sections:', Object.keys(zhKeys).length);
console.log('');

// Get all sections
const allSections = new Set([...Object.keys(idKeys), ...Object.keys(enKeys), ...Object.keys(zhKeys)]);

let totalMissing = 0;
let totalMixed = 0;
const issues = [];

// Check for missing keys
for (const section of [...allSections].sort()) {
  const idSection = idKeys[section] || {};
  const enSection = enKeys[section] || {};
  const zhSection = zhKeys[section] || {};
  
  const allKeys = new Set([...Object.keys(idSection), ...Object.keys(enSection), ...Object.keys(zhSection)]);
  
  for (const key of [...allKeys].sort()) {
    const missing = [];
    if (!idSection[key]) missing.push('id');
    if (!enSection[key]) missing.push('en');
    if (!zhSection[key]) missing.push('zh');
    
    if (missing.length > 0) {
      issues.push({ type: 'missing', section, key, missing });
      totalMissing++;
    }
  }
}

// Check for mixed language (zh with English, id with Chinese, etc.)
for (const section of [...allSections].sort()) {
  const zhSection = zhKeys[section] || {};
  const idSection = idKeys[section] || {};
  const enSection = enKeys[section] || {};
  
  for (const [key, value] of Object.entries(zhSection)) {
    // Chinese should not contain English words (except placeholders like {name})
    if (/[a-zA-Z]{4,}/.test(value) && !value.includes('{')) {
      issues.push({ type: 'mixed-zh', section, key, value: value.substring(0, 60) });
      totalMixed++;
    }
  }
  
  for (const [key, value] of Object.entries(idSection)) {
    // Indonesian should not contain Chinese characters
    if (/[一-龥]/.test(value)) {
      issues.push({ type: 'mixed-id', section, key, value: value.substring(0, 60) });
      totalMixed++;
    }
  }
  
  for (const [key, value] of Object.entries(enSection)) {
    // English should not contain Chinese characters
    if (/[一-龥]/.test(value)) {
      issues.push({ type: 'mixed-en', section, key, value: value.substring(0, 60) });
      totalMixed++;
    }
  }
}

// Print issues
if (issues.length > 0) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('         发现 ' + issues.length + ' 个问题');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  for (const issue of issues.slice(0, 50)) {
    if (issue.type === 'missing') {
      console.log('❌ 缺失翻译 [' + issue.section + '.' + issue.key + '] 缺少: ' + issue.missing.join(', '));
    } else if (issue.type === 'mixed-zh') {
      console.log('⚠️ 混杂语言 [zh.' + issue.section + '.' + issue.key + '] 中有英文: "' + issue.value + '"');
    } else if (issue.type === 'mixed-id') {
      console.log('⚠️ 混杂语言 [id.' + issue.section + '.' + issue.key + '] 中有中文: "' + issue.value + '"');
    } else if (issue.type === 'mixed-en') {
      console.log('⚠️ 混杂语言 [en.' + issue.section + '.' + issue.key + '] 中有中文: "' + issue.value + '"');
    }
  }
  
  if (issues.length > 50) {
    console.log('\n... 还有 ' + (issues.length - 50) + ' 个问题');
  }
} else {
  console.log('✅ 所有翻译检查通过！\n');
}

console.log('\n统计:');
console.log('  缺失翻译: ' + totalMissing);
console.log('  混杂语言: ' + totalMixed);
console.log('  总问题数: ' + (totalMissing + totalMixed));
