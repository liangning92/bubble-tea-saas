import { ActorName } from '../components/InventoryActor';
import { inventoryInputUnits, defaultInventoryInputUnit, inventoryUnitFactor, inventoryLedgerQuantity } from '../utils/inventoryInputUnits';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/auth';
import { staffApi } from '../services/api';
import { inventoryFlowApi, Material, jakartaDate, materialName } from '../services/inventoryFlow';
export function InventoryCountPage() {
    const { t, i18n } = useTranslation(), { user } = useAuthStore(), [counts, setCounts] = useState<any[]>([]), [items, setItems] = useState<Material[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(true), [creating, setCreating] = useState(false), [all, setAll] = useState(true), [selection, setSelection] = useState<string[]>([]), [busy, setBusy] = useState(false), lock = useRef(false);
    async function load() { setLoading(true); try {
        const [result, stock] = await Promise.all([inventoryFlowApi.counts(), inventoryFlowApi.list()]);
        setCounts(result.data.list || []);
        setItems((stock.data.list || []).filter((i:Material)=>i.type!=='semi_finished'||!i.processRecipeId));
        setError('');
    }
    catch {
        setError(t('inventoryFlow.failed'));
    }
    finally {
        setLoading(false);
    } }
    useEffect(() => { void load(); }, [user?.storeId]);
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
    async function submit(id: string) { if (lock.current)
        return; lock.current = true; setBusy(true); try {
        await inventoryFlowApi.submitCount(id);
        await load();
    }
    catch {
        setError(t('inventoryFlow.failed'));
    }
    finally {
        lock.current = false;
        setBusy(false);
    } }
    const active = counts.some(c => ['in_progress', 'pending_review'].includes(c.status));
    return <main className="max-w-3xl mx-auto p-4 pb-24 space-y-4"><Link className="text-orange-600" to="/inventory">← {t('inventoryFlow.back')}</Link><div className="flex justify-between items-center"><h1 className="text-2xl font-bold">{t('inventoryFlow.count')}</h1><button onClick={load} disabled={loading} className="text-orange-600">{t('inventoryFlow.refresh')}</button></div><p className="text-sm text-gray-500">{t('inventoryFlow.reviewHint')}</p>
 {error && <p role="alert" className="text-red-700">{error}</p>}{loading && <p>{t('inventoryFlow.loading')}</p>}
 <button onClick={() => setCreating(!creating)} disabled={active || loading || busy} className="bg-blue-600 text-white rounded-xl p-3 disabled:opacity-50">+ {t('inventoryFlow.newCount')}</button>
 {creating && <form onSubmit={start} className="bg-white border rounded-2xl p-4 space-y-3"><fieldset disabled={busy} className="space-y-3"><label className="block"><input type="radio" checked={all} onChange={() => setAll(true)}/> {t('inventoryFlow.selectAll')}</label><label className="block"><input type="radio" checked={!all} onChange={() => setAll(false)}/> {t('inventoryFlow.selectSome')}</label>{!all && <div className="max-h-64 overflow-y-auto space-y-2">{items.map(i => <label key={i.id} className="block"><input type="checkbox" checked={selection.includes(i.id)} onChange={e => setSelection(e.target.checked ? [...selection, i.id] : selection.filter(id => id !== i.id))}/> {materialName(i.name, i18n.language)} ({i.unit})</label>)}</div>}<button className="bg-blue-600 text-white rounded-lg p-3">{t(busy ? 'inventoryFlow.saving' : 'inventoryFlow.newCount')}</button></fieldset></form>}
 {!counts.length && !loading && <p>{t('inventoryFlow.noCounts')}</p>}
 {counts.map(count => <section key={count.id} className="space-y-3 border rounded-2xl p-4 bg-gray-50"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-bold">{t(count.period === 'ad_hoc' ? 'inventoryFlow.adHoc' : 'countFlow.title')} · {new Date(count.createdAt).toLocaleDateString(i18n.language)}</h2><span className="text-sm text-blue-700">{t('inventoryFlow.' + ({ in_progress: 'inProgress', pending_review: 'pendingReview', completed: 'completed', cancelled: 'cancelled' }[count.status as string] || 'inProgress'))}</span></div><p className="text-sm text-gray-500">{t('inventoryFlow.progress', { done: count.items.filter((i: any) => i.countedAt).length, total: count.items.length })}</p>{count.status === 'in_progress' ? count.items.map((item: any) => <CountRow key={item.id} countId={count.id} item={item} reload={load}/>) : count.items.map((item: any) => <div key={item.id} className="bg-white rounded-xl p-3"><strong>{materialName(item.inventory.name, i18n.language)}</strong><p>{t('inventoryFlow.actualCount')}: {item.countedQty ?? '—'} {item.inventory.unit}</p><p className="text-sm text-gray-500">{t('inventoryActors.counter')}: <ActorName actor={item.countedByActor} id={item.countedBy}/>{item.countedAt && ` · ${new Date(item.countedAt).toLocaleString(i18n.language)}`}</p><p className="text-sm text-gray-500">{item.note}</p></div>)}{count.status === 'in_progress' && <button onClick={() => submit(count.id)} disabled={busy || count.items.some((i: any) => !i.countedAt)} className="bg-blue-600 text-white rounded-xl p-3 w-full disabled:opacity-50">{t(busy ? 'inventoryFlow.saving' : 'inventoryFlow.submitReview')}</button>}{count.status === 'pending_review' && <p className="text-sm text-gray-500">{t('inventoryFlow.frozen')}</p>}</section>)}
 </main>;
}
function CountRow({ countId, item, reload }: {
    countId: string;
    item: any;
    reload: () => Promise<void>;
}) {
    const { t, i18n } = useTranslation(), [inputUnit, setInputUnit] = useState(() => defaultInventoryInputUnit(item.inventory)), [quantity, setQuantity] = useState(() => item.countedQty == null ? '' : String(item.countedQty / inventoryUnitFactor(item.inventory, defaultInventoryInputUnit(item.inventory)))), [reason, setReason] = useState(item.note || ''), [error, setError] = useState(''), [busy, setBusy] = useState(false), lock = useRef(false);
    async function submit(event: React.FormEvent) { event.preventDefault(); if (lock.current)
        return; setError(''); const qty = inventoryLedgerQuantity(Number(quantity), item.inventory, inputUnit); if (quantity === '' || !Number.isFinite(qty) || qty < 0) {
        setError(t('inventoryFlow.invalid'));
        return;
    } if (qty !== item.inventory.currentStock && !reason.trim()) {
        setError(t('inventoryFlow.reasonRequired'));
        return;
    } lock.current = true; setBusy(true); try {
        await staffApi.recordInventoryCount(countId, item.id, { countedQty: qty, note: reason, expectedStock: item.inventory.currentStock, observedVersion: item.inventory.updatedAt });
        await reload();
    }
    catch {
        setError(t('inventoryFlow.failed'));
    }
    finally {
        lock.current = false;
        setBusy(false);
    } }
    return <form onSubmit={submit} className="bg-white rounded-xl border p-3 space-y-3"><h3 className="font-medium">{materialName(item.inventory.name, i18n.language)} ({item.inventory.unit}) {item.countedAt && <span className="text-green-600 text-xs">{t('inventoryFlow.saved')}</span>}</h3><p className="text-sm text-gray-500">{t('countFlow.theory')}: {item.countedAt ? item.systemQty : item.inventory.currentStock} {item.inventory.unit}</p>{item.countedAt && <p className="text-sm text-gray-500">{t('inventoryActors.counter')}: <ActorName actor={item.countedByActor} id={item.countedBy}/> · {new Date(item.countedAt).toLocaleString(i18n.language)}</p>}<label className="block">{t('inventoryFlow.unit')}<select aria-label={t('inventoryFlow.unit')} className="border rounded-lg p-3 w-full mt-1" value={inputUnit} disabled={busy} onChange={e => { if (quantity !== '' && Number.isFinite(Number(quantity))) setQuantity(String(inventoryLedgerQuantity(Number(quantity), item.inventory, inputUnit) / inventoryUnitFactor(item.inventory, e.target.value))); setInputUnit(e.target.value); }}>{inventoryInputUnits(item.inventory).map(unit => <option key={unit}>{unit}</option>)}</select></label><label className="block">{t('inventoryFlow.actualCount')} ({inputUnit})<input type="number" min="0" step="any" className="border rounded-lg p-3 w-full mt-1" required value={quantity} onChange={e => setQuantity(e.target.value)} disabled={busy}/></label><label className="block">{t('inventoryFlow.differenceReason')}<input className="border rounded-lg p-3 w-full mt-1" value={reason} onChange={e => setReason(e.target.value)} disabled={busy}/></label><button className="bg-blue-600 text-white px-4 py-2 rounded-lg" disabled={busy}>{t(busy ? 'inventoryFlow.saving' : 'inventoryFlow.save')}</button>{error && <p role="alert" className="text-red-700">{error} <button type="button" className="underline" onClick={reload}>{t('inventoryFlow.refresh')}</button></p>}</form>;
}
