import {beforeEach,expect,jest,test} from '@jest/globals'
jest.mock('../src/config/env',()=>({config:{jwt:{secret:'synthetic-test-only'}}}))
jest.mock('../src/config/database',()=>({__esModule:true,default:{}}))
jest.mock('../src/services/OrderService',()=>({getOrders:jest.fn()}))
import {orderRouter} from '../src/routes/order'
import {getOrders} from '../src/services/OrderService'
const get=getOrders as any
async function invoke(path:string,query:any={},role='manager'){
 const req:any={path,query,params:{},body:{},user:{id:'u',storeId:'a',role},headers:{}}
 const res:any={statusCode:200,status(n:number){this.statusCode=n;return this},json(data:any){this.data=data;return this}}
 const layer=(orderRouter as any).stack.find((l:any)=>l.route?.path===path && l.route.methods.get)
 for(const entry of layer.route.stack){let next=false;await entry.handle(req,res,()=>{next=true});if(!next)break}
 return res
}
beforeEach(()=>{jest.clearAllMocks();get.mockResolvedValue({list:[],pagination:{total:0}})})
test('export fetches all rows independently of list pagination',async()=>{
 get.mockResolvedValue({list:Array.from({length:125},(_,i)=>({id:String(i)}))})
 const r=await invoke('/export-data',{page:'2',pageSize:'100',productName:'Tea'})
 expect(r.data.data.list).toHaveLength(125);expect(get.mock.calls[0][0]).toMatchObject({storeId:'a',page:1,pageSize:10001,productName:'Tea'})
})
test('over-limit export refuses instead of silently truncating',async()=>{get.mockResolvedValue({list:Array.from({length:10001})});expect((await invoke('/export-data')).statusCode).toBe(400)})
test.each([{startDate:'bad'},{startDate:'2026-10-13T00:00:00Z',endDate:'2026-10-12T00:00:00Z'},{pageSize:'10001'},{page:'0'}])('rejects invalid filters %j',async(query)=>{expect((await invoke('/',query)).statusCode).toBe(400);expect(get).not.toHaveBeenCalled()})
test('foreign-store manager is rejected before querying',async()=>{expect((await invoke('/export-data',{storeId:'b'})).statusCode).toBe(403);expect(get).not.toHaveBeenCalled()})
test('cashier cannot export',async()=>{expect((await invoke('/export-data',{},'cashier')).statusCode).toBe(403);expect(get).not.toHaveBeenCalled()})
test('legacy date-only callers use the complete WIB day',async()=>{await invoke('/',{startDate:'2026-10-12',endDate:'2026-10-12'});expect(get.mock.calls[0][0]).toMatchObject({startDate:'2026-10-12T00:00:00+07:00',endDate:'2026-10-12T23:59:59.999+07:00'})})
