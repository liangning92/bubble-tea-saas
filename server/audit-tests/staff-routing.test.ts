import {beforeEach,expect,jest,test} from '@jest/globals'
jest.mock('../src/config/database',()=>({__esModule:true,default:{order:{findMany:jest.fn(async()=>[])},staff:{findMany:jest.fn(async()=>[])},training:{findMany:jest.fn(async()=>[])}}}))
jest.mock('../src/config/env',()=>({config:{jwt:{secret:'synthetic-test-only'}}}))
jest.mock('../src/services/StaffManagementService',()=>({getTrainingRecords:jest.fn()}))
import {staffManagementRouter} from '../src/routes/staffManagement'
import prisma from '../src/config/database'
beforeEach(()=>jest.clearAllMocks())
test('/training/all resolves to the privileged list route rather than staffId=all',()=>{
 const first=(staffManagementRouter as any).stack.find((l:any)=>l.route?.methods.get && l.match('/training/all'))
 expect(first.route.path).toBe('/training/all')
})
test('staff sales endpoint works without global prisma',async()=>{
 const layer=(staffManagementRouter as any).stack.find((l:any)=>l.route?.path==='/sales-stats')
 const req:any={query:{month:'10',year:'2026'},params:{},body:{},user:{id:'u',role:'manager',storeId:'a'}}
 const res:any={statusCode:200,status(n:number){this.statusCode=n;return this},json(d:any){this.data=d;return this}}
 for(const entry of layer.route.stack){let next=false;await entry.handle(req,res,()=>{next=true});if(!next)break}
 expect(res.statusCode).toBe(200)
 expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({storeId:'a'})}))
})
