import { InventoryRecords } from '../components/InventoryRecords'
import { InventoryCountReviewHistory } from '../../../shared/components/InventoryCountReviewHistory';
import { InventoryCountProgress } from '../../../shared/components/InventoryCountProgress';
import { InventoryCountResults } from '../../../shared/components/InventoryCountResults';
import { formatQuantity } from '../utils/helpers'
import { inventoryInputUnits, inventoryUnitFactor, inventoryLedgerQuantity } from '../utils/inventoryInputUnits';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/auth';
import { InventoryCountEditor } from '../../../shared/components/InventoryCountEditor';
import { inventoryCountLabels } from '../../../shared/inventoryCountLabels';
import { inventoryFlowApi, Material, jakartaDate, materialName } from '../services/inventoryFlow';
export function InventoryCountPage() {
    const { t, i18n } = useTranslation(), { user } = useAuthStore(), [dirty, setDirty] = useState(false), [selectionSearch, setSelectionSearch] = useState(''), [counts, setCounts] = useState<any[]>([]), [items, setItems] = useState<Material[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(true), [creating, setCreating] = useState(false), [all, setAll] = useState(true), [selection, setSelection] = useState<string[]>([]), [busy, setBusy] = useState(false), lock = useRef(false);
    async function load() { setLoading(true); try {
        const [result, stock] = await Promise.all([inventoryFlowApi.counts(), inventoryFlowApi.list()]);
        setCounts(result.data.list || []);
        setItems((stock.data.list || []).filter((i:Material)=>i.type!=='semi_finished'||!i.processRecipeId));
        setError('');
        return result.data.list || [];
    }
    catch {
        setError(t('inventoryFlow.failed'));
        throw new Error('COUNT_LOAD_FAILED');
    }
    finally {
        setLoading(false);
    } }
    useEffect(() => { void load().catch(() => {}); }, [user?.storeId]);
    async function start(event: React.FormEvent) { event.preventDefault(); if (lock.current)
        return; if (!all && !selection.length) {
        setError(t('inventoryFlow.invalid'));
        return;
    } lock.current = true; setBusy(true); try {
        await inventoryFlowApi.startCount({ storeId: user?.storeId, period: 'ad_hoc', startDate: jakartaDate(), endDate: jakartaDate(), ...(all ? {} : { inventoryIds: selection }) });
        setCreating(false);
        await load();
    }
    catch {
        setError(t('inventoryFlow.failed'));
    }
    finally {
        lock.current = false;
        setBusy(false);
    } }
    const labels=inventoryCountLabels(i18n.language);
    const selectionItems=items.filter(i=>[i.name,materialName(i.name,i18n.language)].join(' ').toLowerCase().includes(selectionSearch.toLowerCase().trim()));
    const [historyRefresh,setHistoryRefresh]=useState(0);
    const active = counts.some(c => ['in_progress', 'pending_review'].includes(c.status));
    return <main className="max-w-3xl mx-auto p-4 pb-24 space-y-4"><div className="flex justify-between items-center"><h1 className="text-2xl font-bold">{t('inventoryFlow.count')}</h1><button onClick={() => { void load().catch(() => {}); }} disabled={loading || dirty || busy} className="text-primary-hover">{t('inventoryFlow.refresh')}</button></div><p className="text-sm text-gray-500">{t('inventoryFlow.reviewHint')}</p>
 {error && <p role="alert" className="text-red-700">{error}</p>}{loading && <p role="status">{t('inventoryFlow.loading')}</p>}
 <button onClick={() => setCreating(!creating)} disabled={active || loading || busy} className="bg-primary text-white rounded-xl p-3 disabled:opacity-50">+ {t('inventoryFlow.newCount')}</button>
 {active && <p role="status" className="text-sm text-gray-600">{t('ui.activeCountHint')}</p>}
 {creating && <form onSubmit={start} className="bg-white border rounded-2xl p-4 space-y-3"><fieldset disabled={busy} className="space-y-3"><label className="block"><input type="radio" checked={all} onChange={() => setAll(true)}/> {t('inventoryFlow.selectAll')}</label><label className="block"><input type="radio" checked={!all} onChange={() => setAll(false)}/> {t('inventoryFlow.selectSome')}</label>{!all && <div className="space-y-2"><p className="text-sm text-gray-600">{labels.selectHint}</p><input aria-label={labels.search} placeholder={labels.search} className="border rounded-lg p-3 w-full" value={selectionSearch} onChange={e=>setSelectionSearch(e.target.value)}/><div className="flex flex-wrap gap-3 text-sm"><button type="button" className="text-primary-hover" onClick={()=>setSelection(Array.from(new Set([...selection,...selectionItems.map(i=>i.id)])))}>{labels.selectVisible}</button><button type="button" onClick={()=>setSelection([])}>{labels.clear}</button><span>{labels.selected.replace('{count}',String(selection.length))}</span></div><div className="max-h-64 overflow-y-auto space-y-2">{selectionItems.map(i => <label key={i.id} className="block"><input type="checkbox" checked={selection.includes(i.id)} onChange={e => setSelection(e.target.checked ? [...selection, i.id] : selection.filter(id => id !== i.id))}/> {materialName(i.name, i18n.language)} ({i.unit})</label>)}</div></div>}<button className="bg-primary text-white rounded-lg p-3">{t(busy ? 'inventoryFlow.saving' : 'inventoryFlow.newCount')}</button></fieldset></form>}
 {!counts.length && !loading && <p>{t('inventoryFlow.noCounts')}</p>}
 {counts.filter(count=>['in_progress','pending_review'].includes(count.status)).map(count => <section key={count.id} data-notice-object={count.id} data-notice-status={count.status} className="space-y-3 border rounded-2xl p-4 bg-gray-50"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-bold">{t(count.period === 'ad_hoc' ? 'inventoryFlow.adHoc' : 'countFlow.title')} · {new Date(count.createdAt).toLocaleDateString(i18n.language)}</h2><span className={`text-sm px-2 py-1 rounded ${count.status === 'completed' ? 'bg-green-50 text-green-700' : count.status === 'pending_review' ? 'bg-amber-50 text-amber-700' : count.status === 'cancelled' ? 'bg-gray-100 text-gray-600' : 'bg-primary-light text-primary-hover'}`}>{t('inventoryFlow.' + ({ in_progress: 'inProgress', pending_review: 'pendingReview', completed: 'completed', cancelled: 'cancelled' }[count.status as string] || 'inProgress'))}</span></div><InventoryCountReviewHistory history={count.reviewHistory} status={count.status} language={i18n.language}/>{count.status!=='in_progress'&&<InventoryCountProgress items={count.items} language={i18n.language}/>}{count.status === 'in_progress' ? <><p className="text-sm text-amber-800">{t("inventoryUnified.count")}</p><InventoryCountEditor key={count.id} data-notice-object={count.id} data-notice-status={count.status} items={count.items} language={i18n.language} name={materialName} units={inventoryInputUnits} factor={inventoryUnitFactor} ledger={inventoryLedgerQuantity} onDirtyChange={setDirty} onSubmit={async changes=>{const result=await inventoryFlowApi.submitCount(count.id,changes);setCounts(previous=>previous.map(c=>c.id===count.id?{...c,...result.data}:c));setDirty(false);setHistoryRefresh(v=>v+1);}} onSave={async changes=>{await inventoryFlowApi.saveCount(count.id,changes);await load();}} onReload={async()=>{const fresh=await load();return fresh.find((c:any)=>c.id===count.id)?.items||[];}}/></> : <details><summary className="cursor-pointer py-3">{t('audit.countDetails')}</summary><InventoryCountResults items={count.items} language={i18n.language} name={materialName} quantity={value=>formatQuantity(value,i18n.language)}/></details>}{count.status === 'pending_review' && <p className="text-sm text-gray-500">{t('inventoryFlow.frozen')}</p>}</section>)}
 <InventoryRecords kind="count" items={items} refreshKey={historyRefresh}/>
 </main>;
}
