const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true}}).outputText, file);
const {STAFF_BASIC_PERMISSIONS, canUseStaffPermission} = require(root + '/shared/StaffBasicAccess.ts');
assert.deepEqual(STAFF_BASIC_PERMISSIONS, require(root + '/server/src/services/StaffPermissionCatalog.ts').STAFF_BASIC_PERMISSIONS);
const {effectiveAccess, redactAccessData, validatePolicyV2} = require(root + '/server/src/services/StaffPermissionV2Core.ts');
const denials = Object.fromEntries(STAFF_BASIC_PERMISSIONS.map(key => [key, 'deny']));
const policy = {version: 2, revision: 3, active: true, roles: [{id: 'restricted', name: 'Restricted', description: '', permissions: {...denials, 'finance.read': 'allow'}}], assignments: [{staffId: 'employee', roleId: 'restricted', overrides: denials}]};
test('old role and override denials retain all self-service, without granting management', () => {
  const access = effectiveAccess(policy, 'employee');
  for (const key of STAFF_BASIC_PERMISSIONS) {assert.equal(access.modes[key], 'allow'); assert.equal(access.sources[key], 'basic'); assert.ok(access.permissions.includes(key));}
  assert.equal(access.modes['finance.read'], 'allow');
  for (const key of ['salary.read', 'staff.write', 'inventory.read', 'salary.pay']) assert.equal(access.modes[key], 'deny');
  const {active, ...input} = policy; assert.doesNotThrow(() => validatePolicyV2(input));
  const record = {baseSalary: 123, bankAccount: 'private', address: 'private'};
  assert.deepEqual(redactAccessData(record, access, false), {});
  assert.deepEqual(redactAccessData(record, access, true), record);
});
test('missing role or assignment retains basic access', () => {
  for (const key of STAFF_BASIC_PERMISSIONS) assert.equal(effectiveAccess({...policy, roles: []}, 'new-employee').modes[key], 'allow');
});
test('frontend keeps basics during load/failure and legacy denial; extra access stays closed', () => {
  for (const role of [null, {version: 2, modes: denials}, {permissions: []}]) {
    for (const ready of [true, false]) {
      for (const key of STAFF_BASIC_PERMISSIONS) assert.equal(canUseStaffPermission(key, ready, role), true);
      if (!ready || role) assert.equal(canUseStaffPermission('inventory.read', ready, role), false);
    }
  }
  assert.equal(canUseStaffPermission('orders.refund', true, {version: 2, modes: {'orders.refund': 'approval'}}), false);
  assert.equal(canUseStaffPermission('orders.refund', true, {version: 2, modes: {'orders.refund': 'approval'}}, true), true);
});
