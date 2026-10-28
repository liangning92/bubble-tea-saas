/* Real policy/lease execution, synthetic sends only. No model, production data or network. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const policy = require(process.env.NATIVE_RUNTIME_POLICY_MODULE || path.resolve(__dirname, '../../server/dist/services/teamAgentBridge/nativeRuntimePolicy.js'));
const {stableNativeMemoryNamespace, deriveNativeChildContext, assertNativeChildContext, assertNativeContextIsolation, assertNativeDelivery, NativeProviderCallPool, getSharedNativeProviderCallPool} = policy;
const identity = (patch={}) => ({storeId:'store-a',agentId:'existing-hermes',channelId:'channel-a',audience:[{staffId:'staff-a',userId:'user-a',role:'staff',permissions:['personal.messages','inventory.read']}],permissionPolicy:{version:4,modes:{'inventory.read':'allow','finance.read':'deny'}},...patch});
const context = (patch={}) => {const id=randomUUID();return {executionId:id,rootExecutionId:id,storeId:'store-a',agentId:'existing-hermes',channelId:'channel-a',audienceHash:'a'.repeat(64),authorityFingerprint:'b'.repeat(64),memoryNamespace:stableNativeMemoryNamespace(identity()),providerBinding:{subscriptionId:'existing-minimax-subscription',model:'MiniMax-M3.1-Flash',endpoint:'https://existing-provider.example/v1',credentialRef:'backend-existing-connection'},delivery:'channel',...patch};};
const acquire = (pool,executionId=randomUUID(),extra={}) => pool.acquire({executionId,subscriptionId:pool.subscriptionId,...extra});
const deferred = () => {let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

test('memory persists across task/execution changes but is isolated by conversation, audience and current account policy',()=>{
 const original=identity(), baseline=stableNativeMemoryNamespace(original);
 assert.equal(stableNativeMemoryNamespace({...original,taskId:randomUUID(),taskVersion:9,executionId:randomUUID()}),baseline);
 assert.equal(stableNativeMemoryNamespace({...original,audience:[{...original.audience[0],permissions:['inventory.read','personal.messages','inventory.read']}]}),baseline);
 for(const changed of [identity({channelId:'channel-b'}),identity({storeId:'store-b'}),identity({agentId:'another-agent'}),identity({audience:[{...original.audience[0],userId:'another-user'}]}),identity({audience:[{...original.audience[0],role:'admin'}]}),identity({audience:[{...original.audience[0],permissions:['personal.messages']}]}),identity({permissionPolicy:{version:5,modes:{'inventory.read':'allow','finance.read':'deny'}}})])assert.notEqual(stableNativeMemoryNamespace(changed),baseline);
 const two=identity({audience:[...original.audience,{staffId:'staff-b',userId:'user-b',role:'staff',permissions:['personal.messages']}]});
 assert.equal(stableNativeMemoryNamespace(two),stableNativeMemoryNamespace({...two,audience:[...two.audience].reverse()}));
 assert.throws(()=>stableNativeMemoryNamespace(identity({channelId:''})),/NATIVE_MEMORY_IDENTITY_REQUIRED/);
 assert.throws(()=>stableNativeMemoryNamespace(identity({audience:[...original.audience,...original.audience]})),/NATIVE_MEMORY_DUPLICATE_AUDIENCE/);
});

test('child inherits exact operator authority and route; model-supplied overrides cannot change them',()=>{
 const parent=context(), input={executionId:randomUUID(),parentToolCallId:'actual-recorded-call-1'}, child=deriveNativeChildContext(parent,input);
 assertNativeChildContext(parent,child); assert.equal(child.parentExecutionId,parent.executionId);assert.equal(child.rootExecutionId,parent.executionId);assert.equal(child.delivery,'parent_only');assert.deepEqual(child.providerBinding,parent.providerBinding);
 const grandchild=deriveNativeChildContext(child,{executionId:randomUUID(),parentToolCallId:'actual-recorded-call-2'});assertNativeChildContext(child,grandchild);assert.equal(grandchild.rootExecutionId,parent.executionId);
 for(const override of [{storeId:'store-b'},{model:'paid-model'},{endpoint:'https://another.example'},{credentialRef:'new-secret'},{delivery:'channel'}])assert.throws(()=>deriveNativeChildContext(parent,{...input,...override}),/NATIVE_CHILD_DERIVATION_DENIED/);
 assert.throws(()=>deriveNativeChildContext(parent,{...input,executionId:parent.executionId}),/NATIVE_CHILD_DERIVATION_DENIED/);
 const forged={...child,providerBinding:{...child.providerBinding,model:'paid-model'}};assert.throws(()=>assertNativeChildContext(parent,forged),/NATIVE_CONTEXT_SCOPE_CHANGED/);
 assert.equal(parent.delivery,'channel');assert.equal(parent.parentExecutionId,undefined);
});

test('child completion stays with its parent, even when it knows the employee channel',()=>{
 const parent=context(), child=deriveNativeChildContext(parent,{executionId:randomUUID(),parentToolCallId:'delegate-1'});
 assertNativeDelivery(child,{destination:'parent',id:parent.executionId});
 assert.throws(()=>assertNativeDelivery(child,{destination:'channel',id:parent.channelId,audienceHash:parent.audienceHash}),/NATIVE_CHILD_PUBLICATION_DENIED/);
 assert.throws(()=>assertNativeDelivery(child,{destination:'parent',id:randomUUID()}),/NATIVE_CHILD_PUBLICATION_DENIED/);
 assertNativeDelivery(parent,{destination:'channel',id:parent.channelId,audienceHash:parent.audienceHash});
 assert.throws(()=>assertNativeDelivery(parent,{destination:'channel',id:parent.channelId,audienceHash:'c'.repeat(64)}),/NATIVE_OUTPUT_AUDIENCE_CHANGED/);
});

test('interleaved conversations cannot exchange a context or child result',()=>{
 const a=context(), b=context({channelId:'channel-b',memoryNamespace:stableNativeMemoryNamespace(identity({channelId:'channel-b'}))});
 const child=deriveNativeChildContext(a,{executionId:randomUUID(),parentToolCallId:'delegate-a'});
 assert.throws(()=>assertNativeContextIsolation(a,b),/NATIVE_CONTEXT_SCOPE_CHANGED/);
 assert.throws(()=>assertNativeChildContext(b,child),/NATIVE_CONTEXT_SCOPE_CHANGED/);
 assert.throws(()=>assertNativeDelivery(child,{destination:'parent',id:b.executionId}),/NATIVE_CHILD_PUBLICATION_DENIED/);
 assert.throws(()=>deriveNativeChildContext(context({providerBinding:{...a.providerBinding,endpoint:'https://secret@another.example/?key=secret'}}),{executionId:randomUUID(),parentToolCallId:'d'}),/NATIVE_PROVIDER_ENDPOINT_INVALID/);
});

test('two actual provider sends run concurrently; waiting parent holds no permit and third send waits',async()=>{
 const pool=new NativeProviderCallPool('owned-subscription',2);pool.setBudget({state:'available',remainingCalls:6});
 let active=0,maximum=0;
 await pool.withLease({executionId:randomUUID(),subscriptionId:pool.subscriptionId},async()=>{active++;maximum=Math.max(active,maximum);active--;});
 assert.equal(pool.snapshot().active,0);
 const release=deferred();
 const work=()=>pool.withLease({executionId:randomUUID(),subscriptionId:pool.subscriptionId},async()=>{active++;maximum=Math.max(maximum,active);await release.promise;active--;return 'actual synthetic response';});
 const first=work(),second=work(),third=work();
 await Promise.resolve();assert.equal(pool.snapshot().active,2);assert.equal(pool.snapshot().queued,1);assert.equal(active,2);
 release.resolve();assert.deepEqual(await Promise.all([first,second,third]),['actual synthetic response','actual synthetic response','actual synthetic response']);
 assert.equal(maximum,2);assert.equal(pool.snapshot().active,0);assert.equal(pool.snapshot().queued,0);assert.equal(pool.snapshot().admittedCalls,4);
});

test('unknown/exhausted quota blocks sends, unknown outcomes consume their reservation, no fallback runs',async()=>{
 const pool=new NativeProviderCallPool('existing-only',1);let sends=0;
 await assert.rejects(()=>pool.withLease({executionId:randomUUID(),subscriptionId:pool.subscriptionId},async()=>++sends),/NATIVE_SUBSCRIPTION_QUOTA_UNKNOWN/);
 pool.setBudget({state:'available',remainingCalls:1});
 await assert.rejects(()=>pool.withLease({executionId:randomUUID(),subscriptionId:pool.subscriptionId},async()=>{sends++;throw Error('synthetic timeout');}),/synthetic timeout/);
 await assert.rejects(()=>acquire(pool),/NATIVE_SUBSCRIPTION_QUOTA_EXHAUSTED/);
 assert.equal(sends,1);assert.equal(pool.snapshot().unknownCalls,1);assert.equal(pool.snapshot().active,0);
 await assert.rejects(()=>pool.acquire({executionId:randomUUID(),subscriptionId:'another-paid-subscription'}),/NATIVE_PROVIDER_SUBSCRIPTION_CHANGED/);
});

test('revoked quota rejects queued work without cancelling a known in-flight response or granting a replacement',async()=>{
 const pool=new NativeProviderCallPool('existing-only',1);pool.setBudget({state:'available',remainingCalls:5});
 const running=await acquire(pool), pending=assert.rejects(()=>acquire(pool),/NATIVE_SUBSCRIPTION_QUOTA_UNKNOWN/);
 assert.equal(pool.snapshot().queued,1);pool.setBudget({state:'unknown'});await pending;
 assert.equal(pool.snapshot().active,1);running.release('complete');running.release('complete');assert.equal(pool.snapshot().active,0);
 assert.equal(pool.snapshot().admittedCalls,1);await assert.rejects(()=>acquire(pool),/NATIVE_SUBSCRIPTION_QUOTA_UNKNOWN/);
});

test('queued cancellation and deadline release only their own waiting positions',async()=>{
 const pool=new NativeProviderCallPool('existing-only',1);pool.setBudget({state:'available',remainingCalls:5});
 const running=await acquire(pool), controller=new AbortController();
 const cancelled=assert.rejects(()=>acquire(pool,randomUUID(),{signal:controller.signal}),/NATIVE_PROVIDER_CALL_ABORTED/);
 controller.abort();await cancelled;assert.equal(pool.snapshot().queued,0);
 await assert.rejects(()=>acquire(pool,randomUUID(),{deadlineAt:Date.now()+15}),/NATIVE_PROVIDER_CALL_DEADLINE/);
 assert.equal(pool.snapshot().active,1);assert.equal(pool.snapshot().queued,0);assert.equal(pool.snapshot().admittedCalls,1);running.release();
});

test('all local transports share the same subscription pool; conflicting capacity cannot create extra slots',()=>{
 const id='shared-fixture-'+randomUUID(), first=getSharedNativeProviderCallPool(id,2), second=getSharedNativeProviderCallPool(id,2);
 assert.equal(first,second);assert.throws(()=>getSharedNativeProviderCallPool(id,3),/NATIVE_PROVIDER_POOL_CAPACITY_CONFLICT/);
});
