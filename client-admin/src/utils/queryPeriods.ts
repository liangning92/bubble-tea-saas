import {storeCalendarDate} from './storeDateTime'
export const QUERY_PERIODS=['yesterday','today','week','month'] as const
export type QueryPeriod=typeof QUERY_PERIODS[number]
const move=(date:string,days:number)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10)
export function queryCalendarRange(period:QueryPeriod,timezone:string,now=new Date()){
 const today=storeCalendarDate(now,timezone)
 if(period==='yesterday'){const date=move(today,-1);return {startDate:date,endDate:date}}
 if(period==='today')return {startDate:today,endDate:today}
 if(period==='week'){const weekday=new Date(today+'T00:00:00Z').getUTCDay(),first=move(today,-((weekday+6)%7));return {startDate:first,endDate:move(first,6)}}
 const date=new Date(today+'T00:00:00Z');return {startDate:today.slice(0,7)+'-01',endDate:new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).toISOString().slice(0,10)}
}
export function calendarStart(date:string,timezone:string){const nominal=Date.parse(date+'T00:00:00Z');let lo=nominal-36*3600000,hi=nominal+36*3600000;while(lo<hi){const mid=Math.floor((lo+hi)/2);if(storeCalendarDate(new Date(mid),timezone)<date)lo=mid+1;else hi=mid}return new Date(lo)}
export function queryInstantRange(period:QueryPeriod,timezone:string,now=new Date()){const r=queryCalendarRange(period,timezone,now);return {startDate:calendarStart(r.startDate,timezone).toISOString(),endDate:new Date(calendarStart(move(r.endDate,1),timezone).getTime()-1).toISOString()}}
