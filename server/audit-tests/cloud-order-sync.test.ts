import {beforeEach,expect,jest,test} from '@jest/globals'
const mockDb:any={order:{findUnique:jest.fn(),upsert:jest.fn(),create:jest.fn()},orderItem:{deleteMany:jest.fn(async()=>({count:0}))},$transaction:jest.fn()}
jest.mock('@prisma/client',()=>({PrismaClient:jest.fn(()=>mockDb)}))
jest.mock('../src/config/database',()=>({__esModule:true,default:mockDb}))
jest.mock('../src/config/env',()=>({config:{jwt:{secret:'synthetic-test-only'}}}))
import router from '../src/routes/sync'
const order=()=>({id:'o',storeId:'a',orderNumber:'ORD1',staffId:'s',paymentMethod:'cash',status:'completed',totalAmount:100,discountAmount:0,finalAmount:111,items:[{productId:'p',productName:'Tea',specId:'s',specName:'R',quantity:1,unitPrice:100,addons:'[]',bomCost:0}]})
async function invoke(body:any){
 const route=(router as any).stack.find((l:any)=>l.route?.path==='/order')
 const req:any={body:{order:body},params:{},query:{},headers:{},user:{id:'u',role:'manager',storeId:'a'}}
 const res:any={statusCode:200,status(n:number){this.statusCode=n;return this},json(d:any){this.data=d;return this}}
 for(const entry of route.route.stack){let next=false;await entry.handle(req,res,()=>{next=true});if(!next)break}
 return res
}
beforeEach(()=>{jest.clearAllMocks();mockDb.order.findUnique.mockResolvedValue(null);mockDb.$transaction.mockImplementation(async(fn:any)=>fn(mockDb))})
test('foreign existing id cannot be overwritten with caller storeId',async()=>{
 mockDb.order.findUnique.mockResolvedValue({...order(),storeId:'b'})
 expect((await invoke(order())).statusCode).toBe(403)
 expect(mockDb.orderItem.deleteMany).not.toHaveBeenCalled();expect(mockDb.order.upsert).not.toHaveBeenCalled()
})
test('identical retry is an acknowledged no-op',async()=>{
 mockDb.order.findUnique.mockResolvedValue(order())
 expect((await invoke(order())).statusCode).toBe(200)
 expect(mockDb.orderItem.deleteMany).not.toHaveBeenCalled();expect(mockDb.order.upsert).not.toHaveBeenCalled();expect(mockDb.order.create).not.toHaveBeenCalled()
})
test('stale completed snapshot cannot resurrect a refunded order',async()=>{
 mockDb.order.findUnique.mockResolvedValue({...order(),status:'refunded'})
 expect((await invoke(order())).statusCode).toBe(409)
 expect(mockDb.orderItem.deleteMany).not.toHaveBeenCalled();expect(mockDb.order.upsert).not.toHaveBeenCalled()
})
test('modified item retry is a conflict, not an update',async()=>{
 mockDb.order.findUnique.mockResolvedValue(order())
 const changed=order();changed.items[0].quantity=2
 expect((await invoke(changed)).statusCode).toBe(409)
 expect(mockDb.order.upsert).not.toHaveBeenCalled()
})
test('new snapshot uses insert rather than an overwrite-capable upsert',async()=>{
 expect((await invoke(order())).statusCode).toBe(200)
 expect(mockDb.order.create).toHaveBeenCalledTimes(1);expect(mockDb.order.upsert).not.toHaveBeenCalled();expect(mockDb.orderItem.deleteMany).not.toHaveBeenCalled()
})
