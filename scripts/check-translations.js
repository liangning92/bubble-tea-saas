#!/usr/bin/env node
/**
 * 综合检查脚本 - 检查翻译、路由、页面完整性
 */

const fs = require('fs');
const path = require('path');

const PAGES_DIR = path.join(__dirname, '../client-admin/src/pages');
const I18N_FILE = path.join(__dirname, '../client-admin/src/i18n/index.ts');

// 1. 收集所有页面使用的翻译键
function extractTranslationKeys() {
  const keys = new Set();
  const pages = {};

  function walkDir(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        const filePath = path.join(dir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        // 匹配 t('key') 或 t("key")
        const matches = content.match(/t\(['"`])([^'"`]+)\1/g) || [];
        matches.forEach(m => {
          const key = m.match(/t\(['"`])(.+)\1/)[2];
          keys.add(key);
          if (!pages[file]) pages[file] = [];
          pages[file].push(key);
        });
      }
    });
  }

  walkDir(PAGES_DIR);
  return { keys: Array.from(keys), pages };
}

// 2. 收集i18n文件中的所有键
function extractI18nKeys() {
  const content = fs.readFileSync(I18N_FILE, 'utf8');
  const keys = new Set();

  // 匹配 translation: { ... } 结构
  const sectionMatch = content.match(/translation:\s*\{([^}]+)/g);
  if (sectionMatch) {
    sectionMatch.forEach(section => {
      const kvMatches = section.match(/([a-zA-Z0-9_]+):\s*['"][^'"]*['"]/g) || [];
      kvMatches.forEach(kv => {
        const key = kv.match(/([a-zA-Z0-9_]+):/)[1];
        keys.add(key);
      });
    });
  }

  return Array.from(keys);
}

// 3. 检查页面组件导出
function checkComponentExports() {
  const pages = fs.readdirSync(PAGES_DIR, { recursive: true })
    .filter(f => f.endsWith('.tsx'))
    .map(f => f.toString());

  const results = [];
  pages.forEach(page => {
    const content = fs.readFileSync(path.join(PAGES_DIR, page), 'utf8');
    const hasExport = content.includes('export function') || content.includes('export const');
    if (!hasExport) {
      results.push(page);
    }
  });
  return results;
}

// 运行检查
console.log('=== 翻译键检查 ===\n');

const { keys: usedKeys, pages: keyUsage } = extractTranslationKeys();
const i18nKeys = extractI18nKeys();
const missingKeys = usedKeys.filter(k => !i18nKeys.includes(k));

if (missingKeys.length > 0) {
  console.log('❌ 缺失的翻译键:');
  missingKeys.forEach(k => console.log(`   - ${k}`));
} else {
  console.log('✅ 所有翻译键已定义');
}

console.log('\n=== 页面组件检查 ===\n');

const missingExports = checkComponentExports();
if (missingExports.length > 0) {
  console.log('❌ 缺失导出的页面:');
  missingExports.forEach(f => console.log(`   - ${f}`));
} else {
  console.log('✅ 所有页面都有导出');
}

console.log('\n=== 统计 ===');
console.log(`页面数量: ${Object.keys(keyUsage).length}`);
console.log(`翻译键数量: ${i18nKeys.length}`);
console.log(`使用的键数量: ${usedKeys.length}`);

process.exit(missingKeys.length > 0 ? 1 : 0);
