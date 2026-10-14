const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const code = ts.transpileModule(fs.readFileSync('client-admin/src/utils/inventoryInputUnits.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const exportsObject = {}; new Function('exports', code)(exportsObject);
const {inventoryInputUnits,defaultInventoryInputUnit,inventoryUnitFactor,inventoryLedgerQuantity}=exportsObject;
test('weight entries default to kg and preserve gram ledger quantities including decimals',()=>{
 for(const unit of ['g','gram','kg','kilogram']){const material={unit}; assert.deepEqual(inventoryInputUnits(material),['kg','g']);assert.equal(defaultInventoryInputUnit(material),'kg');}
 assert.equal(inventoryLedgerQuantity(4.875,{unit:'g'},'kg'),4875);
 assert.equal(inventoryLedgerQuantity(0.001,{unit:'g'},'kg'),1);
 assert.equal(inventoryLedgerQuantity(25,{unit:'kg'},'g'),0.025);
});
test('volume entries default to litres and aliases convert to the existing ledger unit',()=>{
 for(const unit of ['ml','L','liter','litre','milliliter'])assert.deepEqual(inventoryInputUnits({unit}),['L','ml']);
 assert.equal(inventoryLedgerQuantity(88.8,{unit:'ml'},'L'),88800);
 assert.equal(inventoryLedgerQuantity(125,{unit:'liter'},'ml'),0.125);
 assert.throws(()=>inventoryUnitFactor({unit:'g'},'L'),/INCOMPATIBLE/);
});
test('pieces remain pieces; configured packages use their actual factor',()=>{
 assert.deepEqual(inventoryInputUnits({unit:'pcs'}),['pcs']);
 const material={unit:'g',packaging:{unit:'bag',quantity:250,baseUnit:'g'}};
 assert.deepEqual(inventoryInputUnits(material),['kg','g','bag']);
 assert.equal(inventoryLedgerQuantity(2,material,'bag'),500);
 assert.equal(4875/inventoryUnitFactor({unit:'g'},'kg'),4.875);
});
