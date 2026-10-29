import { inventoryCountLabels } from '../inventoryCountLabels'
export type CountReviewEntry = {reason:string;returnedAt:string;returnedBy:string}
export function InventoryCountReviewHistory({history=[],status,language}:{history?:CountReviewEntry[];status:string;language:string}){
 if(!history.length)return null
 const labels=inventoryCountLabels(language)
 return <section data-testid="count-return-history" className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3 break-words min-w-0">
  {status==='in_progress'&&<p className="text-sm text-amber-900">{labels.returnedHint}</p>}
  <details open={status==='in_progress'}><summary className="font-medium cursor-pointer">{labels.returnHistory} · {history.length}</summary>
   <ol className="mt-3 space-y-3 text-sm">{[...history].reverse().map((entry,index)=><li key={index} className="space-y-1"><time className="text-gray-600" dateTime={entry.returnedAt}>{new Date(entry.returnedAt).toLocaleString(language,{timeZone:'Asia/Jakarta'})}</time><p className="whitespace-pre-wrap">{entry.reason}</p></li>)}</ol>
  </details>
 </section>
}
