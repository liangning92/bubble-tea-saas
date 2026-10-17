const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const moduleCode = ts.transpileModule(fs.readFileSync('client-admin/src/utils/productSorting.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = { exports: {} };
new Function('exports', 'module', moduleCode)(loaded.exports, loaded);
const { sortProducts, productSortKeys } = loaded.exports;
const items = [
  { id: 'a', costPrice: 8000, specs: [{price: 10000}] },
  { id: 'b', costPrice: 3000, specs: [{price: 8000}] },
  { id: 'loss', costPrice: 14000, specs: [{price: 12000}] },
  { id: 'missing', costPrice: 0, specs: [{price: 5000}] }
];
const ids = rows => rows.map(row => row.id);
test('only business-facing sort choices are offered', () => assert.deepEqual(productSortKeys, ['default', 'profit', 'margin', 'price', 'sales', 'revenue']));
test('profit, margin and price each follow their displayed business measure', () => {
  assert.deepEqual(ids(sortProducts(items, 'profit', 'desc')), ['b', 'missing', 'a', 'loss']);
  assert.deepEqual(ids(sortProducts(items, 'margin', 'desc')), ['b', 'a', 'loss', 'missing']);
  assert.deepEqual(ids(sortProducts(items, 'margin', 'asc')), ['loss', 'a', 'b', 'missing']);
  assert.deepEqual(ids(sortProducts(items, 'price', 'asc')), ['missing', 'b', 'a', 'loss']);
  assert.deepEqual(ids(sortProducts(items, 'price', 'desc')), ['loss', 'a', 'b', 'missing']);
});
test('sorting preserves source/cache order, ties, empty filters and full precision', () => {
  const original = JSON.stringify(items);
  sortProducts(items, 'profit', 'asc');
  assert.equal(JSON.stringify(items), original);
  assert.equal(sortProducts(items, 'default', 'desc'), items);
  assert.deepEqual(sortProducts([], 'price', 'desc'), []);
  const close = [{ id:'first',costPrice: 50.2,specs:[{price:100}] }, {id:'second',costPrice:50.1,specs:[{price:100}]}];
  assert.deepEqual(ids(sortProducts(close, 'margin', 'desc')), ['second','first']);
  assert.deepEqual(ids(sortProducts(items.slice(1,2).concat(items[3]), 'profit', 'asc')), ['b','missing']);
});

test('sales and revenue contribution use period totals with unknown values last', () => {
  const rows = [{ id:'a',salesQuantity:20,revenueShare:10 },{ id:'b',salesQuantity:5,revenueShare:80 },{ id:'none',salesQuantity:0,revenueShare:0 },{ id:'unknown' }];
  assert.deepEqual(ids(sortProducts(rows,'sales','desc')),['a','b','none','unknown']);
  assert.deepEqual(ids(sortProducts(rows,'revenue','desc')),['b','a','none','unknown']);
  assert.deepEqual(ids(sortProducts(rows,'revenue','asc')),['none','a','b','unknown']);
});
const salesModule={exports:{}};
new Function('exports','module',ts.transpileModule(fs.readFileSync('client-admin/src/utils/productSales.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(salesModule.exports,salesModule);
test('sales ranking includes later pages and contribution uses the complete store total',async()=>{
  const calls=[];
  const rows=await salesModule.exports.loadProductSales(async page=>{calls.push(page);return {total:3,pageSize:2,list:page===1?[{productId:'a',quantity:1,revenue:100},{productId:'b',quantity:0,revenue:0}]:[{productId:'c',quantity:50,revenue:400}]}});
  assert.deepEqual(calls,[1,2]);assert.equal(rows.get('a').revenueShare,20);assert.equal(rows.get('c').revenueShare,80);assert.equal(rows.get('c').quantity,50);
});
test('failed later pages reject the ranking instead of showing partial or zero sales',async()=>{
  await assert.rejects(salesModule.exports.loadProductSales(async page=>{if(page===2)throw Error('offline');return {total:3,pageSize:2,list:[{productId:'a',quantity:1,revenue:100}]}}),/offline/);
  const rows=await salesModule.exports.loadProductSales(async()=>({total:1,pageSize:20,list:[{productId:'zero',quantity:0,revenue:0}]}));assert.equal(rows.get('zero').revenueShare,0);
});
