const fs = require('fs');
const ts = require('typescript');

let rawContent = fs.readFileSync('client-admin/src/i18n/index.ts', 'utf-8');

// Step 1: Fix nesting syntax bug in zh
rawContent = rawContent.replace(
  "passingScorePlaceholder: '0-100',\n      members: {",
  "passingScorePlaceholder: '0-100'\n      },\n      members: {"
);
rawContent = rawContent.replace(
  /\}\n\}\n\}\n\}\n\}\n\n\/\/ 从 localStorage/,
  "}\n}\n}\n}\n\n// 从 localStorage"
);

// Transpile to JS and evaluate resources
const result = ts.transpileModule(rawContent, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const mockI18n = {
  default: {
    use: () => mockI18n.default,
    init: (opts) => { mockI18n.options = opts; }
  },
  use: () => mockI18n.default,
  init: (opts) => { mockI18n.options = opts; }
};
const mockModule = { exports: {} };
new Function("module", "exports", "require", result.outputText)(mockModule, mockModule.exports, () => mockI18n);

const resources = mockI18n.options.resources;

// Load translation dictionaries
const idTranslations = JSON.parse(fs.readFileSync('scripts/id_translations_data.json', 'utf-8'));
const idFixes = JSON.parse(fs.readFileSync('scripts/id_fixes.json', 'utf-8'));
const enFixes = JSON.parse(fs.readFileSync('scripts/en_fixes.json', 'utf-8'));
const zhFixes = JSON.parse(fs.readFileSync('scripts/zh_fixes.json', 'utf-8'));

function setDeep(obj, path, value) {
  const parts = path.split('.');
  let curr = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!curr[parts[i]] || typeof curr[parts[i]] !== 'object') {
      curr[parts[i]] = {};
    }
    curr = curr[parts[i]];
  }
  curr[parts[parts.length - 1]] = value;
}

// Apply fixes to en
for (const [k, v] of Object.entries(enFixes)) {
  setDeep(resources.en.translation, k, v);
}

// Apply fixes and translations to id
for (const [k, v] of Object.entries(idTranslations)) {
  setDeep(resources.id.translation, k, v);
}
for (const [k, v] of Object.entries(idFixes)) {
  setDeep(resources.id.translation, k, v);
}

// Apply fixes to zh
for (const [k, v] of Object.entries(zhFixes)) {
  setDeep(resources.zh.translation, k, v);
}

// Validate key coverage
const getFlatKeys = (obj, prefix = '') => {
  let keys = {};
  for (const k in obj) {
    if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
      Object.assign(keys, getFlatKeys(obj[k], prefix ? prefix + '.' + k : k));
    } else {
      keys[prefix ? prefix + '.' + k : k] = obj[k];
    }
  }
  return keys;
};

const idFlat = getFlatKeys(resources.id.translation);
const enFlat = getFlatKeys(resources.en.translation);
const zhFlat = getFlatKeys(resources.zh.translation);

const missingId = Object.keys(enFlat).filter(k => !(k in idFlat));
const missingZh = Object.keys(enFlat).filter(k => !(k in zhFlat));

console.log("Validation Results:");
console.log("EN total keys:", Object.keys(enFlat).length);
console.log("ID total keys:", Object.keys(idFlat).length, "| Missing vs EN:", missingId.length);
console.log("ZH total keys:", Object.keys(zhFlat).length, "| Missing vs EN:", missingZh.length);

if (missingId.length > 0) {
  console.log("Remaining missing in ID:", missingId);
}
if (missingZh.length > 0) {
  console.log("Remaining missing in ZH:", missingZh);
}

// Check for remaining Chinese in EN
const chineseRegex = /[\u4e00-\u9fa5]+/;
const chineseInEn = Object.entries(enFlat).filter(([k, v]) => chineseRegex.test(v));
console.log("Chinese strings in EN:", chineseInEn.length);
if (chineseInEn.length > 0) {
  console.log(chineseInEn);
}

// Check for remaining Chinese in ID
const chineseInId = Object.entries(idFlat).filter(([k, v]) => chineseRegex.test(v));
console.log("Chinese strings in ID:", chineseInId.length);
if (chineseInId.length > 0) {
  console.log(chineseInId);
}

// Serialize resources to clean formatted TypeScript file
const newFileContent = `import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const resources = ${JSON.stringify(resources, null, 2)}

// 从 localStorage 读取保存的语言设置，默认 'id'
const getInitialLanguage = () => {
  try {
    const stored = localStorage.getItem('bubble-tea-language')
    if (stored && ['id', 'en', 'zh'].includes(stored)) {
      return stored
    }
  } catch (e) {
    // localStorage 不可用时忽略
  }
  return 'id'
}

i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
})

export default i18n
`;

fs.writeFileSync('client-admin/src/i18n/index.ts', newFileContent, 'utf-8');
console.log("Successfully wrote client-admin/src/i18n/index.ts!");
