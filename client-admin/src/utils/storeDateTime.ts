export const DATE_FORMATS=['YYYY-MM-DD','DD/MM/YYYY','MM/DD/YYYY'] as const
export type StoreDateSettings={timezone:string;dateFormat:typeof DATE_FORMATS[number]}
export const DEFAULT_DATE_SETTINGS:StoreDateSettings={timezone:'Asia/Jakarta',dateFormat:'YYYY-MM-DD'}
let current=DEFAULT_DATE_SETTINGS
export function validTimezone(value:unknown):value is string {if(typeof value!=='string')return false;try{new Intl.DateTimeFormat('en',{timeZone:value}).format(new Date());return true}catch{return false}}
export function resolveDateSettings(value:any):StoreDateSettings{return {timezone:validTimezone(value?.timezone)?value.timezone:DEFAULT_DATE_SETTINGS.timezone,dateFormat:DATE_FORMATS.includes(value?.dateFormat)?value.dateFormat:DEFAULT_DATE_SETTINGS.dateFormat}}
export function configureStoreDates(value:StoreDateSettings){current=value}
export function storeCalendarDate(value:string|Date,timezone=current.timezone){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day}`}
export function formatStoreDate(value:string|Date,settings=current,withTime=false){
 const d=new Date(value);if(!Number.isFinite(d.getTime()))return '-'
 const date=typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:storeCalendarDate(d,settings.timezone)
 const [y,m,day]=date.split('-'),formatted=settings.dateFormat==='DD/MM/YYYY'?`${day}/${m}/${y}`:settings.dateFormat==='MM/DD/YYYY'?`${m}/${day}/${y}`:date
 return withTime?formatted+' '+new Intl.DateTimeFormat('en-GB',{timeZone:settings.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d):formatted
}
export const TIMEZONES=[...new Set(['UTC','Asia/Jakarta',...((Intl as typeof Intl & {supportedValuesOf?:(key:string)=>string[]}).supportedValuesOf?.('timeZone') || ['Asia/Makassar','Asia/Jayapura','Asia/Shanghai','Asia/Singapore','America/New_York','Europe/London'])])].sort()
