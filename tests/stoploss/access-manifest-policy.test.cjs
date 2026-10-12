const {test}=require('node:test'),assert=require('node:assert/strict');
const {preserveReviewedPolicies}=require('./access-manifest-policy.cjs');
test('regeneration cannot broaden administrator-only access or change reviewed scope',()=>{
 const reviewed={'PUT /api/staff-permissions/pin':{permission:'owner.only',ownerOnly:true,legacyRoles:['admin'],resource:null}};
 const discovered={'PUT /api/staff-permissions/pin':{permission:'staff.write',ownerOnly:false,legacyRoles:['admin','staff']},'POST /api/orders/:id/void':{permission:'orders.refund.approve',ownerOnly:false,resource:{model:'order',param:'id'}}};
 const result=preserveReviewedPolicies(discovered,reviewed);
 assert.deepEqual(result['PUT /api/staff-permissions/pin'],reviewed['PUT /api/staff-permissions/pin']);
 assert.equal(result['POST /api/orders/:id/void'].permission,'orders.refund.approve');
 assert.deepEqual(discovered['PUT /api/staff-permissions/pin'].legacyRoles,['admin','staff']);
});
test('reviewed declarations do not resurrect removed routes',()=>{
 assert.deepEqual(preserveReviewedPolicies({}, {'POST /api/removed':{permission:'orders.create'}}),{});
});
