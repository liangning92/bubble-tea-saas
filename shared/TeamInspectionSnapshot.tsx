import { inspectionCopy } from './inspectionCopy'
export interface InspectionSnapshot {
 capturedAt: string; timezone: string; businessDate: string
 items: { inventoryId: string; name: string; unit: string; quantity: number; minStock: number; safetyStock: number
  lastValidCount: { countedAt: string; quantity: number } | null
  pendingArrivals: { quantity: number; expectedAt: string | null }[]; quality: string[] }[]
}
export function TeamInspectionSnapshot({ snapshot, language }: { snapshot: InspectionSnapshot; language: string }) {
 const w = inspectionCopy(language)
 const date = (value: string) => new Date(value).toLocaleString(language.startsWith('zh') ? 'zh-CN' : language.startsWith('en') ? 'en-GB' : 'id-ID', { timeZone: snapshot.timezone })
 return <section className="min-w-0 space-y-2 rounded-lg border bg-amber-50 p-3 text-sm" data-testid="inspection-snapshot">
  <h5 className="font-semibold">{w.snapshot} · {snapshot.businessDate}</h5><p>{w.draft}</p><p>{w.captured}: {date(snapshot.capturedAt)} · {snapshot.timezone}</p>
  {snapshot.items.map(item => <article className="min-w-0 space-y-1 rounded-lg border bg-white p-3" key={item.inventoryId}>
   <h6 className="break-words font-semibold">{item.name}</h6><p>{w.quantity}: {item.quantity} {item.unit}</p><p>{w.threshold}: {item.minStock} / {item.safetyStock} {item.unit}</p>
   <p>{w.lastCount}: {item.lastValidCount ? `${item.lastValidCount.quantity} ${item.unit} · ${date(item.lastValidCount.countedAt)}` : w.unknown}</p>
   <p>{w.pending}: {item.pendingArrivals.length ? item.pendingArrivals.map(p => `${p.quantity} ${item.unit} · ${p.expectedAt ? date(p.expectedAt) : w.unknown}`).join('；') : '—'}</p>
   <ul className="list-inside list-disc break-words">{item.quality.map(q => <li key={q}>{w.quality[q] || w.unknown}</li>)}</ul>
  </article>)}
 </section>
}
