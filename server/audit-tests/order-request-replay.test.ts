import {expect,test} from '@jest/globals'
import {orderRequestFingerprint} from '../src/utils/orderRequestFingerprint'
import {orderSyncPayload} from '../../client-pos/src/utils/orderSyncPayload'
const original={storeId:'a',staffId:'cashier-a',orderNumber:'OFFLINE-12345678-1234-4123-8123-123456789abc',pickupNumber:'A01',paymentMethod:'qris',paymentEvidenceId:'proof',memberId:'member',pointsRedeemed:5000,taxEnabled:false,discountAmount:10,note:'original',tableNumber:'T1',items:[{productId:'p',productName:'Tea',specId:'s',specName:'Regular',quantity:1,unitPrice:100}]}
test('offline retry preserves the original request instead of reconstructing from mutable display fields',()=>{
 const payload=orderSyncPayload({storeId:original.storeId,orderNumber:original.orderNumber,checkoutRequest:original,shiftSessionId:'shift-a',channelId:'POS',pointsRedeemed:0,discountAmount:0} as any)
 expect(payload).toEqual(original)
 expect(payload).not.toHaveProperty('channelId')
 expect(orderRequestFingerprint(payload as any)).toBe(orderRequestFingerprint(original))
})
test('changing synchronizer identity does not change intent, while all financial/receipt input changes conflict',()=>{
 expect(orderRequestFingerprint({...original,manualPaymentActorId:'cashier-b'})).toBe(orderRequestFingerprint(original))
 for(const change of [{pointsRedeemed:0},{discountAmount:9},{paymentEvidenceId:'another'},{storeId:'b'},{staffId:'cashier-b'},{orderNumber:'new-order'},{taxEnabled:true},{tableNumber:'T2'},{note:'changed'}])expect(orderRequestFingerprint({...original,...change})).not.toBe(orderRequestFingerprint(original))
})
