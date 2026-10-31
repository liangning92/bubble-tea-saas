// Read-only attendance presentation. Never calculates payroll or rewrites punches.
export const attendanceDate = (value: Date | string) => new Date(new Date(value).getTime() + 7 * 3600000).toISOString().slice(0, 10)
export const attendanceDay = (day: string) => new Date(day + 'T00:00:00+07:00')
export const moveAttendanceDay = (day: string, days: number) => attendanceDate(new Date(attendanceDay(day).getTime() + days * 86400000))
export function attendanceWindow(date: string, period: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(attendanceDay(date).getTime()) || attendanceDate(attendanceDay(date)) !== date) throw Error('INVALID_ATTENDANCE_DATE')
  if (!['day', 'week', 'month'].includes(period)) throw Error('INVALID_ATTENDANCE_PERIOD')
  const start = period === 'month' ? date.slice(0, 7) + '-01' : period === 'week' ? moveAttendanceDay(date, -6) : date
  const end = period === 'month' ? moveAttendanceDay(attendanceDate(new Date(Date.UTC(Number(date.slice(0,4)), Number(date.slice(5,7)), 1))), -1) : date
  return { start, end, trendStart: moveAttendanceDay(date, -6) }
}
const stamp = (value: any) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null
const validDay = (value: any) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
export function buildAttendanceReport(input: {date: string; period: string; now?: Date; staff: any[]; attendance: any[]; snapshots: any[]; schedules: any[]; shifts: any[]; leaves: any[]}) {
  const { date, period, staff, schedules, shifts, leaves } = input, now = input.now || new Date(), window = attendanceWindow(date, period)
  const snapshots = new Map(input.snapshots.map(s => [s.attendanceId, s]))
  const records = input.attendance.map(a => {
    const s = snapshots.get(a.id), start = stamp(s?.start), end = stamp(s?.end)
    const minutes = start && typeof s?.minutes === 'number' && Number.isFinite(s.minutes) && s.minutes >= 0 && !s.needsReview ? s.minutes : null
    return { id:a.id, staffId:a.staffId, businessDate:validDay(s?.businessDate)?s.businessDate:attendanceDate(a.checkInTime), checkIn:stamp(a.checkInTime), checkOut:stamp(a.checkOutTime), rawCheckIn:stamp(s?.rawCheckIn || a.checkInTime), start, end, shiftName:s?.shiftName || null, lateMinutes:minutes, exempt:!!s?.exempt, source:s?'snapshot':'legacy', missingCheckout:!!end && now > new Date(end) && !a.checkOutTime }
  })
  const dayRow = (person:any, day:string) => {
    const entries = records.filter(r => r.staffId===person.id && r.businessDate===day).sort((a,b)=>(a.checkIn||'').localeCompare(b.checkIn||''))
    const assigned = schedules.filter(s=>s.staffId===person.id && attendanceDate(s.date)===day)
    const working = assigned.filter(s=>!['off','rest'].includes(s.shift))
    const plans = working.map(s=>{const shift=shifts.find(t=>[t.id,t.key,t.name].includes(s.shift));if(!shift)return null;const start=stamp(day+'T'+shift.startTime+':00+07:00');if(!start)return null;let end=stamp(day+'T'+shift.endTime+':00+07:00');if(end && end<=start)end=new Date(new Date(end).getTime()+86400000).toISOString();return {name:shift.name,start,end}}).filter(Boolean)
    const onLeave = leaves.filter(l=>l.staffId===person.id && attendanceDate(l.startDate)<=day && attendanceDate(l.endDate)>=day)
    const outside = !!person.hireDate && attendanceDate(person.hireDate)>day || !!person.terminationDate && attendanceDate(person.terminationDate)<day
    const knownMinutes=entries.reduce((n,r)=>n+(r.lateMinutes||0),0), unknown=entries.some(r=>r.lateMinutes===null)
    let state='unscheduled'
    if(entries.length)state=unknown?'pending_review':knownMinutes>0?'late':'present'
    else if(outside)state='outside_employment'
    else if(onLeave.some(l=>!l.halfDay))state='leave'
    else if(onLeave.length)state='pending_review'
    else if(assigned.length && !working.length)state='rest'
    else if(assigned.some(s=>s.status==='absent'))state='absent'
    else if(working.length && plans.length!==working.length)state='pending_review'
    else if(plans.length)state=now<new Date(plans[0]!.start!)?'not_started':plans.some(p=>p!.end && now<=new Date(p!.end))?'awaiting':'absent'
    else if(now>=new Date(day+'T23:59:59.999+07:00'))state='absent'
    const starts=entries.length?entries.map(r=>r.start).filter(Boolean):plans.map(p=>p!.start)
    return {staffId:person.id,staffName:person.name,employeeNumber:person.employeeNumber||'',state,scheduled:!!starts.length,shiftName:entries.length?entries.map(r=>r.shiftName).filter(Boolean).join(' / '):plans.map(p=>p!.name).join(' / '),scheduledStarts:starts,checkIn:entries[0]?.checkIn||null,checkOut:entries.length && entries.every(r=>r.checkOut)?entries.map(r=>r.checkOut!).sort().at(-1):null,lateMinutes:entries.length && !unknown?knownMinutes:null,knownLateMinutes:knownMinutes,exemptMinutes:entries.filter(r=>r.exempt).reduce((n,r)=>n+(r.lateMinutes||0),0),needsReview:unknown || ['pending_review','missing','unscheduled'].includes(state) || entries.some(r=>r.missingCheckout),missingCheckout:entries.some(r=>r.missingCheckout),records:entries,outsideEmployment:outside}
  }
  const relevant = (person:any, row:any) => row.records.length || schedules.some(s=>s.staffId===person.id && attendanceDate(s.date)===date) || person.status==='active' && !row.outsideEmployment
  const rows=staff.map(p=>dayRow(p,date)).filter((r,i)=>relevant(staff[i],r)).sort((a,b)=>b.knownLateMinutes-a.knownLateMinutes || Number(b.needsReview)-Number(a.needsReview) || a.staffName.localeCompare(b.staffName))
  const ranking=staff.map(p=>{const entries=records.filter(r=>r.staffId===p.id && r.businessDate>=window.start && r.businessDate<=window.end),unknownRecords=entries.filter(r=>r.lateMinutes===null).length,lateDays=new Set(entries.filter(r=>(r.lateMinutes||0)>0).map(r=>r.businessDate)),knownLateMinutes=entries.reduce((n,r)=>n+(r.lateMinutes||0),0);return {staffId:p.id,staffName:p.name,employeeNumber:p.employeeNumber||'',lateMinutes:unknownRecords?null:knownLateMinutes,knownLateMinutes,lateCount:lateDays.size,maxLateMinutes:entries.length && !entries.every(r=>r.lateMinutes===null)?Math.max(0,...entries.map(r=>r.lateMinutes||0)):null,unknownRecords,exemptMinutes:entries.filter(r=>r.exempt).reduce((n,r)=>n+(r.lateMinutes||0),0),records:entries}}).filter(r=>r.records.length).sort((a,b)=>b.knownLateMinutes-a.knownLateMinutes || b.lateCount-a.lateCount || a.staffName.localeCompare(b.staffName))
  const summarize=(list:any[])=>({checkedIn:list.filter(r=>r.records.length).length,onTime:list.filter(r=>r.state==='present').length,late:list.filter(r=>r.knownLateMinutes>0).length,lateVerified:list.filter(r=>r.state==='late').length,lateMinutes:list.reduce((n,r)=>n+r.knownLateMinutes,0),absent:list.filter(r=>r.state==='absent').length,review:list.filter(r=>r.needsReview).length,unverified:list.filter(r=>r.records.some((a:any)=>a.lateMinutes===null)).length,scheduled:list.filter(r=>r.scheduled).length,awaiting:list.filter(r=>r.state==='awaiting').length,notStarted:list.filter(r=>r.state==='not_started').length,rest:list.filter(r=>r.state==='rest').length,leave:list.filter(r=>r.state==='leave').length,unscheduled:list.filter(r=>r.state==='unscheduled').length})
  const trend=Array.from({length:7},(_,i)=>{const day=moveAttendanceDay(date,i-6);const list=staff.map(p=>dayRow(p,day)).filter(r=>r.records.length || r.scheduled);return {date:day,...summarize(list)}})
  return {date,period,window:{start:window.start,end:window.end},timeZone:'Asia/Jakarta',summary:summarize(rows),rows,ranking,trend}
}
