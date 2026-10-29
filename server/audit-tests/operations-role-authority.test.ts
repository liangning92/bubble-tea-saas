import {test,expect} from '@jest/globals'
import {audienceAllows,visibleBusinessData} from '../src/services/teamAgentBridge/employeeAccess'
import {bindNativeBackendAgent,bindNativeBackendPublication,assertNativeBackendPublication} from '../src/services/ManagementBackendIdentity'
function fixture(){return {staff:{findMany:async()=>[{id:'owner',user:{id:'owner-user',storeId:'store',role:'admin'}},{id:'employee',user:{id:'employee-user',storeId:'store',role:'staff'}}]},config:{findUnique:async()=>null}}}
const scope:any={requesterStaffId:'owner',audienceStaffIds:['owner','employee'],channelId:'room'}
test('an owner in a mixed audience does not lend private data access to an employee',async()=>{
 const db=fixture();expect(await audienceAllows(db,{storeId:'store'},scope,'finance.read')).toBe(false)
 const value=await visibleBusinessData(db,{storeId:'store'},scope,{price:16000,cost:5000,profit:11000,bankAccount:'PRIVATE',password:'SECRET'})
 expect(value).toEqual({price:16000})
})
test('native Agent provenance cannot itself authorize publication',async()=>{
 const actor={},target={channelId:'room',members:[{staffId:'owner',fromSeq:1}]}
 bindNativeBackendAgent(actor,{agentId:'agent',grantVersion:1,clientRevision:1,executionId:'run',name:'Hermes'})
 await expect(assertNativeBackendPublication({},actor,target,{text:'PRIVATE'})).rejects.toThrow('BACKEND_PUBLICATION_CAPABILITY_REQUIRED')
 bindNativeBackendPublication(actor,{check:async(_db,t)=>{if(t.channelId!=='room')throw Error('CONTEXT_CHANGED')}})
 await expect(assertNativeBackendPublication({},actor,target,{text:'Visible here'})).resolves.toBeUndefined()
 await expect(assertNativeBackendPublication({},actor,{...target,channelId:'other'},{text:'PRIVATE'})).rejects.toThrow('CONTEXT_CHANGED')
})
