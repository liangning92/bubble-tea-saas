import { businessCalendarDate } from './revenueDateRange'

type Definition = {key:string;startTime?:string;name?:string;nameZh?:string|null;nameId?:string|null}
type Handover = {id:string;shift:string;closedAt:Date|null}
// A night handover reports the whole day's online income. Reopened/repeated
// night handovers replace the earlier report for that WIB calendar date.
export function dailyNightHandoverIds(rows:Handover[], definitions:Definition[]) {
  const named = definitions.filter(d => /night|evening|malam|晚班/i.test([d.key,d.name,d.nameZh,d.nameId].join(' ')))
  const last = [...definitions].filter(d => d.startTime).sort((a,b) => b.startTime!.localeCompare(a.startTime!))[0]
  const keys = new Set(named.length ? named.map(d=>d.key) : last && definitions.length>1 ? [last.key] : ['night','evening'])
  const days = new Map<string,Handover>()
  for (const row of rows) {
    if (!row.closedAt || !keys.has(row.shift)) continue
    const day=businessCalendarDate(row.closedAt), previous=days.get(day)
    if (!previous || row.closedAt > previous.closedAt! || (row.closedAt.getTime()===previous.closedAt!.getTime() && row.id>previous.id)) days.set(day,row)
  }
  return new Set([...days.values()].map(row=>row.id))
}
