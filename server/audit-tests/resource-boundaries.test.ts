import { beforeEach,expect,jest,test } from '@jest/globals'
jest.mock('../src/config/database',()=>({__esModule:true,default:{
 product:{findUnique:jest.fn(),findMany:jest.fn()},inventory:{findUnique:jest.fn()},
 member:{findUnique:jest.fn(),findFirst:jest.fn(),update:jest.fn(),delete:jest.fn()},
 staff:{findUnique:jest.fn(),findFirst:jest.fn(async()=>null)},training:{findUnique:jest.fn(),findFirst:jest.fn(async()=>null),delete:jest.fn()},
 pointLog:{findMany:jest.fn(async()=>[]),create:jest.fn()}
}}))
jest.mock('../src/config/env',()=>({config:{jwt:{secret:'synthetic-test-only'}}}))
jest.mock('../src/services/ProductService',()=>({getProductById:jest.fn(async()=>({storeId:'b'})),getProductCostDetail:jest.fn(async()=>({storeId:'b'})),updateProduct:jest.fn(),batchUpdateStatus:jest.fn(),updateProductBom:jest.fn()}))
jest.mock('../src/services/InventoryService',()=>({getInventoryById:jest.fn(async()=>({storeId:'b'})),adjustInventory:jest.fn(),updateInventory:jest.fn()}))
jest.mock('../src/services/StaffManagementService',()=>({getTrainingRecords:jest.fn(),updateTrainingRecord:jest.fn(),addTrainingRecord:jest.fn()}))
jest.mock('../src/services/MarketingAutomationService',()=>({}))
jest.mock('../src/services/MessageService',()=>({sendMessageToMember:jest.fn()}))
import prisma from '../src/config/database'
import {productRouter} from '../src/routes/product'
import {inventoryRouter} from '../src/routes/inventory'
import {memberRouter} from '../src/routes/member'
import {staffManagementRouter} from '../src/routes/staffManagement'
import * as Products from '../src/services/ProductService'
import * as Inventory from '../src/services/InventoryService'
import * as Staff from '../src/services/StaffManagementService'
const db=prisma as any
const routers:any={product:productRouter,inventory:inventoryRouter,member:memberRouter,staff:staffManagementRouter}
beforeEach(()=>{
 jest.clearAllMocks()
 for(const model of ['product','inventory','member','staff','training'])db[model].findUnique.mockResolvedValue({id:'foreign',storeId:'b',points:1000,_count:{orders:0}})
 db.member.findFirst.mockResolvedValue(null)
 db.product.findMany.mockResolvedValue([{id:'foreign',storeId:'b'}])
})
test.each([
 ['product','get','/:id',{}],['product','get','/:id/cost',{}],['product','put','/:id',{}],['product','put','/:id/bom',{bomItems:[]}],['product','post','/batch-status',{productIds:['foreign'],status:'active'}],
 ['inventory','get','/:id',{}],['inventory','put','/:id/adjust',{newStock:10,reason:'test'}],['inventory','put','/:id',{}],
 ['member','get','/phone/:phone',{}],['member','put','/:id',{name:'test'}],['member','post','/:id/redeem',{points:10}],['member','get','/:id/points-history',{}],['member','post','/:id/adjust-points',{points:10}],
 ['staff','get','/training/:staffId',{}],['staff','put','/training/:id',{}],['staff','delete','/training/:id',{}],['staff','post','/training',{staffId:'foreign'}]
])('%s %s %s rejects foreign objects before mutations',async(module,method,path,body)=>{
 const layer=routers[module as string].stack.find((l:any)=>l.route?.path===path && l.route.methods[method as string])
 const req:any={params:{id:'foreign',staffId:'foreign',phone:'08123456789'},query:{},body,headers:{},user:{id:'u',role:'manager',storeId:'a',staffId:'s'}}
 const res:any={statusCode:200,status(n:number){this.statusCode=n;return this},json(d:any){this.data=d;return this}}
 for(const entry of layer.route.stack){let next=false;await entry.handle(req,res,()=>{next=true});if(!next)break}
 expect([403,404]).toContain(res.statusCode)
 for(const fn of [Products.updateProduct,Products.batchUpdateStatus,Products.updateProductBom,Inventory.adjustInventory,Inventory.updateInventory,Staff.updateTrainingRecord,Staff.addTrainingRecord,db.training.delete,db.member.update,db.pointLog.create])expect(fn).not.toHaveBeenCalled()
})
