import {useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {Link} from 'react-router-dom'
import {useTranslation} from 'react-i18next'
import {inventoryApi} from '../../services/api'
export function ConsumptionAnalysisPage(){
 const {t}=useTranslation();const [range,setRange]=useState({startDate:new Date(Date.now()-30*86400000).toISOString().slice(0,10),endDate:new Date().toISOString().slice(0,10)})
 const {data:settings}=useQuery({queryKey:['inventory-alert-config'],queryFn:()=>inventoryApi.getAlertConfig()})
 const config=settings?.data?.data
 const query=useQuery({queryKey:['physical-variance',range],queryFn:()=>inventoryApi.consumptionAnalysis(range),enabled:!!range.startDate&&!!range.endDate,refetchInterval:config?config.autoCheckIntervalHours*3600000:false})
 const rows=query.data?.data?.data?.list||[]
 const display=(value:number|null|undefined)=>value===null||value===undefined?'—':Number(value.toFixed(6)).toString()
 return <main className="space-y-4"><h1 className="text-2xl font-bold">{t('varianceFlow.title')}</h1><p>{t('varianceFlow.hint')}</p><p className="text-amber-700">{t('varianceFlow.estimate')}</p><div className="flex gap-3 flex-wrap"><input type="date" value={range.startDate} onChange={e=>setRange({...range,startDate:e.target.value})}/><input type="date" value={range.endDate} onChange={e=>setRange({...range,endDate:e.target.value})}/><button onClick={()=>query.refetch()}>{t('countFlow.refresh')}</button><Link className="text-blue-600" to="/inventory/alert-config">{t('varianceFlow.settings')}</Link></div>
 {config&&<p>{t(config.enableConsumptionAlert?'varianceFlow.enabled':'varianceFlow.disabled')} · {t('varianceFlow.warning')} {config.varianceWarningPercent}% · {t('varianceFlow.critical')} {config.varianceCriticalPercent}% · {config.autoCheckIntervalHours} h</p>}
 {query.isError&&<p role="alert">{t('countFlow.refresh')}</p>}
 <div className="overflow-auto"><table className="w-full text-sm border-collapse"><thead><tr>{['material','theory','actual','difference','value','percent','state','window','movements','reason'].map(k=><th key={k} className="p-2 border text-left">{t('varianceFlow.'+k)}</th>)}</tr></thead><tbody>{rows.map((row:any)=><tr key={row.inventoryId} className={row.varianceStatus==='critical'?'bg-red-50':row.varianceStatus==='warning'?'bg-amber-50':''}><td className="p-2 border">{row.inventoryName} ({row.unit})</td><td className="p-2 border">{display(row.theoreticalConsumption)}</td><td className="p-2 border">{display(row.actualConsumption)}</td><td className="p-2 border">{display(row.variance)}</td><td className="p-2 border">{display(row.varianceAmountEstimate)}</td><td className="p-2 border">{display(row.variancePercent)}</td><td className="p-2 border">{t('varianceFlow.'+row.varianceStatus)}</td><td className="p-2 border">{row.windowStart} — {row.windowEnd}</td><td className="p-2 border">{t('varianceFlow.receipts')}: {display(row.receipts)}; {t('varianceFlow.nonSale')}: {display(row.knownNonSaleOut)}</td><td className="p-2 border">{row.unavailableReason?t('varianceFlow.'+row.unavailableReason):'—'}</td></tr>)}</tbody></table></div></main>
}
