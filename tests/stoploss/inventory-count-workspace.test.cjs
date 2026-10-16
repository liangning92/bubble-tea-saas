const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('client-admin/src/utils/inventoryCountFlow.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:mod,exports:mod.exports,URLSearchParams});
const {inventoryLogDisplay:display,isInventoryAdjustment:isAdjustment,countDetailUrl,countStatusFilter}=mod.exports;
test('approved count adjustments preserve source references, reason and reviewer; signed quantities do not double-negate',()=>{
 for(const [quantity,delta] of [[-2,2],[3,-3],[0,0]]){
  const row=display({id:'log',type:'stock_out',reason:'count_adjustment',quantity,note:JSON.stringify({countId:'count/with space',countItemId:'item&1',actor:'reviewer',reason:'Counted cups',varianceAmountEstimate:20})});
  assert.equal(row.stockDelta,delta);assert.equal(row.note,'Counted cups');assert.equal(row.staffId,'reviewer');assert.equal(row.countId,'count/with space');assert.equal(row.adjustmentValue,20);assert.ok(isAdjustment(row));
  const url=new URL(countDetailUrl(row.countId,row.countItemId),'https://fixture.invalid');assert.equal(url.pathname,'/inventory/count');assert.equal(url.searchParams.get('countId'),row.countId);assert.equal(url.searchParams.get('itemId'),row.countItemId);
 }
});
test('legacy adjustments remain visible without fabricated count links, ordinary receipt notes keep existing display text',()=>{
 const rows=[display({type:'stock_in',quantity:4,note:'Adjustment: legacy surplus'}),display({type:'stock_out',quantity:2,reason:'adjust',note:'Old loss'})];
 assert.ok(rows.every(isAdjustment));assert.equal(rows[0].stockDelta,4);assert.equal(rows[1].stockDelta,-2);assert.ok(rows.every(r=>r.countId===undefined));
 assert.equal(display({type:'stock_out',reason:'sold',quantity:2,note:'{"orderNumber":"ORDER-1"}'}).note,'ORDER-1');
 assert.equal(display({type:'stock_out',reason:'count_adjustment',quantity:null,note:'malformed'}).stockDelta,null);
 assert.equal(display({type:'stock_out',reason:'sold',quantity:1,note:'{"countId":"fake"}'}).countId,undefined);
});
test('unknown count status falls back to all, preserving all workflow stages and adjustment history',()=>{
 for(const state of ['all','in_progress','pending_review','completed','cancelled','adjustments'])assert.equal(countStatusFilter(state),state);
 assert.equal(countStatusFilter('unknown'),'all');assert.equal(countStatusFilter(null),'all');
});

test('raw receipt notes mentioning processing do not become processed-output movements',()=>{
 const {inventoryLogDisplay,isProcessingInbound}=mod.exports;
 assert.equal(isProcessingInbound(inventoryLogDisplay({type:'stock_in',quantity:1,note:JSON.stringify({kind:'receipt',note:'采购冰淇淋粉用于加工'})})),false);
 assert.equal(isProcessingInbound(inventoryLogDisplay({type:'stock_in',quantity:1,note:'加工产出: 红茶汤'})),true);
 assert.equal(isProcessingInbound(inventoryLogDisplay({type:'stock_out',reason:'process',quantity:1,note:'加工: 红茶汤'})),false);
});

test('count bookkeeping JSON without a human reason never appears as a business note',()=>{
 for(const reason of [null,undefined,'']){
  const source={type:'stock_out',reason:'count_adjustment',quantity:246,note:JSON.stringify({countId:'count',countItemId:'cup',actor:'reviewer',systemQty:381,countedQty:135,reason,varianceAmountEstimate:-123000})};
  const row=display(source);assert.equal(row.note,'');assert.equal(row.countId,'count');assert.equal(row.countItemId,'cup');assert.equal(row.staffId,'reviewer');assert.equal(row.stockDelta,-246);assert.equal(row.adjustmentValue,-123000);assert.equal(source.note.includes('systemQty'),true);
 }
 assert.equal(display({reason:'count_adjustment',quantity:1,note:'Ordinary legacy explanation'}).note,'Ordinary legacy explanation');
 assert.equal(display({reason:'count_adjustment',quantity:1,note:JSON.stringify({note:'Recount requested'})}).note,'Recount requested');
 assert.equal(display({reason:'withdrawal',quantity:1,note:'User-provided ordinary note'}).note,'User-provided ordinary note');
});

test('technical sale and receipt metadata is not a note, human and unknown JSON text is preserved',()=>{
 assert.equal(display({reason:'sold',quantity:5,note:'{"version":1,"ledgerUnit":"g","ledgerQuantity":5}'}).note,'');
 assert.equal(display({reason:'withdrawal',quantity:1,note:'{"kind":"manual-out","unitCost":300}'}).note,'');
 assert.equal(display({reason:'withdrawal',quantity:1,note:'{"kind":"manual-out","note":"For afternoon shift"}'}).note,'For afternoon shift');
 assert.equal(display({reason:'other',quantity:1,note:'{"delivery":"fragile"}'}).note,'{"delivery":"fragile"}');
});
