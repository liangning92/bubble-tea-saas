import {expect,jest,test} from '@jest/globals'
jest.mock('../src/config/database',()=>({__esModule:true,default:{}}))
import {paymentImageType} from '../src/services/PaymentEvidenceService'
test('rejects disguised HTML/SVG, missing photo and oversized body',()=>{
 for(const file of [Buffer.from('<svg>not a screenshot</svg>'),Buffer.from('<html>payment</html>'),Buffer.alloc(5*1024*1024+1),Buffer.alloc(0)])expect(()=>paymentImageType(file)).toThrow('INVALID_PAYMENT_IMAGE')
})
