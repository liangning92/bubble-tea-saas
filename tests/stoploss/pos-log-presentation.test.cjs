const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
const source=fs.readFileSync('client-admin/src/utils/posLogPresentation.ts','utf8');const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;const mod={exports:{}};new Function('module','exports',compiled)(mod,mod.exports);const {readReceiptLog}=mod.exports;
test('historical failed receipt shows generation timeout and order identity',()=>{
 const r=readReceiptLog({action:'receipt_print',metadata:JSON.stringify({status:'failed',error:'RECEIPT_PAINT_TIMEOUT',orderNumber:'AEOTUL8F6M',pickupNumber:'A01'})});
 assert.equal(r.status,'failed');assert.equal(r.reason,'paintTimeout');assert.equal(r.orderNumber,'AEOTUL8F6M');assert.equal(r.pickupNumber,'A01');
});
test('pending and sent are distinct from confirmed paper output',()=>{for(const status of ['pending','sent','paper-confirmed'])assert.equal(readReceiptLog({action:'receipt_print',metadata:{status}}).status,status)});
test('unrecognized or malformed data stays uncertain without invented causes',()=>{
 assert.equal(readReceiptLog({action:'receipt_print',metadata:'bad json'}).status,'unrecorded');
 assert.equal(readReceiptLog({action:'receipt_print',metadata:{status:'failed',error:'NEW_ERROR'}}).reason,'unknownReason');
 assert.equal(readReceiptLog({action:'checkout_failed',metadata:{status:'failed'}}),null);
});
test('legacy description fallback and delivery uncertainty are supported',()=>{
 assert.equal(readReceiptLog({action:'receipt_print',description:'Receipt output: pending',entityId:'ORDER'}).orderNumber,'ORDER');
 assert.equal(readReceiptLog({action:'receipt_print',description:'Receipt recovery: unknown',metadata:{error:'RECEIPT_DELIVERY_TIMEOUT'}}).reason,'deliveryTimeout');
});
