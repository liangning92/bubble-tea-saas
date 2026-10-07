const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const api = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('server/src/utils/stringFilter.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: api, process });
test('desktop search omits unsupported mode and cloud search retains insensitive mode', () => {
  assert.equal(JSON.stringify(api.containsFilter('A01', 'file:C:/fixture.db')), '{"contains":"A01"}');
  assert.equal(JSON.stringify(api.containsFilter('A01', 'postgresql://synthetic.invalid/test')), '{"contains":"A01","mode":"insensitive"}');
});
