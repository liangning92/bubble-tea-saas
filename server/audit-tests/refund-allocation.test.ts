import {expect,test} from '@jest/globals'
import {allocateRefundTotal,unitRangeAmount,canonicalSelection} from '../src/utils/refundAllocation'
test('integer allocation conserves every total across different line/unit refund orders',()=>{
 for(let total=0;total<200;total++){
  const order={items:[{id:'b',quantity:3,unitPrice:101},{id:'a',quantity:2,unitPrice:57}],totalAmount:417,finalAmount:total,checkoutTaxAmount:0,requestFingerprint:'v1:test'}
  const allocations=allocateRefundTotal(order,total);expect([...allocations.values()].reduce((a,b)=>a+b,0)).toBe(total)
  for(const item of order.items){const amount=allocations.get(item.id)!;expect(Array.from({length:item.quantity},(_,i)=>unitRangeAmount(amount,item.quantity,i,1)).reduce((a,b)=>a+b,0)).toBe(amount)}
 }
})
test('rejects duplicate IDs, fractional quantities and inconsistent original subtotal',()=>{
 expect(()=>canonicalSelection([{itemId:'a',quantity:1},{itemId:'a',quantity:1}])).toThrow()
 expect(()=>canonicalSelection([{itemId:'a',quantity:0.5}])).toThrow()
 expect(()=>allocateRefundTotal({items:[{id:'a',quantity:1,unitPrice:1}],totalAmount:2,finalAmount:1,checkoutTaxAmount:0,requestFingerprint:'v1:test'},1)).toThrow('EVIDENCE_REQUIRED')
})
