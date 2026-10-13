import prisma from '../config/database'
import {loadStoreDateSettings,calendarDate,calendarStart,nextCalendarDate} from './storeDateSettings'
import {parseDateBoundary} from './businessDate'
/** Use store calendar days, including DST, without changing stored instants. */
export async function inventoryBusinessCalendar(storeId:string,db:any=prisma){
 const {timezone}=await loadStoreDateSettings(db,storeId)
 const formatDate=(date:Date)=>calendarDate(date,timezone)
 const startOfDay=(date:Date)=>calendarStart(formatDate(date),timezone)
 const addDays=(date:Date,days:number)=>calendarStart(nextCalendarDate(formatDate(date),days),timezone)
 const endOfDay=(date:Date)=>new Date(addDays(date,1).getTime()-1)
 const boundary=(value:string,end=false)=>{const parsed=parseDateBoundary(value,end);if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return parsed;const start=calendarStart(value,timezone);return end?endOfDay(start):start}
 const dayCount=(start:Date,end:Date)=>(Date.parse(formatDate(end)+'T00:00:00Z')-Date.parse(formatDate(start)+'T00:00:00Z'))/86400000
 return {timezone,formatDate,startOfDay,endOfDay,addDays,boundary,dayCount}
}
