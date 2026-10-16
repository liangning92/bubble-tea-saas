import {beforeEach,afterEach,expect,jest,test} from '@jest/globals'
jest.mock('../src/config/env',()=>({config:{jwt:{secret:'synthetic-offline-attendance-secret'}}}))
jest.mock('../src/config/database',()=>({__esModule:true,default:{user:{findUnique:jest.fn()},attendance:{findMany:jest.fn(),findFirst:jest.fn(),update:jest.fn()},config:{findUnique:jest.fn(),create:jest.fn()},$transaction:jest.fn()}}))
jest.mock('../src/services/EmployeeAttendanceService',()=>({createEmployeeAttendance:jest.fn()}))
jest.mock('../src/services/EmployeeWorkspaceStore',()=>({workLock:jest.fn(),readWork:jest.fn(),writeWork:jest.fn()}))
import prisma from '../src/config/database'
import {createEmployeeAttendance} from '../src/services/EmployeeAttendanceService'
import {attendanceQR,attendanceQRBundle,attendanceQRHashes,verifyAttendanceQR,ATTENDANCE_QR_WINDOW} from '../src/services/AttendanceQRService'
import {prepareEmployeeOfflineAttendance,syncEmployeeOfflineAttendance} from '../src/services/EmployeeOfflineAttendanceService'
import {randomUUID,createHash} from 'crypto'
import {POS_OFFLINE_TTL_MS} from '../src/utils/offlinePolicy'
const db=prisma as any,work=createEmployeeAttendance as jest.Mock<any>,receipts=new Map<string,any>(),start=new Date('2026-10-16T08:00:01Z').getTime()
const employee={id:'employee',phone:'080000000001',role:'staff',updatedAt:new Date(start-1000),staff:{id:'profile',storeId:'store',status:'active'}}
beforeEach(()=>{
 jest.useFakeTimers();jest.setSystemTime(start);jest.clearAllMocks();receipts.clear()
 db.user.findUnique.mockResolvedValue(employee);db.attendance.findFirst.mockResolvedValue(null);db.attendance.findMany.mockResolvedValue([])
 db.$transaction.mockImplementation(async(fn:any)=>fn(db))
 db.config.findUnique.mockImplementation(async({where}:any)=>receipts.get(where.storeId_key.key)||null)
 db.config.create.mockImplementation(async({data}:any)=>{receipts.set(data.key,data);return data})
 db.attendance.update.mockImplementation(async({data}:any)=>data)
 work.mockImplementation(async(data:any)=>({...data,checkOutTime:null}))
})
afterEach(()=>jest.useRealTimers())
test('rotating QR bundle covers 30 days without disclosing the server signing secret to phones',()=>{
 const bundle=attendanceQRBundle('store','store',start),hashes=attendanceQRHashes('store','store',start)
 expect(Object.keys(bundle.codes).length).toBe(8641);expect(bundle.expiresAt-start).toBe(POS_OFFLINE_TTL_MS)
 expect((hashes as any).codes).toBeUndefined()
 for(const at of [start,start+ATTENDANCE_QR_WINDOW,start+POS_OFFLINE_TTL_MS-1]){
  const code=bundle.codes[String(Math.floor(at/ATTENDANCE_QR_WINDOW)*ATTENDANCE_QR_WINDOW)]
  expect(verifyAttendanceQR(code,'store',at).s).toBe('store')
  expect(hashes.hashes[String(Math.floor(at/ATTENDANCE_QR_WINDOW)*ATTENDANCE_QR_WINDOW)]).toBe(createHash('sha256').update(code).digest('base64'))
 }
 expect(JSON.stringify(bundle)).not.toContain('synthetic-offline-attendance-secret')
})
test('expired, future, tampered and foreign-store QR payloads are rejected',()=>{
 const at=Math.floor(start/ATTENDANCE_QR_WINDOW)*ATTENDANCE_QR_WINDOW,code=attendanceQR('store','store',at)
 expect(()=>verifyAttendanceQR(code,'foreign',start)).toThrow()
 expect(()=>verifyAttendanceQR(code,'store',at-1)).toThrow()
 expect(()=>verifyAttendanceQR(code,'store',at+ATTENDANCE_QR_WINDOW)).toThrow()
 const payload=JSON.parse(Buffer.from(code,'base64').toString());payload.p='forged'
 expect(()=>verifyAttendanceQR(Buffer.from(JSON.stringify(payload)).toString('base64'),'store',start)).toThrow()
})
test('offline scan uploads retain original time and immutable replay cannot duplicate attendance',async()=>{
 const prep=await prepareEmployeeOfflineAttendance({id:'employee',storeId:'store'})
 const occurredAt=new Date(start+360000).toISOString(),input={id:randomUUID(),authorization:prep.authorization,occurredAt,type:'check_in',qrData:attendanceQR('store','store',Date.parse(occurredAt))}
 jest.setSystemTime(start+7*86400000)
 const first=await syncEmployeeOfflineAttendance(input),replay=await syncEmployeeOfflineAttendance(input)
 expect(replay).toEqual(JSON.parse(JSON.stringify(first)));expect(work).toHaveBeenCalledTimes(1)
 expect((work.mock.calls[0][0] as any).checkInTime.toISOString()).toBe(occurredAt)
 expect((work.mock.calls[0][0] as any).staffId).toBe('profile')
 expect(db.config.create).toHaveBeenCalledTimes(1)
 await expect(syncEmployeeOfflineAttendance({...input,type:'check_out'})).rejects.toThrow('EMPLOYEE_OFFLINE_CONFLICT')
})
test('30-day grants authorize only the original employee and are revoked by account changes',async()=>{
 const prep=await prepareEmployeeOfflineAttendance({id:'employee',storeId:'store'})
 const input={id:randomUUID(),authorization:prep.authorization,occurredAt:new Date(start+1000).toISOString(),type:'check_in',qrData:attendanceQR('store','store',start+1000)}
 jest.setSystemTime(start+1000)
 db.user.findUnique.mockResolvedValue({...employee,updatedAt:new Date(start+500)})
 await expect(syncEmployeeOfflineAttendance(input)).rejects.toThrow('EMPLOYEE_OFFLINE_AUTHORIZATION_REVOKED')
 expect(work).not.toHaveBeenCalled()
 db.user.findUnique.mockResolvedValue({...employee,staff:{...employee.staff,status:'inactive'}})
 await expect(syncEmployeeOfflineAttendance(input)).rejects.toThrow('EMPLOYEE_OFFLINE_AUTHORIZATION_REVOKED')
 db.user.findUnique.mockResolvedValue(employee);jest.setSystemTime(start+POS_OFFLINE_TTL_MS+60000)
 const expired=new Date(start+POS_OFFLINE_TTL_MS).toISOString()
 await expect(syncEmployeeOfflineAttendance({...input,occurredAt:expired,qrData:attendanceQR('store','store',Date.parse(expired))})).rejects.toThrow('EMPLOYEE_OFFLINE_AUTHORIZATION_INVALID')
})
