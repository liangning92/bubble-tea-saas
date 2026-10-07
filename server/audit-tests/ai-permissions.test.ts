import {beforeEach,expect,jest,test} from '@jest/globals'
jest.mock('../src/config/database',()=>({__esModule:true,default:{config:{findUnique:jest.fn(),upsert:jest.fn()},financeAuditLog:{create:jest.fn()},$transaction:jest.fn()}}))
import prisma from '../src/config/database'
import {defaultAiPolicy,getAiPolicy,saveAiPolicy,rejectAiExecution} from '../src/services/AiPermissionService'
const db=prisma as any;const admin={id:'admin-a',storeId:'a',role:'admin'}
beforeEach(()=>{jest.clearAllMocks();db.config.findUnique.mockResolvedValue(null);db.$transaction.mockImplementation(async(fn:any)=>fn(db));db.config.upsert.mockImplementation(async({create}:any)=>({...create,id:'policy'}))})
test('defaults deny all access and writes without a model',async()=>{expect(await getAiPolicy(admin,'a')).toEqual(defaultAiPolicy());expect(defaultAiPolicy().executionEnabled).toBe(false)})
test.each(['cashier','staff','manager'])('%s cannot read or save AI permissions',async role=>{await expect(getAiPolicy({...admin,role},'a')).rejects.toThrow('AI_POLICY_ACCESS_DENIED');await expect(saveAiPolicy({...admin,role},'a',defaultAiPolicy())).rejects.toThrow('AI_POLICY_ACCESS_DENIED');expect(db.config.upsert).not.toHaveBeenCalled()})
test('even admin cannot read or change another store',async()=>{await expect(getAiPolicy(admin,'b')).rejects.toThrow('AI_POLICY_ACCESS_DENIED');await expect(saveAiPolicy(admin,'b',defaultAiPolicy())).rejects.toThrow('AI_POLICY_ACCESS_DENIED')})
test('saved future permissions reload but never enable execution',async()=>{
 const draft={...defaultAiPolicy(),read:{sales:true,inventory:false},actions:{refund:'approval',purchase:'automatic',price:'deny'}}
 expect(await saveAiPolicy(admin,'a',draft)).toEqual(draft)
 db.config.findUnique.mockResolvedValue({value:JSON.stringify(draft)})
 expect(await getAiPolicy(admin,'a')).toEqual(draft)
 expect(db.financeAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({storeId:'a',userId:'admin-a'})}))
 expect(()=>rejectAiExecution()).toThrow('AI_EXECUTION_NOT_AVAILABLE')
})
test('client cannot enable real execution or add an unknown authority',async()=>{
 await expect(saveAiPolicy(admin,'a',{...defaultAiPolicy(),executionEnabled:true})).rejects.toThrow()
 await expect(saveAiPolicy(admin,'a',{...defaultAiPolicy(),shell:true})).rejects.toThrow()
 expect(db.config.upsert).not.toHaveBeenCalled()
})
