const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(require('node:path').resolve(__dirname, '../../shared/NotificationAwarenessInbox.tsx'), 'utf8');
const context = { exports: {}, require: () => ({}) };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
const {approvalPath, isPendingApproval} = context.exports;
const row = (patch={}) => ({kind:'approval_request', pending:true, read:true, url:'/count?id=one', adminUrl:'/inventory/count?countId=one', ...patch});
const inbox = (items, approvalPending=1) => ({items, counts:{approvalPending}});
test('one approval opens its exact destination even when already read and mixed with business reminders', () => {
  const data = inbox([row({kind:'business_reminder',url:'/alert'}), row()]);
  assert.equal(approvalPath(data,true), '/inventory/count?countId=one');
  assert.equal(approvalPath(data,false), '/count?id=one');
  assert.equal(isPendingApproval(row()),true);
  assert.equal(isPendingApproval(row({kind:'business_reminder'})),false);
  assert.equal(isPendingApproval(row({pending:false})),false);
});
test('multiple, absent, inconsistent, inbox-only or unsafe destinations open the approval filter', () => {
  for (const data of [inbox([row(),row()],2),inbox([],0),inbox([row()],2),inbox([row({adminUrl:'/inbox?notice=one'})]), ...['https://example.com','//example.com','/\\example.com','/bad\nurl'].map(adminUrl=>inbox([row({adminUrl})]))]) {
    assert.equal(approvalPath(data,true),'/inbox?filter=approval');
  }
});
