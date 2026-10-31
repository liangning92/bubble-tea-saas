import { isQrAttendance } from './AttendanceEvidencePolicy'
import prisma from '../config/database'
import { WORK_PREFIX } from './EmployeeWorkspaceStore'
import { attendanceDay, attendanceWindow, moveAttendanceDay, buildAttendanceReport } from '../utils/attendanceReport'
export async function getAttendanceReport(storeId: string, date: string, period: string, staffId?: string, db: any = prisma) {
  const window=attendanceWindow(date,period), start=attendanceDay(moveAttendanceDay(window.start<window.trendStart?window.start:window.trendStart,-1)), end=attendanceDay(moveAttendanceDay(window.end,2))
  const staffWhere={storeId,...(staffId?{id:staffId}:{})}, scope={staff:staffWhere}
  const [staff,attendance,schedules,shifts,leaves]=await Promise.all([
    db.staff.findMany({where:staffWhere,select:{id:true,name:true,employeeNumber:true,status:true,hireDate:true,terminationDate:true}}),
    db.attendance.findMany({where:{...scope,checkInTime:{gte:start,lt:end}},orderBy:{checkInTime:'asc'}}),
    db.schedule.findMany({where:{...scope,date:{gte:start,lt:end}},orderBy:{date:'asc'}}),
    db.shift.findMany({where:{storeId}}),
    db.leave.findMany({where:{storeId,...(staffId?{staffId}:{}),status:'approved',startDate:{lt:end},endDate:{gte:start}}})
  ])
  const validAttendance=attendance.filter(isQrAttendance)
  const snapshots:any[]=[]
  for(let i=0;i<validAttendance.length;i+=400){const keys=validAttendance.slice(i,i+400).map((a:any)=>WORK_PREFIX+`attendance.${a.staffId}.${a.id}`);const saved=await db.config.findMany({where:{storeId,key:{in:keys}},select:{value:true}});for(const row of saved){try{snapshots.push(JSON.parse(row.value))}catch{throw Error('ATTENDANCE_SNAPSHOT_INVALID')}}}
  return buildAttendanceReport({date,period,staff,attendance:validAttendance,schedules,shifts,leaves,snapshots})
}
