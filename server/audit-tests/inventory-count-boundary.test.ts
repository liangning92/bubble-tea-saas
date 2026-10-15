import {beforeEach,expect,jest,test} from '@jest/globals'
jest.mock('../src/config/env',()=>({config:{jwt:{secret:'synthetic'}}}))
jest.mock('../src/config/database',()=>({__esModule:true,default:{config:{findMany:jest.fn(async()=>[]),findUnique:jest.fn(),upsert:jest.fn(),delete:jest.fn()},$transaction:jest.fn()}}))
jest.mock('../src/services/InventoryCountService',()=>({getInventoryCounts:jest.fn(async()=>[{items:[{inventory:{avgCost:900,unit:'kg'},varianceAmountEstimate:500}]}]),getInventoryCountById:jest.fn(),createInventoryCount:jest.fn(),updateCountItems:jest.fn(async()=>[]),updateCountItem:jest.fn(async()=>({})),submitInventoryCount:jest.fn(async()=>({items:[]})),completeInventoryCount:jest.fn(),cancelInventoryCount:jest.fn()}))
jest.mock('../src/services/InventoryAlertConfigService',()=>({saveInventoryAlertConfig:jest.fn(async()=>({autoCheckIntervalHours:6})),getInventoryAlertConfig:jest.fn(),DEFAULT_INVENTORY_ALERT_CONFIG:{}}))
import {inventoryCountRouter} from '../src/routes/inventoryCount'
import {inventoryRouter} from '../src/routes/inventory'
import {configRouter} from '../src/routes/config'
import * as service from '../src/services/InventoryCountService'
import {saveInventoryAlertConfig} from '../src/services/InventoryAlertConfigService'
import prisma from '../src/config/database'
async function call(router:any,method:string,path:string,role='staff',body:any={},params:any={id:'count',itemId:'item',storeId:'a',key:'inventoryCountObservation.item'}){
 const route=router.stack.find((l:any)=>l.route?.path===path&&l.route.methods[method]).route
 const req:any={body,params,user:{id:'user',staffId:'actual-staff',storeId:'a',role},headers:{},query:{}}
 const res:any={statusCode:200,status(n:number){this.statusCode=n;return this},json(data:unknown){this.data=data;return this}}
 for(const layer of route.stack){let next=false;await layer.handle(req,res,()=>{next=true});if(!next)break}return res
}
beforeEach(()=>jest.clearAllMocks())
test('staff can create and observe counts with server identity but cannot approve or cancel',async()=>{
 const body={countedQty:9,countedBy:'spoof',expectedStock:10,observedVersion:'2026-01-01T00:00:00.000Z',note:'physical'}
 expect((await call(inventoryCountRouter,'put','/:id/item/:itemId','staff',body)).statusCode).toBe(200)
 expect(service.updateCountItem).toHaveBeenCalledWith('item',9,'actual-staff','physical',{countId:'count',storeId:'a',expectedStock:10,observedVersion:body.observedVersion})
 expect((await call(inventoryCountRouter,'post','/','staff',{storeId:'a',period:'ad_hoc',startDate:'2026-10-13',endDate:'2026-10-13'})).statusCode).toBe(201)
 for(const path of ['/:id/complete','/:id/cancel'])expect((await call(inventoryCountRouter,'post',path)).statusCode).toBe(403)
 expect(service.completeInventoryCount).not.toHaveBeenCalled()
})
test('staff list hides carrying costs and administrator cannot create a foreign store session',async()=>{
 const res=await call(inventoryCountRouter,'get','/');expect(res.data.data.list[0].inventory).toBeUndefined();expect(res.data.data.list[0].items[0].inventory.avgCost).toBeUndefined();expect(res.data.data.list[0].items[0].varianceAmountEstimate).toBeUndefined()
 expect((await call(inventoryCountRouter,'post','/','admin',{storeId:'b',period:'monthly',startDate:'2026-01-01',endDate:'2026-01-31'})).statusCode).toBe(403);expect(service.createInventoryCount).not.toHaveBeenCalled()
})
test('alert configuration literal route precedes generic inventory update and uses authenticated store',async()=>{
 const puts=(inventoryRouter as any).stack.filter((l:any)=>l.route?.methods.put).map((l:any)=>l.route.path)
 expect(puts.indexOf('/alert-config')).toBeLessThan(puts.indexOf('/:id'))
 expect((await call(inventoryRouter,'put','/alert-config','manager',{autoCheckIntervalHours:6})).statusCode).toBe(200)
 expect(saveInventoryAlertConfig).toHaveBeenCalledWith('a',{autoCheckIntervalHours:6})
})
test.each([['get','/:storeId/:key',{}],['delete','/:storeId/:key',{}],['post','/',{storeId:'a',key:'inventoryCountObservation.item',value:{version:1},category:'inventory'}],['post','/batch',{storeId:'a',configs:[{key:'inventoryCountObservation.item',value:{version:1},category:'inventory'}]}]])('generic config %s %s cannot forge count observation evidence',async(method,path,body)=>{
 expect((await call(configRouter,method as string,path as string,'admin',body)).statusCode).toBe(403);expect(prisma.config.upsert).not.toHaveBeenCalled();expect(prisma.config.delete).not.toHaveBeenCalled()
})

test('batch observation uses authenticated identity and validates each quantity and revision',async()=>{
 const item={itemId:'item',countedQty:0,expectedStock:10,observedVersion:'2026-01-01T00:00:00.000Z',note:''}
 expect((await call(inventoryCountRouter,'put','/:id/items','staff',{items:[item],countedBy:'spoof'})).statusCode).toBe(200)
 expect(service.updateCountItems).toHaveBeenCalledWith('count','a','actual-staff',[item])
 for(const items of [[],[{...item,countedQty:-1}],[{...item,observedVersion:'bad'}]])expect((await call(inventoryCountRouter,'put','/:id/items','staff',{items})).statusCode).toBe(400)
})

test('combined submit validates observations and records the authenticated actor',async()=>{
 const row={itemId:'item',countedQty:0,expectedStock:10,observedVersion:'2026-01-01T00:00:00.000Z'}
 expect((await call(inventoryCountRouter,'post','/:id/submit','staff',{items:[row],countedBy:'spoof'})).statusCode).toBe(200)
 expect(service.submitInventoryCount).toHaveBeenCalledWith('count','a','actual-staff',[row])
 for(const items of [[{...row,countedQty:-1}],[{...row,observedVersion:'bad'}]])expect((await call(inventoryCountRouter,'post','/:id/submit','staff',{items})).statusCode).toBe(400)
})
