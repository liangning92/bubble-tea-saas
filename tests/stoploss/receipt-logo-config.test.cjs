const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
const loaded = { exports: {} };
new Function('exports', 'module', ts.transpileModule(fs.readFileSync('server/src/utils/receiptLogoConfig.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText)(loaded.exports, loaded);
const { prepareReceiptLogoConfig: prepare, ReceiptLogoConflict } = loaded.exports;
const receipt = { logoPurpose: 'receipt', storeLogo: '/receipt/black.png', logoSources: { black: '/receipt/black.png' }, logoVariant: 'black', paperSize: '58mm', footer: 'Keep' };
test('stale global clearing and replacing cannot change an independently owned receipt image', () => {
  for (const storeLogo of ['', '/global/white.png']) assert.throws(() => prepare(receipt, { storeLogo }), ReceiptLogoConflict);
  assert.equal(receipt.storeLogo, '/receipt/black.png');
});
test('older clients can change paper and footer without losing image ownership or variants', () => {
  const next = prepare(receipt, { storeLogo: '/receipt/black.png', paperSize: '80mm', footer: 'Changed', logoSources: { white: '/wrong.png' } });
  assert.equal(next.paperSize, '80mm'); assert.equal(next.footer, 'Changed'); assert.deepEqual(next.logoSources, receipt.logoSources); assert.equal(next.logoPurpose, 'receipt');
});
test('explicit receipt editing can replace or clear its own image while preserving other settings', () => {
  for (const storeLogo of ['/receipt/new.png', '']) { const next = prepare(receipt, { logoPurpose: 'receipt', storeLogo }); assert.equal(next.storeLogo, storeLogo); assert.equal(next.paperSize, '58mm'); assert.equal(next.footer, 'Keep'); }
});
test('legacy configurations remain compatible until their image is explicitly assigned', () => {
  const incoming = { storeLogo: '/old.png', paperSize: '58mm' }; assert.deepEqual(prepare(null, incoming), incoming); assert.deepEqual(prepare({ storeLogo: '' }, incoming), incoming);
  assert.throws(() => prepare(receipt, 'malformed overwrite'), ReceiptLogoConflict);
});
