import {beforeEach,expect,jest,test} from '@jest/globals'
jest.mock('../src/config/database',()=>({__esModule:true,default:{staff:{findUnique:jest.fn()},user:{update:jest.fn()}}}))
jest.mock('../src/config/env',()=>({config:{jwt:{secret:'synthetic-only'}}}))
jest.mock('bcryptjs',()=>({hash:jest.fn(async()=> 'synthetic-hash')}))
import prisma from '../src/config/database'
import {staffRouter} from '../src/routes/staff'
const db=prisma as any
async function invoke(body:any={newPassword:'synthetic-password'},role='admin'){
 const req:any={body,params:{id:'employee-id'},query:{},headers:{},user:{id:'actor',storeId:'store-a',role}}
 const res:any={statusCode:200,status(code:number){this.statusCode=code;return this},json(data:any){this.data=data;return this}}
 const layer=(staffRouter as any).stack.find((l:any)=>l.route?.path==='/:id/reset-password')
 for(const entry of layer.route.stack){let next=false;await entry.handle(req,res,()=>{next=true});if(!next)break}
 return res
}
beforeEach(()=>{jest.clearAllMocks();db.staff.findUnique.mockResolvedValue({id:'employee-id',userId:'account-id',storeId:'store-a',user:{id:'account-id',role:'cashier'}});db.user.update.mockResolvedValue({id:'account-id'})})
test('uses linked account ID rather than employee ID',async()=>{expect((await invoke()).statusCode).toBe(200);expect(db.user.update).toHaveBeenCalledWith({where:{id:'account-id'},data:{password:'synthetic-hash'}})})
test('missing employee returns 404 and performs no password write',async()=>{db.staff.findUnique.mockResolvedValue(null);expect((await invoke()).statusCode).toBe(404);expect(db.user.update).not.toHaveBeenCalled()})
test('manager cannot reset foreign-store password',async()=>{db.staff.findUnique.mockResolvedValue({userId:'account',storeId:'store-b',user:{role:'cashier'}});expect((await invoke(undefined,'manager')).statusCode).toBe(403);expect(db.user.update).not.toHaveBeenCalled()})
test('manager cannot reset administrator password',async()=>{db.staff.findUnique.mockResolvedValue({userId:'account',storeId:'store-a',user:{role:'admin'}});expect((await invoke(undefined,'manager')).statusCode).toBe(403);expect(db.user.update).not.toHaveBeenCalled()})
test.each([null,123,[], 'short','a'.repeat(73),'中'.repeat(25)])('rejects invalid password without writing',async(newPassword)=>{expect((await invoke({newPassword})).statusCode).toBe(400);expect(db.user.update).not.toHaveBeenCalled()})
test('account disappearing returns 404 instead of 500',async()=>{db.user.update.mockRejectedValue({code:'P2025'});expect((await invoke()).statusCode).toBe(404)})
