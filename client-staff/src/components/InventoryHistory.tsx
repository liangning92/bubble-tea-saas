import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { inventoryFlowApi, materialName } from '../services/inventoryFlow';
import { ActorName } from './InventoryActor';
export function InventoryHistory() {
  const {t, i18n} = useTranslation();
  const [records, setRecords] = useState<any[]>([]), [loading, setLoading] = useState(true), [failed, setFailed] = useState(false), [kind, setKind] = useState('all'), [search, setSearch] = useState('');
  async function load() {
    setLoading(true); setFailed(false);
    try {
      const [movements, purchases] = await Promise.all([inventoryFlowApi.logs(), inventoryFlowApi.purchases()]);
      setRecords([...movements.data.list.filter((row:any) => row.reason !== 'sold').map((row:any) => ({...row,kind:row.type==='stock_in'?'in':'out'})), ...purchases.data.list.map((row:any)=>({...row,kind:'purchase'}))].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)));
    } catch { setFailed(true); } finally { setLoading(false); }
  }
  useEffect(()=>{void load()}, []);
  const visible=records.filter(row=>(kind==='all'||row.kind===kind)&&(!search||[row.inventory?.name,row.orderNumber,row.onlineOrderNumber,row.operator?.name,row.createdByActor?.name,row.receivedByActor?.name].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase())));
  return <section className="space-y-3">
    <div className="flex justify-between gap-3"><h2 className="text-lg font-bold">{t('inventoryActors.history')}</h2><button type="button" disabled={loading} onClick={load} className="text-orange-600">{t('inventoryFlow.refresh')}</button></div>
    <div className="flex flex-wrap gap-2"><select aria-label={t('inventoryActors.history')} className="border rounded-lg p-2" value={kind} onChange={e=>setKind(e.target.value)}>{['all','in','out','purchase'].map(value=><option key={value} value={value}>{t('inventoryActors.'+value)}</option>)}</select><input aria-label={t('inventoryFlow.search')} placeholder={t('inventoryFlow.search')} className="border rounded-lg p-2 min-w-0 flex-1" value={search} onChange={e=>setSearch(e.target.value)}/></div>
    {loading?<p role="status">{t('inventoryFlow.loading')}</p>:failed?<p role="alert" className="text-red-700">{t('inventoryFlow.failed')}</p>:!visible.length?<p className="text-gray-500">{t('inventoryActors.none')}</p>:visible.map(row=><article key={row.kind+row.id} className="bg-white border rounded-xl p-3 space-y-1 break-words">
      <h3 className="font-medium">{t('inventoryActors.'+row.kind)} · {row.kind==='purchase'?(row.onlineOrderNumber||row.orderNumber):materialName(row.inventory?.name||'',i18n.language)}</h3>
      <p className="text-sm text-gray-500">{new Date(row.createdAt).toLocaleString(i18n.language)}{row.kind!=='purchase'&&` · ${row.quantity} ${row.inventory?.unit||''}`}</p>
      {row.kind==='purchase'?<><p className="text-sm">{t('inventoryActors.buyer')}: <ActorName actor={row.createdByActor} id={row.createdBy}/></p>{row.status==='received'&&<p className="text-sm">{t('inventoryActors.receiver')}: <ActorName actor={row.receivedByActor} id={row.receivedBy}/></p>}</>:<p className="text-sm">{t('inventoryActors.operator')}: <ActorName actor={row.operator} id={row.staffId}/></p>}
      {row.supplier?.name&&<p className="text-xs text-gray-500">{t('inventoryFlow.supplier')}: {row.supplier.name}</p>}
    </article>)}
  </section>;
}
