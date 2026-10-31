import {beforeEach,expect,jest,test} from '@jest/globals'
jest.mock('../src/config/database',()=>({__esModule:true,default:{}}))
import {calculatePayrollBasis} from '../src/services/ProbationService'
import {isQrAttendance,attendanceEvidence} from '../src/services/AttendanceEvidencePolicy'
import {unpaidLeavePlan} from '../src/services/SalaryLeavePlan'
const staff={id:'worker',storeId:'store',baseSalary:1400000,hireDate:new Date('2020-01-01T00:00:00+07:00'),terminationDate:null,user:{role:'staff'}}
const qr=(date:string)=>({checkInTime:new Date(date+'T09:00:00+07:00'),status:'normal',gpsLocation:'POS:cashier',note:'QR Check-in at POS cashier'})
const db:any={config:{findUnique:jest.fn(async()=>null)},attendance:{findMany:jest.fn(async()=>[])}}
beforeEach(()=>{jest.clearAllMocks();db.config.findUnique.mockResolvedValue(null);db.attendance.findMany.mockResolvedValue([])})
test.each([['2026-10',31],['2026-11',30],['2024-02',29],['2025-02',28]])('QR attendance and two paid days use %s calendar divisor without month-specific policy',async(month,days)=>{
 db.attendance.findMany.mockResolvedValue(Array.from({length:days-2},(_,i)=>qr(month+'-'+String(i+1).padStart(2,'0'))))
 const b=await calculatePayrollBasis(db,staff,month)
 expect(b).toMatchObject({dailyRateDivisor:days,workedDays:days-2,paidRestDays:2,payableDays:days,amount:1400000,daysSource:'attendance',qrAttendanceRequired:true})
})
test('GPS, pending records, forged QR labels and duplicate scans do not inflate payable days',async()=>{
 const one=qr('2026-11-05')
 db.attendance.findMany.mockResolvedValue([one,one,{...qr('2026-11-06'),gpsLocation:'GPS'},{...qr('2026-11-07'),note:'not a QR proof'},{...qr('2026-11-08'),status:'absence'}])
 const b=await calculatePayrollBasis(db,{...staff,hireDate:new Date('2026-11-05T00:00:00+07:00')},'2026-11')
 expect(b).toMatchObject({workedDays:1,paidRestDays:0,amount:46667,dailyRateDivisor:30})
})
test('audited manual workday overrides remain explicit for historical deployment gaps',async()=>{
 const b=await calculatePayrollBasis(db,{...staff,terminationDate:new Date('2026-10-29T00:00:00+07:00')},'2026-10',{probation:0,regular:29},'manual')
 expect(b).toMatchObject({workedDays:29,paidRestDays:0,amount:1309677,daysSource:'manual'})
 expect(unpaidLeavePlan(staff,{enabled:false},b,[],new Set(['unpaid']),{probation:0,regular:1}).deduction).toBe(0)
})
test('explicit attendance preview recomputes QR dates instead of trusting stale caller day counts',async()=>{
 db.attendance.findMany.mockResolvedValue([qr('2026-11-05')])
 expect(await calculatePayrollBasis(db,staff,'2026-11',{probation:0,regular:30},'attendance')).toMatchObject({workedDays:1,paidRestDays:2,payableDays:3,amount:140000})
})
test('verified offline and online checkout evidence is recognized, plain GPS becomes absence without deleting history',()=>{
 expect(isQrAttendance({...qr('2026-11-05'),note:'Offline employee QR check_in; original 2026-11-05T02:00:00Z'})).toBe(true)
 expect(isQrAttendance({...qr('2026-11-05'),note:'QR Check-out at POS cashier'})).toBe(true)
 expect(attendanceEvidence({status:'normal',gpsLocation:'other',note:null})).toMatchObject({originalStatus:'normal',status:'absence',qrVerified:false})
})
