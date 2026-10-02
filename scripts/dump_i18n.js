
const fs = require('fs');
const content = fs.readFileSync('client-admin/src/i18n/index.ts', 'utf8');
const start = content.indexOf('const resources = ') + 'const resources = '.length;
const end = content.indexOf('
// 从 localStorage');
const code = 'module.exports = ' + content.substring(start, end).trim();
fs.writeFileSync('scripts/resources_dump.js', code);
const res = require('./resources_dump.js');
console.log('Keys in ID:', Object.keys(res.id.translation).length);
console.log('Keys in EN:', Object.keys(res.en.translation).length);
console.log('Keys in ZH:', Object.keys(res.zh.translation).length);

function flatten(obj, prefix = '') {
    let acc = {};
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? prefix + '.' + k : k;
        if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
            Object.assign(acc, flatten(v, key));
        } else {
            acc[key] = v;
        }
    }
    return acc;
}

const idFlat = flatten(res.id.translation);
const enFlat = flatten(res.en.translation);
const zhFlat = flatten(res.zh.translation);

console.log('Flat ID keys:', Object.keys(idFlat).length);
console.log('Flat EN keys:', Object.keys(enFlat).length);
console.log('Flat ZH keys:', Object.keys(zhFlat).length);

// Missing in ZH
const missingInZh = Object.keys(idFlat).filter(k => zhFlat[k] === undefined);
console.log('Missing in ZH compared to ID:', missingInZh.length);
if (missingInZh.length > 0) console.log('Sample missing in ZH:', missingInZh.slice(0, 10));

const missingInZhFromEn = Object.keys(enFlat).filter(k => zhFlat[k] === undefined);
console.log('Missing in ZH compared to EN:', missingInZhFromEn.length);
if (missingInZhFromEn.length > 0) console.log('Sample missing in ZH from EN:', missingInZhFromEn.slice(0, 10));

// Non-Chinese in ZH
const nonZhValues = [];
for (const [k, v] of Object.entries(zhFlat)) {
    if (typeof v === 'string') {
        // If string contains Indonesian words or pure English without any Chinese
        // Exclude symbols/numbers/brands
        const hasChinese = /[一-龥]/.test(v);
        if (!hasChinese && v.length > 1 && !/^[0-9\s.,:\/\-_%]+$/.test(v)) {
            nonZhValues.push({ key: k, val: v });
        }
    }
}
console.log('Values in ZH without any Chinese characters:', nonZhValues.length);
console.log('Sample non-Chinese in ZH:', JSON.stringify(nonZhValues.slice(0, 30), null, 2));
