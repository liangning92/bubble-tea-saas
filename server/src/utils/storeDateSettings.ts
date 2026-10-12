import { PrismaClient } from '@prisma/client'
export const DATE_FORMATS = ['YYYY-MM-DD','DD/MM/YYYY','MM/DD/YYYY'] as const
export const DEFAULT_TIMEZONE = 'Asia/Jakarta'
export type StoreDateSettings = {timezone:string;dateFormat:typeof DATE_FORMATS[number]}
export function validTimezone(value:unknown):value is string {if(typeof value!=='string'||value.length>100)return false;try{new Intl.DateTimeFormat('en',{timeZone:value}).format(new Date());return true}catch{return false}}
export async function loadStoreDateSettings(db:Pick<PrismaClient,'config'>,storeId:string):Promise<StoreDateSettings> {
  const own=await db.config.findUnique({where:{storeId_key:{storeId,key:'storeInfo'}}})
  const row=own || await db.config.findUnique({where:{storeId_key:{storeId:'',key:'storeInfo'}}})
  let value:any={};try{value=JSON.parse(row?.value||'{}')}catch{}
  return {timezone:validTimezone(value.timezone)?value.timezone:DEFAULT_TIMEZONE,dateFormat:DATE_FORMATS.includes(value.dateFormat)?value.dateFormat:DATE_FORMATS[0]}
}
export function calendarParts(date:Date,timezone=DEFAULT_TIMEZONE) {
  const values=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]))
  return {year:Number(values.year),month:Number(values.month),day:Number(values.day),hour:Number(values.hour),minute:Number(values.minute),second:Number(values.second)}
}
export function calendarDate(date:Date,timezone=DEFAULT_TIMEZONE) {const p=calendarParts(date,timezone);return `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`}
export function nextCalendarDate(value:string,days=1) {return new Date(Date.parse(value+'T00:00:00Z')+days*86400000).toISOString().slice(0,10)}
// Find the first instant belonging to this local calendar day. A UTC offset
// is not fixed: DST days may contain 23 or 25 hours.
export function calendarStart(value:string,timezone=DEFAULT_TIMEZONE) {
  const nominal=Date.parse(value+'T00:00:00Z');let lo=nominal-36*3600000,hi=nominal+36*3600000
  while(lo<hi){const mid=Math.floor((lo+hi)/2);if(calendarDate(new Date(mid),timezone)<value)lo=mid+1;else hi=mid}
  return new Date(lo)
}
export function shiftCalendarMonth(date:Date,timezone=DEFAULT_TIMEZONE) {
  const p=calendarParts(date,timezone),month=new Date(Date.UTC(p.year,p.month-2,1)),last=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,0)).getUTCDate()
  const nominal=Date.UTC(month.getUTCFullYear(),month.getUTCMonth(),Math.min(p.day,last),p.hour,p.minute,p.second,date.getUTCMilliseconds())
  let guess=nominal
  for(let i=0;i<4;i++){const v=calendarParts(new Date(guess),timezone),offset=Date.UTC(v.year,v.month-1,v.day,v.hour,v.minute,v.second)-Math.floor(guess/1000)*1000;const next=nominal-offset;if(next===guess)break;guess=next}
  return new Date(guess)
}
