import { ExpensePaymentFields } from '../../../shared/components/ExpensePaymentFields'
import { InventoryRecords } from '../components/InventoryRecords'
import { PurchasePrices } from '../../../shared/components/PurchasePrices'
import { useDialogs } from '../components/Dialogs'
import { formatQuantity } from '../utils/helpers'
import { Modal } from '../components/Modal'
import { LocalizedDateTimeInput } from '../../../shared/components/LocalizedDateTimeInput'
import { InventoryHistory } from '../components/InventoryHistory';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowDownCircle, ArrowUpCircle, ClipboardList, ShoppingCart, Package, Search, ChevronRight } from 'lucide-react';
import { useAuthStore } from '../stores/auth';
import { inventoryFlowApi, Material, defaultInventoryInputUnit, materialUnits, stockQuantity, materialName, jakartaDate } from '../services/inventoryFlow';
export function InventoryPage() {
    const dialogs=useDialogs(),[editingPurchase,setEditingPurchase]=useState<any>(null);
    const { t, i18n } = useTranslation(), { user } = useAuthStore(), [params, setParams] = useSearchParams();
    const action = params.get('action') === 'process' ? 'out' : params.get('action'), [items, setItems] = useState<Material[]>([]), [orders, setOrders] = useState<any[]>([]), [counts, setCounts] = useState<any[]>([]), [suppliers, setSuppliers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true), [error, setError] = useState(''), [message, setMessage] = useState(''), [search, setSearch] = useState(''), [category, setCategory] = useState(''), [low, setLow] = useState(false);
    const lock = useRef(false), [busy, setBusy] = useState(false), [receiveOrder, setReceiveOrder] = useState<any>(null);
    const [supplierError, setSupplierError] = useState(false);
    const [outRefresh, setOutRefresh] = useState(0);
    const [purchaseReset,setPurchaseReset]=useState(0);
    const outDone = async (text: string) => { setMessage(text); await load(); setOutRefresh(value => value + 1); };
    const refresh = async () => { await load(); setOutRefresh(value => value + 1); };
    async function loadSuppliers() { setSupplierError(false); try { const r = await inventoryFlowApi.suppliers(); setSuppliers(r.data.list); } catch { setSupplierError(true); } }
    const [receiptDates,setReceiptDates]=useState<Record<string,string>>({});
    const [receiptOccurredOn,setReceiptOccurredOn]=useState(jakartaDate);
    async function load() { setLoading(true); try {
        const [stock, purchase, count] = await Promise.all([inventoryFlowApi.list(), inventoryFlowApi.purchases(), inventoryFlowApi.counts()]);
        setItems(stock.data.list.filter((i:Material)=>i.type!=='semi_finished'||!i.processRecipeId));
        setOrders(purchase.data.list);
        setCounts(count.data.list);
        setError('');
    }
    catch {
        setError(t('inventoryFlow.failed'));
    }
    finally {
        setLoading(false);
    } }
    useEffect(() => { void load(); void loadSuppliers(); }, [user?.storeId]);
    const pending = orders.filter(o => ['pending', 'approved', 'awaiting_receipt'].includes(o.status));
    const active = counts.filter(c => ['in_progress', 'pending_review'].includes(c.status));
    const name = (item: Material) => materialName(item.name, i18n.language);
    async function receive() { if (!receiveOrder || lock.current)
        return; lock.current = true; setBusy(true); setError(''); try {
        await inventoryFlowApi.receive(receiveOrder.id,receiveOrder.items.map((item:any)=>({itemId:item.id,expiryDate:receiptDates[item.id]||undefined})),receiptOccurredOn);
        setReceiveOrder(null);
        setMessage(t('inventoryFlow.receiveSuccess'));
        await load();
        setOutRefresh(value => value + 1);
    }
    catch {
        setError(t('inventoryFlow.failed'));
    }
    finally {
        lock.current = false;
        setBusy(false);
    } }
    const done = async (text: string) => { setEditingPurchase(null);setPurchaseReset(v=>v+1);setMessage(text); await load(); setOutRefresh(value=>value+1); };
    return <main className="max-w-3xl mx-auto p-4 pb-24 space-y-5">
  <header className="flex items-center justify-between"><h1 className="text-2xl font-bold">{t(action==='in'?'inventoryFlow.stockIn':action==='out'?'inventoryFlow.stockOut':action==='purchase'?'inventoryFlow.purchase':'inventoryFlow.title')}</h1><button onClick={refresh} disabled={loading} className="text-primary-hover">{t('inventoryFlow.refresh')}</button></header>
  {error && <div role="alert" className="bg-red-50 text-red-700 p-3 rounded-xl">{error}<button className="ml-2 underline" onClick={load}>{t('inventoryFlow.retry')}</button></div>}
  {message && <p role="status" className="bg-green-50 text-green-700 p-3 rounded-xl">{message}</p>}
  {!action && <div className="grid grid-cols-2 gap-3">{[
            { key: 'in', label: 'stockIn', hint: 'inHint', Icon: ArrowDownCircle, color: 'text-primary-hover' },
            { key: 'out', label: 'stockOut', hint: 'outHint', Icon: ArrowUpCircle, color: 'text-primary-hover' },
            { key: 'count', label: 'count', hint: 'countHint', Icon: ClipboardList, color: 'text-primary-hover' },
            { key: 'purchase', label: 'purchase', hint: 'purchaseHint', Icon: ShoppingCart, color: 'text-primary-hover' }
        ].map(({ key, label, hint, Icon, color }) => <Link key={key} to={key === 'count' ? '/inventory/count' : `/inventory?action=${key}`} className={`bg-white border rounded-2xl p-4 shadow-sm ${action === key ? 'ring-2 ring-orange-400' : ''}`}><Icon size={26} className={color}/><h2 className="font-bold text-lg mt-2">{t('inventoryFlow.' + label)}</h2><p className="text-xs text-gray-500 mt-1">{t('inventoryFlow.' + hint)}</p></Link>)}</div>}
  {action === 'history' && <InventoryHistory/>}
  {loading && <p role="status">{t('inventoryFlow.loading')}</p>}
  {action && <Link className="block text-primary-hover" to="/inventory">← {t('inventoryFlow.back')}</Link>}
  {(action === 'in' || action === 'purchase' || !action) && <section className="space-y-3"><h2 className="font-bold flex gap-2 items-center"><Package size={20}/>{t('inventoryFlow.awaiting')} <span className="text-primary-hover">{pending.length}</span></h2>{!pending.length && !loading && <p className="text-sm text-gray-500">{t('inventoryFlow.noAwaiting')}</p>}{pending.map(order => <article key={order.id} className="space-y-2"><button key={order.id} onClick={() => {setReceiptDates({});setReceiptOccurredOn(jakartaDate());setReceiveOrder(order)}} className="w-full text-left bg-white border rounded-xl p-4"><div className="flex justify-between gap-2"><strong className="break-words">{order.items.map((i:any)=>materialName(i.inventory?.name||'',i18n.language)).join(' · ')}</strong><ChevronRight className="shrink-0"/></div><p className="text-sm text-gray-500">{order.supplier?.name || t('inventoryFlow.noSupplier')} {order.expectedDate && ` · ${new Date(order.expectedDate).toLocaleDateString(i18n.language)}`}</p><p className="mt-2 text-sm">{order.items.map((i: any) => `${materialName(i.inventory?.name || '', i18n.language)} ${i.inputQuantity ?? i.quantity} ${i.inputUnit || i.inventory?.unit || ''}`).join(' · ')}</p><p className="font-semibold">Rp {order.totalAmount.toLocaleString('id-ID')}</p></button>{order.createdBy===(user?.staffId||user?.id)&&<div className="flex gap-4 px-2 text-sm"><button onClick={()=>{setEditingPurchase(order);setParams({action:'purchase'})}}>{t('entryFix.edit')}</button><button disabled={busy} onClick={async()=>{if(!await dialogs.confirm(t('entryFix.refundRequired')))return;setBusy(true);try{await inventoryFlowApi.cancelPurchase(order.id,'Withdrawn by purchaser');await load()}catch(e:any){setError(e.response?.data?.message||t('inventoryFlow.failed'))}finally{setBusy(false)}}}>{t('entryFix.withdraw')}</button></div>}</article>)}</section>}
  {(action === 'in' || action === 'out') && <StockForm key={action} kind={action} items={items} onDone={action === 'out' ? outDone : done} refreshKey={outRefresh}/>}
  {action === 'purchase' && supplierError && <p role="alert" className="bg-amber-50 p-3 rounded-lg">{t('audit.supplierFailed')} <button className="underline" onClick={loadSuppliers}>{t('inventoryFlow.retry')}</button></p>}
  {action === 'purchase' && <PurchaseForm key={editingPurchase?.id||`new-${purchaseReset}`} editing={editingPurchase} onCancel={()=>setEditingPurchase(null)} items={items} suppliers={suppliers} onDone={done}/>}
  {action === 'purchase' && <InventoryRecords kind="purchase" items={items} refreshKey={outRefresh}/>}
  {!action && <><section className="space-y-2"><h2 className="font-bold">{t('inventoryFlow.activeCounts')}</h2>{!active.length && !loading && <p className="text-sm text-gray-500">{t('inventoryFlow.noCounts')}</p>}{active.map(c => <Link key={c.id} to="/inventory/count" className="block bg-white rounded-xl border p-3">{t(c.status === 'pending_review' ? 'inventoryFlow.pendingReview' : 'inventoryFlow.inProgress')} · {t('inventoryFlow.progress', { done: c.items.filter((i: any) => i.countedAt).length, total: c.items.length })}</Link>)}</section>
  <section className="space-y-3"><h2 className="font-bold">{t('inventoryFlow.inventoryList')}</h2><div className="flex gap-2 items-center bg-white rounded-xl border p-3"><Search size={18}/><input className="w-full outline-none" placeholder={t('inventoryFlow.search')} value={search} onChange={e => setSearch(e.target.value)}/></div><div className="flex gap-3 items-center"><select className="border rounded-lg p-2 min-w-0" aria-label={t('inventoryFlow.allCategories')} value={category} onChange={e => setCategory(e.target.value)}><option value="">{t('inventoryFlow.allCategories')}</option>{[...new Set(items.map(i => i.category))].map(c => <option key={c} value={c}>{t('ui.category.' + c, { defaultValue: c })}</option>)}</select><label className="text-sm"><input type="checkbox" checked={low} onChange={e => setLow(e.target.checked)}/> {t('inventoryFlow.lowStock')}</label></div>
  {!loading && !items.some(i => (!search || [i.name,name(i)].join(' ').toLowerCase().includes(search.toLowerCase())) && (!category || i.category === category) && (!low || !i.calibrationRequired && i.currentStock <= (i.effectiveSafetyStock ?? i.safetyStock))) && <p role="status" className="text-gray-500">{t('common.noData')}</p>}
  {items.filter(i => (!search || [i.name,name(i)].join(' ').toLowerCase().includes(search.toLowerCase())) && (!category || i.category === category) && (!low || !i.calibrationRequired && i.currentStock <= (i.effectiveSafetyStock ?? i.safetyStock))).map(i => <article key={i.id} className="inventory-material-row bg-white border rounded-xl p-4 flex flex-wrap justify-between items-center gap-3"><div><h3 className="font-medium">{name(i)}</h3><p className={`text-sm ${!i.calibrationRequired && i.currentStock <= (i.effectiveSafetyStock ?? i.safetyStock) ? 'text-orange-600' : 'text-gray-500'}`}>{i.actualStockPolicy&&i.calibrationRequired?'—':formatQuantity(i.currentStock, i18n.language)} {i.unit}</p>{i.calibrationRequired&&!i.actualStockPolicy&&<p className="text-xs text-amber-700">{t("inventoryUnified.calibrate")}</p>}{i.actualStockPolicy&&i.calibrationRequired&&<details className="text-xs text-gray-500"><summary className="text-amber-700">{t("inventoryUnified.calibrate")}</summary>{t("inventoryUnified.legacyBalance")}: {formatQuantity(i.currentStock,i18n.language)} {i.unit}</details>}<p className="text-xs text-gray-500">{t('inventoryAlerts.safe')}: {Number((i.effectiveSafetyStock ?? i.safetyStock).toFixed(3))} {i.unit}</p></div><div className="flex gap-3 shrink-0"><Link className="text-primary-hover text-sm" to={`/inventory?action=in&material=${i.id}`}>{t('inventoryFlow.stockIn')}</Link><Link className="text-primary-hover text-sm" to={`/inventory?action=out&material=${i.id}`}>{t('inventoryFlow.stockOut')}</Link></div></article>)}</section></>}
  {receiveOrder && <Modal className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-3" label={t('inventoryFlow.receiveAll')} onClose={busy ? undefined : () => setReceiveOrder(null)}><section className="bg-white rounded-2xl p-5 w-full max-w-lg max-h-[85vh] overflow-auto space-y-4"><h2 className="text-xl font-bold">{t('inventoryFlow.receiveAll')}</h2><p className="text-sm text-gray-500">{t('inventoryFlow.receiveHint')}</p><label className="block text-sm">{t('inventoryRecords.actualDate')}<LocalizedDateTimeInput type="date" required max={jakartaDate()} disabled={busy} className="border rounded-lg p-2 w-full mt-1" value={receiptOccurredOn} onChange={e=>setReceiptOccurredOn(e.target.value)}/></label><p className="text-xs text-gray-500">{t('inventoryRecords.hint')}</p>{receiveOrder.items.map((item: any) => <div key={item.id} className="border-b pb-2"><strong>{materialName(item.inventory?.name || '', i18n.language)}</strong><p>{item.inputQuantity ?? item.quantity} {item.inputUnit || item.inventory?.unit}</p><p className="text-sm text-gray-500">{t('inventoryFlow.converted')}: {item.quantity} {item.inventory?.unit}</p><label className="block text-sm mt-2">{t('inventoryAlerts.expiryDate')}<LocalizedDateTimeInput type="date" disabled={busy} className="border rounded-lg p-2 w-full" value={receiptDates[item.id]||''} onChange={e=>setReceiptDates({...receiptDates,[item.id]:e.target.value})}/></label></div>)}{error && <p role="alert" className="text-red-700">{error}</p>}<button className="w-full bg-primary text-white rounded-xl py-3" disabled={busy} onClick={receive}>{t(busy ? 'inventoryFlow.saving' : 'inventoryFlow.receiveAll')}</button><button className="w-full py-2" disabled={busy} onClick={() => setReceiveOrder(null)}>{t('inventoryFlow.cancel')}</button></section></Modal>}
 </main>;
}
function StockForm({ kind, items, onDone, refreshKey }: {
    kind: 'in' | 'out';
    refreshKey: number;
    items: Material[];
    onDone: (message: string) => Promise<void>;
}) {
    const { t, i18n } = useTranslation(), [params] = useSearchParams(), { user } = useAuthStore();
    const [id, setId] = useState(params.get('material') || ''), [qty, setQty] = useState(''), [unit, setUnit] = useState(''), [cost, setCost] = useState(''), [purpose, setPurpose] = useState('withdrawal'), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), lock = useRef(false);
    const [expiryDate,setExpiryDate]=useState('');
    const [occurredOn,setOccurredOn]=useState(jakartaDate);
    const formRef=useRef<HTMLFormElement>(null);
    const dialogs=useDialogs();
    const supplement=async(materialId:string,date:string)=>{
      if((qty||cost||note||expiryDate)&&!await dialogs.confirm(t('inventoryRecords.replaceDraft')))return;
      setId(materialId);setOccurredOn(date);setQty('');setCost('');setNote('');setExpiryDate('');setUnit('');setError('');
      formRef.current?.scrollIntoView({behavior:'smooth',block:'start'});formRef.current?.querySelector<HTMLInputElement>('input[type=number]')?.focus({preventScroll:true});
    };
    const material = items.find(i => i.id === id), inputUnit = unit || (material ? defaultInventoryInputUnit(material) : ''), converted = stockQuantity(material, qty, inputUnit);
    async function submit(event: React.FormEvent) { event.preventDefault(); setError(''); if (!material || !Number.isFinite(Number(qty)) || Number(qty) <= 0 || cost && (!Number.isSafeInteger(Number(cost)) || Number(cost) < 0)) {
        setError(t('inventoryFlow.invalid'));
        return;
    } if (kind === 'out' && !(purpose==='withdrawal'&&material.unifiedStock) && converted > material.currentStock) {
        setError(t('inventoryFlow.insufficient'));
        return;
    } if (kind === 'out' && purpose === 'other' && !note.trim()) {
        setError(t('inventoryFlow.otherReason'));
        return;
    } await confirm(); }
    async function confirm() { if (lock.current)
        return; lock.current = true; setBusy(true); try {
        await inventoryFlowApi.stock(kind, { inventoryId: id, storeId: user?.storeId, quantity: Number(qty), inputUnit, occurredOn, ...(kind === 'in' ? { unitCost: cost ? Number(cost) : undefined,expiryDate:expiryDate||undefined } : { reason: purpose }), note });
        await onDone(t('inventoryFlow.stockSaved'));
        setQty('');setNote('');setCost('');setExpiryDate('');setOccurredOn(jakartaDate());
    }
    catch {
        setError(t('inventoryFlow.failed'));
    }
    finally {
        lock.current = false;
        setBusy(false);
    } }
    return <><p className="text-sm text-gray-600 mb-3">{t("inventoryUnified.hint")}</p><form ref={formRef} onSubmit={submit} className="bg-white border rounded-2xl p-4 space-y-4"><label className="block">{t('inventoryRecords.actualDate')}<LocalizedDateTimeInput type="date" required max={jakartaDate()} disabled={busy} className="border rounded-lg p-3 w-full mt-1" value={occurredOn} onChange={e=>setOccurredOn(e.target.value)}/></label><p className="text-xs text-gray-500">{t('inventoryRecords.hint')}</p><label className="block">{t('inventoryFlow.material')}<select className="border rounded-lg p-3 w-full mt-1" required value={id} disabled={busy} onChange={e => { setId(e.target.value); setUnit(''); setQty(''); setCost(''); }}><option value="">{t('inventoryFlow.chooseMaterial')}</option>{items.map(i => <option key={i.id} value={i.id}>{materialName(i.name, i18n.language)}</option>)}</select></label>
 {material && <p className="bg-gray-50 rounded-lg p-3">{t(material.actualStockPolicy&&material.calibrationRequired?'inventoryUnified.legacyBalance':'inventoryUnified.estimate')}: {formatQuantity(material.currentStock, i18n.language)} {material.unit}</p>}
 <div className="grid grid-cols-2 gap-3"><label>{t('inventoryFlow.quantity')}<input type="number" min="0.000000001" step="any" required disabled={busy} className="border rounded-lg p-3 w-full mt-1" value={qty} onChange={e => { setQty(e.target.value); }}/></label><label>{t('inventoryFlow.unit')}<select aria-label={t('inventoryFlow.unit')} className="border rounded-lg p-3 w-full mt-1" value={inputUnit} disabled={busy} onChange={e => { setUnit(e.target.value); setCost(''); }}>{!material && <option value="">—</option>}{materialUnits(material).map(u => <option key={u} value={u}>{u==='bag'?t('inventoryUnified.packageBag'):u}</option>)}</select></label></div>
 {kind === 'in' ? <label className="block">{t('inventoryFlow.unitCost')} {inputUnit && `(Rp / ${inputUnit})`}<input type="number" min="0" step="1" value={cost} disabled={busy} className="border rounded-lg p-3 w-full mt-1" onChange={e => { setCost(e.target.value); }}/></label> : <label className="block">{t('inventoryFlow.purpose')}<select className="border rounded-lg p-3 w-full mt-1" value={purpose} disabled={busy} onChange={e => { setPurpose(e.target.value); }}>{['withdrawal', 'loss', 'expired', 'other'].map(p => <option key={p} value={p}>{t('inventoryFlow.' + p)}</option>)}</select></label>}
 {kind==='in'&&<label className="block">{t('inventoryAlerts.expiryDate')}<LocalizedDateTimeInput type="date" disabled={busy} className="border rounded-lg p-3 w-full mt-1" value={expiryDate} onChange={e=>setExpiryDate(e.target.value)}/><p className="text-xs text-gray-500">{t('inventoryAlerts.expiryHint')}</p></label>}
 <label className="block">{t('inventoryFlow.note')}<textarea required={kind === 'out' && purpose === 'other'} value={note} disabled={busy} className="border rounded-lg p-3 w-full mt-1" onChange={e => { setNote(e.target.value); }}/></label>
 {material && qty && <div className="bg-orange-50 p-3 rounded-xl"><p>{t('inventoryFlow.converted')}: {formatQuantity(converted, i18n.language)} {material.unit}</p><p>{t(material.actualStockPolicy&&material.calibrationRequired?'inventoryUnified.legacyAfter':'inventoryFlow.afterStock')}: {formatQuantity(material.currentStock + (kind === 'in' ? converted : purpose==='withdrawal'&&material.unifiedStock?0:-converted), i18n.language)} {material.unit}</p></div>}
 {error && <p role="alert" className="text-red-700">{error}</p>}<button disabled={busy} className="w-full bg-primary text-white rounded-xl py-3">{t(busy ? 'inventoryFlow.saving' : 'inventoryFlow.confirm')}</button>
 </form><InventoryRecords kind={kind} items={items} selectedId={id} refreshKey={refreshKey} onSupplement={supplement}/></>;
}
function PurchaseForm({items,suppliers,onDone,editing,onCancel}:{items:Material[];suppliers:any[];onDone:(text:string)=>Promise<void>;editing?:any;onCancel:()=>void}){
 const {t,i18n}=useTranslation(),{user}=useAuthStore();
 const [purchasedOn,setPurchasedOn]=useState(editing?.purchasedOn?.slice(0,10)||jakartaDate());
 const [paymentSource,setPaymentSource]=useState('online_payment'),[paidDate,setPaidDate]=useState(editing?.paidAt?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(editing.paidAt)):new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));
 const [supplierId,setSupplier]=useState(editing?.supplierId||''),[onlineOrderNumber,setOnlineOrder]=useState(editing?.onlineOrderNumber||''),[expectedDate,setExpected]=useState(editing?.expectedDate?.slice(0,10)||''),[note,setNote]=useState(editing?.note||''),[reason,setReason]=useState('');
 const [rows,setRows]=useState<Array<{inventoryId:string;quantity:string;paidAmount:string;inputUnit:string}>>(editing?editing.items.map((i:any)=>({inventoryId:i.inventoryId,quantity:String(i.inputQuantity??i.quantity),inputUnit:i.inputUnit||i.inventory?.unit,paidAmount:String(i.lineAmount??Math.round((i.inputQuantity??i.quantity)*(i.inputUnitCost??i.unitCost)))})):[{inventoryId:'',quantity:'',paidAmount:'',inputUnit:''}]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),lock=useRef(false);
 const setRow=(index:number,key:string,value:string)=>setRows(rows.map((r,i)=>i===index?{...r,[key]:value,...(key==='inventoryId'?{quantity:'',paidAmount:'',inputUnit:''}:{})}:r));
 const submit=async(e:React.FormEvent)=>{e.preventDefault();if(lock.current)return;
  if(rows.some(r=>!r.inventoryId||!items.some(i=>i.id===r.inventoryId)||!Number.isFinite(Number(r.quantity))||Number(r.quantity)<=0||r.paidAmount===''||!Number.isSafeInteger(Number(r.paidAmount))||Number(r.paidAmount)<0)||new Set(rows.map(r=>r.inventoryId)).size!==rows.length||(editing&&!reason.trim())){setError(t('inventoryFlow.invalid'));return}
  lock.current=true;setBusy(true);setError('');try{
   const data={storeId:user?.storeId,paymentSource,paidDate,purchasedOn,source:'online',supplierId:supplierId||undefined,onlineOrderNumber,expectedDate:expectedDate||undefined,note,items:rows.map(r=>({...r,quantity:Number(r.quantity),paidAmount:Number(r.paidAmount),inputUnit:r.inputUnit||defaultInventoryInputUnit(items.find(i=>i.id===r.inventoryId)!)}))};
   if(editing)await inventoryFlowApi.updatePurchase(editing.id,{...data,expectedVersion:editing.updatedAt,reason});else await inventoryFlowApi.purchase(data);
   await onDone(t('inventoryFlow.purchaseSaved'));
  }catch(e:any){setError(e.response?.data?.message||t('inventoryFlow.failed'))}finally{lock.current=false;setBusy(false)}
 };
 return <form onSubmit={submit} className="bg-white border rounded-2xl p-4 space-y-4"><h2 className="font-bold text-lg">{t(editing?'entryFix.editPurchase':'entryFix.newPurchase')}</h2><p className="text-sm text-gray-500">{t('entryFix.paymentHint')}</p><fieldset disabled={busy} className="space-y-4">
 <label className="block">{t('inventoryRecords.purchasedOn')}<LocalizedDateTimeInput type="date" required max={jakartaDate()} className="border rounded-lg p-3 w-full mt-1" value={purchasedOn} onChange={e=>setPurchasedOn(e.target.value)}/></label><p className="text-xs text-gray-500">{t('inventoryRecords.hint')}</p>
 <label className="block">{t('inventoryFlow.supplier')}<select className="border rounded-lg p-3 w-full mt-1" value={supplierId} onChange={e=>setSupplier(e.target.value)}><option value="">{t('inventoryFlow.noSupplier')}</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
 <label className="block">{t('inventoryFlow.onlineOrder')}<input className="border rounded-lg p-3 w-full mt-1" value={onlineOrderNumber} onChange={e=>setOnlineOrder(e.target.value)}/></label>
 <label className="block">{t('inventoryFlow.expectedDate')}<LocalizedDateTimeInput type="date" className="border rounded-lg p-3 w-full mt-1" value={expectedDate} onChange={e=>setExpected(e.target.value)}/></label>
 {rows.map((row,index)=>{const material=items.find(i=>i.id===row.inventoryId),unit=row.inputUnit||(material?defaultInventoryInputUnit(material):'');return <section key={index} className="border rounded-xl p-3 space-y-3">
 <label className="block">{t('inventoryFlow.material')}<select aria-label={t('inventoryFlow.material')} required className="border rounded-lg p-2 w-full" value={row.inventoryId} onChange={e=>setRow(index,'inventoryId',e.target.value)}><option value="">{t('inventoryFlow.chooseMaterial')}</option>{items.map(i=><option key={i.id} value={i.id}>{materialName(i.name,i18n.language)}</option>)}</select></label>
 <div className="grid grid-cols-2 gap-3"><label>{t('entryFix.quantity')}<input aria-label={t('entryFix.quantity')} required type="number" min="0.000000001" step="any" className="border rounded-lg p-2 w-full" value={row.quantity} onChange={e=>setRow(index,'quantity',e.target.value)}/></label><label>{t('entryFix.unit')}<select aria-label={t('entryFix.unit')} className="border rounded-lg p-2 w-full" disabled={!material} value={unit} onChange={e=>setRow(index,'inputUnit',e.target.value)}>{materialUnits(material).map(u=><option key={u}>{u}</option>)}</select></label></div>
 <label className="block">{t('entryFix.paidAmount')} (Rp)<input aria-label={t('entryFix.paidAmount')+' (Rp)'} required type="number" min="0" step="1" className="border rounded-lg p-2 w-full" value={row.paidAmount} onChange={e=>setRow(index,'paidAmount',e.target.value)}/></label>
 <PurchasePrices quantity={Number(row.quantity)} paidAmount={row.paidAmount===''?NaN:Number(row.paidAmount)} ledgerQuantity={stockQuantity(material,row.quantity,unit)} unit={unit} ledgerUnit={material?.unit||''}/>
 {rows.length>1&&<button type="button" className="text-red-600" onClick={()=>setRows(rows.filter((_,i)=>i!==index))}>{t('inventoryFlow.remove')}</button>}</section>})}
 <button type="button" className="text-primary-hover" onClick={()=>setRows([...rows,{inventoryId:'',quantity:'',paidAmount:'',inputUnit:''}])}>+ {t('inventoryFlow.addItem')}</button>
 <label className="block">{t('inventoryFlow.note')}<textarea className="border rounded-lg p-3 w-full" value={note} onChange={e=>setNote(e.target.value)}/></label>
 {editing&&<label className="block">{t('entryFix.reason')}<textarea required className="border rounded-lg p-3 w-full" value={reason} onChange={e=>setReason(e.target.value)}/></label>}
 <ExpensePaymentFields fixedSource source="online_payment" onSource={setPaymentSource} date={paidDate} onDate={setPaidDate} disabled={!!editing?.paidAt}/>
 <p className="font-bold">{t('inventoryFlow.total')}: Rp {rows.reduce((sum,r)=>sum+Number(r.paidAmount||0),0).toLocaleString(i18n.language)}</p><p className="text-sm text-gray-500">{t('entryFix.stockHint')}</p></fieldset>
 {error&&<p role="alert" className="text-red-700">{error}</p>}<button disabled={busy} className="w-full bg-primary text-white rounded-xl py-3">{t(busy?'inventoryFlow.saving':editing?'entryFix.save':'entryFix.newPurchase')}</button>{editing&&<button disabled={busy} type="button" onClick={onCancel}>{t('inventoryFlow.cancel')}</button>}</form>
}
