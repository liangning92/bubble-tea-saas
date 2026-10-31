import type {UsageRow} from '../../../shared/inventoryUsageReport'
export type ReportMode = 'counts' | 'registered'
export type ReportFilter = 'all' | 'comparable' | 'missing' | 'difference'
export type ReportSort = 'name' | 'quantity' | 'amount'
export interface ReportState {
  period: 'latest' | 'today' | 'custom'; startDate: string; endDate: string;
  search: string; filter: ReportFilter; sort: ReportSort; expanded: string | null
}
export function defaultReportState(mode:ReportMode,today:string):ReportState {
  return {period:mode==='counts'?'latest':'today',startDate:today,endDate:today,search:'',filter:'all',sort:'name',expanded:null}
}
export function validReportDates(start:string,end:string) {
  const valid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s
  return valid(start)&&valid(end)&&start<=end
}
export const hasComparison=(r:UsageRow)=>r.variance!==null&&Number.isFinite(r.variance)
export const missingData=(r:UsageRow)=>r.varianceStatus==='awaiting_count'||r.varianceStatus==='unavailable'&&!(r.unavailableReason==='ZERO_THEORETICAL_BASELINE'&&hasComparison(r))
export const hasDifference=(r:UsageRow)=>hasComparison(r)&&r.variance!==0
export function reportSummary(rows:UsageRow[]) {
  return {comparable:rows.filter(hasComparison).length,missing:rows.filter(missingData).length,difference:rows.filter(hasDifference).length}
}
export function selectReportRows(rows:UsageRow[],state:ReportState,name:(r:UsageRow)=>string) {
  const search=state.search.trim().toLocaleLowerCase()
  return rows.filter(r=>(r.inventoryName+' '+name(r)).toLocaleLowerCase().includes(search))
    .filter(r=>state.filter==='all'||state.filter==='missing'&&missingData(r)||state.filter==='comparable'&&hasComparison(r)||state.filter==='difference'&&hasDifference(r))
    .sort((a,b)=>{
      if(state.sort==='name')return name(a).localeCompare(name(b))
      const key=state.sort==='amount'?'varianceAmountEstimate':'variance',x=a[key],y=b[key]
      const xn=x==null||!Number.isFinite(x),yn=y==null||!Number.isFinite(y)
      return xn?yn?name(a).localeCompare(name(b)):1:yn?-1:Math.abs(y!)-Math.abs(x!)||name(a).localeCompare(name(b))
    })
}
export function readReportState(key:string,mode:ReportMode,today:string):ReportState {
  const fallback=defaultReportState(mode,today)
  try {
    const r=JSON.parse(sessionStorage.getItem(key)||'null')
    if(!r||!validReportDates(r.startDate,r.endDate))return fallback
    return {...fallback,period:(mode==='counts'?['latest','custom']:['today','custom']).includes(r.period)?r.period:fallback.period,
      startDate:r.startDate,endDate:r.endDate,search:typeof r.search==='string'?r.search:'',
      filter:['all','comparable','missing','difference'].includes(r.filter)?r.filter:'all',sort:['name','quantity','amount'].includes(r.sort)?r.sort:'name',expanded:typeof r.expanded==='string'?r.expanded:null}
  } catch {return fallback}
}
