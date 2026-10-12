const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript')
const m = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('server/src/services/ShiftHandoverFinancials.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { module: m, exports: m.exports, require: () => ({}) })
const { shiftHandoverFinancials } = m.exports

test('670000 counted cash less float is independent of expenses and QRIS', () => {
  for (const expenses of [0, 35000, 35000.25]) for (const qris of [0, 336000, null]) {
    const result = shiftHandoverFinancials(670000, 100000, expenses, qris, 50000, 40000, 900000)
    assert.equal(result.actualCashReceived, 570000)
    assert.equal(result.cashFormula, 'drawerTotal-openFloat')
    assert.equal(result.expenses, expenses)
    assert.equal(result.qris, qris)
    assert.equal(result.totalRevenue, 990000)
  }
})

test('missing count stays unknown; zero and cash below float remain exact', () => {
  assert.equal(shiftHandoverFinancials(null, 100000, 0, 0, 0, 0, 0).actualCashReceived, null)
  assert.equal(shiftHandoverFinancials(0, 0, 35000, null, 0, 0, 0).actualCashReceived, 0)
  assert.equal(shiftHandoverFinancials(50000, 100000, 0, 0, 0, 0, 0).actualCashReceived, -50000)
})
