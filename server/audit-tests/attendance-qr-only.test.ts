import {expect,jest,test} from '@jest/globals'
jest.mock('../src/config/database',()=>({__esModule:true,default:{staff:{findFirst:jest.fn()},config:{findUnique:jest.fn()}}}))
jest.mock('../src/config/env',()=>({config:{jwt:{secret:'synthetic'}}}))
import prisma from '../src/config/database'
import {staffRouter} from '../src/routes/staff'
test.each(['check_in','check_out'])('plain %s is rejected before creating or updating attendance',async(type)=>{
 const handler=(staffRouter as any).stack.find((l:any)=>l.route?.path==='/attendance'&&l.route.methods.post).route.stack.at(-1).handle
 const res:any={statusCode:200,status(n:number){this.statusCode=n;return this},json(v:any){this.data=v;return this}}
 await handler({body:{type,gpsLocation:'POS:forged',note:'QR Check-in at POS forged'},user:{id:'u',storeId:'store'}},res)
 expect(res.statusCode).toBe(400);expect(res.data.error).toBe('QR_ATTENDANCE_REQUIRED');expect((prisma as any).staff.findFirst).not.toHaveBeenCalled()
})
