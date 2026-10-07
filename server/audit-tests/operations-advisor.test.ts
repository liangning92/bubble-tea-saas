import {expect,jest,test} from '@jest/globals'
import {requestStoreAdvice,AdviceRequest} from '../src/contracts/StoreOperationsAdvisor'
const context={actorId:'staff-a',authorizedStoreIds:['a']}
const request:AdviceRequest={requestId:'audit-request',storeId:'a',intent:'advise',question:'Summarize synthetic stock',evidence:[]}
test('no configured model yields unavailable without affecting POS',async()=>{
 expect(await requestStoreAdvice(context,request)).toMatchObject({status:'unavailable',reason:'no_provider',actorId:'staff-a'})
})
test.each(['request','evidence'])('foreign-store %s is denied before a provider is invoked',async kind=>{
 const provider={suggest:jest.fn(async()=> 'never')}
 const foreign=kind==='request'?{...request,storeId:'b'}:{...request,evidence:[{storeId:'b',sourceId:'test',observedAt:'2026-10-05',source:'application_record' as const,verification:'unverified' as const,summary:'synthetic'}]}
 expect(await requestStoreAdvice(context,foreign,provider)).toMatchObject({status:'denied',reason:'scope'})
 expect(provider.suggest).not.toHaveBeenCalled()
})
test('a runtime write request cannot invoke the model or execute an operation',async()=>{
 const provider={suggest:jest.fn(async()=> 'never')}
 const input=JSON.parse(JSON.stringify({...request,intent:'refund'}))
 expect(await requestStoreAdvice(context,input,provider)).toMatchObject({status:'denied',reason:'write_not_enabled'})
 expect(provider.suggest).not.toHaveBeenCalled()
})
test('customer screenshot cannot be labeled provider-verified',async()=>{
 const result=await requestStoreAdvice(context,{...request,evidence:[{storeId:'a',sourceId:'synthetic',observedAt:'2026-10-05',source:'customer_payment_screenshot',verification:'provider_verified',summary:'synthetic only'}]})
 expect(result).toMatchObject({status:'denied',reason:'invalid_evidence'})
})
test('provider failure is advisory unavailability and preserves audit identity',async()=>{
 expect(await requestStoreAdvice(context,request,{suggest:async()=>{throw new Error('synthetic')}})).toMatchObject({status:'unavailable',reason:'provider_failure',requestId:'audit-request'})
})
