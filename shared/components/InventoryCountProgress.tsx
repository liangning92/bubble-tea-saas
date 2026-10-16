import { inventoryCountLabels } from '../inventoryCountLabels'
import { countProgress, CountProgressItem } from '../inventoryCountProgress'

export function InventoryCountProgress({items,language,compact=false}:{items:CountProgressItem[];language:string;compact?:boolean}) {
 const l=inventoryCountLabels(language),p=countProgress(items)
 return <section aria-label={l.batchProgress} className="space-y-2 min-w-0" data-testid="count-progress">
  {compact ? <p className="text-sm text-gray-600">{l.total} {p.total} · {l.counted} {p.counted} · {l.pending} {p.pending}</p> : <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{(['total','counted','pending','difference'] as const).map(key=><div key={key} className={`rounded-xl border p-3 min-w-0 ${key==='counted'?'bg-green-50 border-green-200':key==='pending'?'bg-amber-50 border-amber-200':'bg-white border-gray-200'}`}><p className="text-sm text-gray-600">{l[key]}</p><strong className="text-2xl tabular-nums">{p[key]}</strong></div>)}</div>}
  <div role="progressbar" aria-label={l.batchProgress} aria-valuemin={0} aria-valuemax={p.total||1} aria-valuenow={p.counted} aria-valuetext={`${l.counted} ${p.counted} / ${p.total}`} className="h-2 rounded-full bg-gray-200 overflow-hidden"><div className="h-full bg-green-600 rounded-full transition-all" style={{width:`${p.percent}%`}}/></div>
 </section>
}
