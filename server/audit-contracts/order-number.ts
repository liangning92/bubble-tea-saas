import {expect,jest,test} from '@jest/globals'
import {randomUUID} from 'crypto'
import {createOrder,generateOrderNumber} from '../src/services/OrderService'
import * as numbers from '../src/utils/orderNumber'
export function orderNumberContract(db:any){
 async function fixture(){const key=randomUUID(),tenant=await db.tenant.create({data:{name:'Synthetic numbering'}}),store=await db.store.create({data:{tenantId:tenant.id,name:'Synthetic'}}),cat=await db.category.create({data:{storeId:store.id,name:'Tea'}}),product=await db.product.create({data:{storeId:store.id,categoryId:cat.id,code:key,name:'Tea'}}),spec=await db.spec.create({data:{productId:product.id,name:'Regular',price:100}});return {storeId:store.id,staffId:'synthetic',paymentMethod:'cash',taxEnabled:false,items:[{productId:product.id,productName:'Tea',specId:spec.id,specName:'Regular',quantity:1,unitPrice:100}]}}
 test('same-day first orders from separate stores get globally unique generated numbers and short pickup numbers',async()=>{
  const a=await fixture(),b=await fixture(),one=await createOrder(a),two=await createOrder(b)
  expect(one.orderNumber).not.toBe(two.orderNumber);expect(one.orderNumber).toMatch(/^[0-9A-V]{10}$/);expect(one.pickupNumber).toMatch(/^A\d{2}$/);expect(two.pickupNumber).toMatch(/^A\d{2}$/)
 })
 test('concurrent generated orders are unique and stable request replay does not double-book',async()=>{
  const input=await fixture();const sales=await Promise.all([createOrder(input),createOrder(input)])
  expect(new Set(sales.map(s=>s.orderNumber)).size).toBe(2)
  const stable={...input,orderNumber:randomUUID()};const [first,replay]=await Promise.all([createOrder(stable),createOrder(stable)])
  expect(replay.id).toBe(first.id);expect(await db.cashEvent.count({where:{orderId:first.orderNumber}})).toBe(1)
 })
 test('forced generated collision retries after rollback without duplicate cash; repeated collision fails bounded',async()=>{
  const input=await fixture(),first=await createOrder(input),real=numbers.orderNumberCandidate
  const spy=jest.spyOn(numbers,'orderNumberCandidate').mockReturnValueOnce(first.orderNumber).mockImplementation(()=>real())
  try{const next=await createOrder(input);expect(next.orderNumber).not.toBe(first.orderNumber);expect(spy).toHaveBeenCalledTimes(2);expect(await db.cashEvent.count({where:{storeId:input.storeId}})).toBe(2)}finally{spy.mockRestore()}
  const always=jest.spyOn(numbers,'orderNumberCandidate').mockReturnValue(first.orderNumber)
  try{await expect(createOrder(input)).rejects.toThrow('ORDER_NUMBER_ALLOCATION_RETRY_EXHAUSTED');expect(always).toHaveBeenCalledTimes(5);expect(await db.cashEvent.count({where:{storeId:input.storeId}})).toBe(2)}finally{always.mockRestore()}
 })
 test('generator persists separate day counters across WIB midnight without changing old numbers',async()=>{
  const input=await fixture()
  const a=await generateOrderNumber(input.storeId,'ORD',new Date('2026-01-01T16:59:59Z')),b=await generateOrderNumber(input.storeId,'ORD',new Date('2026-01-01T17:00:00Z'))
  expect(a).toMatch(/^[0-9A-V]{10}$/);expect(b).toMatch(/^[0-9A-V]{10}$/)
  const counters=await db.orderCounter.findMany({where:{storeId:input.storeId},orderBy:{date:'asc'}})
  expect(counters.map((c:any)=>[c.date,c.counter])).toEqual([['20260101',1],['20260102',1]])
 })
}
