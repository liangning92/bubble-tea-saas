import {expect,test} from '@jest/globals'
import {canQueueCheckoutFailure} from '../../client-pos/src/utils/checkoutFailure'
test.each([400,401,403,409,500])('HTTP %s cannot become an offline sale',status=>{
 expect(canQueueCheckoutFailure({isAxiosError:true,request:{},response:{status}})).toBe(false)
})
test('only an attempted transport failure may be queued with the same receipt id',()=>{
 expect(canQueueCheckoutFailure({isAxiosError:true,request:{},code:'ERR_NETWORK'})).toBe(true)
 expect(canQueueCheckoutFailure(new Error('local failure'))).toBe(false)
 expect(canQueueCheckoutFailure({isAxiosError:true})).toBe(false)
})
