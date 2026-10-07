import {expect,test} from '@jest/globals'
import {validateRefundItems,validateRefundApproval} from '../src/utils/refundPolicy'
const order={items:[{id:'a'},{id:'b'}],finalAmount:200}
const full={reasonCode:'customer_dissatisfied',selectedItemIds:'["a","b"]',amount:200}
test.each([[],['foreign'],['a','a'],['a',1],null])('rejects invalid selected order lines %j',items=>{expect(()=>validateRefundItems(['a','b'],items)).toThrow('INVALID_REFUND_ITEMS')})
test('only a verified full dissatisfied request passes without inventing partial allocation',()=>{
 expect(()=>validateRefundApproval(full,order,'manager',true)).not.toThrow()
 expect(()=>validateRefundApproval(full,order,'manager',false)).toThrow('REFUND_CLASSIFICATION_REQUIRED')
 expect(()=>validateRefundApproval({...full,selectedItemIds:'["a"]'},order,'admin',true)).toThrow('PARTIAL_REFUND_POLICY_REQUIRED')
 expect(()=>validateRefundApproval({...full,amount:100},order,'admin',true)).toThrow('PARTIAL_REFUND_POLICY_REQUIRED')
})
test('unprepared claim cannot use manager approval or silently choose an inventory policy',()=>{
 expect(()=>validateRefundApproval({...full,reasonCode:'paid_unprepared'},order,'manager',true)).toThrow('ADMIN_APPROVAL_REQUIRED')
 expect(()=>validateRefundApproval({...full,reasonCode:'paid_unprepared'},order,'admin',true)).toThrow('REFUND_CLASSIFICATION_REQUIRED')
})

test("explicit administrator unprepared verification permits full reversal",()=>{expect(()=>validateRefundApproval({...full,reasonCode:"paid_unprepared"},order,"admin",false,true)).not.toThrow()})
