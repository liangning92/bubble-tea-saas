import { Link } from 'react-router-dom'
import { useStoreDateSettings } from '../../hooks/useStoreDateSettings'
import { storeCalendarDate } from '../../utils/storeDateTime'
import { summarizePurchases } from '../../utils/purchaseSummary'
import { ReferenceDetails } from '../../components/ReferenceDetails'
import { PurchasePrices } from '../../../../shared/components/PurchasePrices'
import { inventoryInputUnits,defaultInventoryInputUnit,inventoryLedgerQuantity } from '../../utils/inventoryInputUnits'
import { confirmAdmin } from '../../components/AdminFeedback'
import { AdminDialog } from '../../components/AdminDialog'
import { LocalizedDateTimeInput } from '../../components/LocalizedDateTimeInput'
import { ActorName, InventoryActor } from '../../components/InventoryActor';
import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { purchaseOrderApi, supplierApi, inventoryApi } from '../../services/api'
import { formatItemName } from '../../utils/helpers'
import { Plus, Package, Truck, CheckCircle, XCircle, Clock } from 'lucide-react'

interface PurchaseOrderItem {
  id: string
  inventoryId: string
  inventory?: { name: string; unit: string }
  quantity: number
  unitCost: number
  inputQuantity?: number | null
  inputUnit?: string | null
  inputUnitCost?: number | null
  lineAmount?: number | null
  receivedQty: number
}

interface PurchaseOrder {
  id: string
  orderNumber: string
  createdBy?: string
  receivedBy?: string
  createdByActor?: InventoryActor | null
  receivedByActor?: InventoryActor | null
  supplierId?: string
  onlineOrderNumber?: string
  supplier?: { name: string }
  status: string
  totalAmount: number
  expectedDate?: string
  receivedDate?: string
  note?: string
  items: PurchaseOrderItem[]
  refunded?: boolean
  financeExpenseId?: string | null
  paidAt?: string | null
  updatedAt: string
  createdAt: string
}

interface Supplier {
  id: string
  name: string
}

interface Inventory {
  id: string
  name: string
  unit: string
  currentStock: number
  packaging?: {unit:string;quantity:number;baseUnit:string}|null
}

const STATUS_CONFIG: Record<string, { labelKey: string; color: string; icon: any }> = {
  awaiting_receipt: { labelKey: 'inventoryFlow.awaiting', color: 'bg-blue-100 text-blue-700', icon: Truck },
  pending: { labelKey: 'inventoryFlow.pending', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  approved: { labelKey: 'inventoryFlow.approved', color: 'bg-blue-100 text-blue-700', icon: CheckCircle },
  received: { labelKey: 'inventoryFlow.received', color: 'bg-green-100 text-green-700', icon: Package },
  cancelled: { labelKey: 'purchases.cancelled', color: 'bg-gray-100 text-gray-500', icon: XCircle }
}

export function PurchaseOrderListPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuthStore()
  const dateSettings = useStoreDateSettings()
  const [today, setToday] = useState(() => storeCalendarDate(new Date(), dateSettings.timezone))
  useEffect(() => {
    const tick = () => setToday(storeCalendarDate(new Date(), dateSettings.timezone))
    tick(); const timer = window.setInterval(tick, 30000)
    window.addEventListener('focus', tick)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', tick) }
  }, [dateSettings.timezone])

  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [inventory, setInventory] = useState<Inventory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing,setEditing]=useState<PurchaseOrder|null>(null)
  const [reason,setReason]=useState('')
  const [confirmingPayment,setConfirmingPayment]=useState<PurchaseOrder|null>(null)
  const [paidDate,setPaidDate]=useState('')
  const [viewMode,setViewMode]=useState<'list'|'board'>('board')
  const [command,setCommand]=useState<{order:PurchaseOrder;action:'reverse'|'refund'}|null>(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [search,setSearch]=useState('')
  const createRequest = useRef(crypto.randomUUID())
  const actionLock = useRef(new Set<string>())
  const [busyOrders, setBusyOrders] = useState(new Set<string>())
  const [actionError, setActionError] = useState('')

  const [formData, setFormData] = useState({
    supplierId: '',
    expectedDate: '',
    note: '',
    items: [{ inventoryId: '', quantity: '1', paidAmount: '', inputUnit: '' }]
  })

  useEffect(() => {
    loadData()
  }, [user])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const storeId = user?.storeId as string | undefined
      const [ordersRes, suppliersRes, inventoryRes] = await Promise.all([
        purchaseOrderApi.list(),
        supplierApi.getDropdown(storeId),
        inventoryApi.list({ storeId })
      ])
      setOrders(ordersRes.data?.data?.list || [])
      setSuppliers(suppliersRes.data?.data?.list || [])
      setInventory((inventoryRes.data?.data?.list || []).filter((i:any)=>i.type!=='semi_finished'||!i.processRecipeId))
    } catch (error) {
      setActionError(t('entryFix.error'))
      console.error('Failed to load data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    if (actionLock.current.has('new')) return
    setActionError('')
    const validItems = formData.items.filter(item => item.inventoryId && inventory.some(inv=>inv.id===item.inventoryId) && Number(item.quantity)>0 && item.paidAmount!=='' && Number.isSafeInteger(Number(item.paidAmount)) && Number(item.paidAmount)>=0).map(item=>({...item,quantity:Number(item.quantity),paidAmount:Number(item.paidAmount),inputUnit:item.inputUnit||defaultInventoryInputUnit(inventory.find(inv=>inv.id===item.inventoryId)!)}))
    if (validItems.length !== formData.items.length) {
      setActionError(t('inventoryFlow.invalid'))
      return
    }
    if(editing&&!reason.trim()){setActionError(t('entryFix.reason'));return}
    actionLock.current.add('new')
    setBusyOrders(new Set(actionLock.current))
    try {
      const save=editing?(data:any)=>purchaseOrderApi.update(editing.id,{...data,expectedVersion:editing.updatedAt,reason}):purchaseOrderApi.create
      await save({
        requestId: createRequest.current, storeId: user?.storeId, supplierId: formData.supplierId || undefined,
        expectedDate: formData.expectedDate || undefined, note: formData.note, items: validItems
      })
      setShowModal(false)
      setEditing(null)
      setReason('')
      resetForm()
      createRequest.current = crypto.randomUUID()
      await loadData()
    } catch (error: any) {
      setActionError(error.response?.data?.message || t('purchases.failedCreate'))
    } finally {
      actionLock.current.delete('new')
      setBusyOrders(new Set(actionLock.current))
    }
  }

  const resetForm = () => {
    setFormData({
      supplierId: '',
      expectedDate: '',
      note: '',
      items: [{ inventoryId: '', quantity: '1', paidAmount: '', inputUnit: '' }]
    })
  }

  const runOrderAction = async (id: string, action: () => Promise<unknown>) => {
    if (actionLock.current.has(id)) return
    actionLock.current.add(id)
    setBusyOrders(new Set(actionLock.current))
    setActionError('')
    try {
      await action()
      await loadData()
    } catch (error: any) {
      setActionError(error.response?.data?.message || t('purchases.failedUpdate'))
      await loadData()
    } finally {
      actionLock.current.delete(id)
      setBusyOrders(new Set(actionLock.current))
    }
  }

  const handleStatusChange = async (id: string, status: string) => {
    if(status==='received'&&!await confirmAdmin(t('inventoryFlow.confirmReceive')))return
    return runOrderAction(id, () => status === 'received' ? purchaseOrderApi.receive(id) : purchaseOrderApi.updateStatus(id, status))
  }

  const handleCancel = async (id: string) => {
    if (!await confirmAdmin(t('purchases.confirmCancel'))) return
    return runOrderAction(id, () => purchaseOrderApi.cancel(id, 'Dibatalkan oleh admin'))
  }

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { inventoryId: '', quantity: '1', paidAmount: '', inputUnit: '' }]
    })
  }

  const removeItem = (index: number) => {
    if (formData.items.length > 1) {
      setFormData({
        ...formData,
        items: formData.items.filter((_, i) => i !== index)
      })
    }
  }

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...formData.items]
    newItems[index] = { ...newItems[index], [field]: value }
    setFormData({ ...formData, items: newItems })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      maximumFractionDigits: 0,
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  }

  const getTotalAmount = () => {
    return formData.items.reduce((sum,item)=>sum+Number(item.paidAmount||0),0)
  }

  const editOrder=(order:PurchaseOrder)=>{setEditing(order);setReason('');setActionError('');setFormData({supplierId:order.supplierId||'',expectedDate:order.expectedDate?.slice(0,10)||'',note:order.note||'',items:order.items.map(i=>({inventoryId:i.inventoryId,quantity:String(i.inputQuantity??i.quantity),inputUnit:i.inputUnit||i.inventory?.unit||'',paidAmount:String(i.lineAmount??Math.round((i.inputQuantity??i.quantity)*(i.inputUnitCost??i.unitCost)))}))});setShowModal(true)}
  const summary = summarizePurchases(orders, today, dateSettings.timezone)
  const visibleOrders=orders.filter(o=>(!filterStatus || (filterStatus==='awaiting_receipt' ? ['pending','approved','awaiting_receipt'].includes(o.status) : o.status===filterStatus)) && (!search||[o.supplier?.name,o.orderNumber,o.onlineOrderNumber,...o.items.map(i=>formatItemName(i.inventory?.name||'',i18n.language))].join(' ').toLowerCase().includes(search.toLowerCase())))
  const rank=(o:PurchaseOrder)=>o.status==='awaiting_receipt'||o.status==='approved'?0:o.status==='pending'?1:o.status==='received'?2:3
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center justify-end">
          <button
            onClick={() => { setEditing(null);resetForm();setReason('');setActionError(''); setShowModal(true) }}
            disabled={isLoading} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover text-sm font-medium flex items-center gap-1"
          >
            <Plus size={18} />
            {t('purchases.createPO')}
          </button>
        </div>
      </header>

      {/* Filter */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border p-1" role="group" aria-label={t('entryFix.view')}>{(['board','list'] as const).map(v=><button key={v} aria-pressed={viewMode===v} onClick={()=>setViewMode(v)} className={`px-3 py-1 rounded ${viewMode===v?'bg-primary text-white':''}`}>{t('entryFix.'+v)}</button>)}</div>
<input className="p-2 border rounded-lg min-w-0 flex-1" aria-label={t('entryFix.search')} placeholder={t('entryFix.search')} value={search} onChange={e=>setSearch(e.target.value)}/>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="p-2 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">{t('purchases.allStatus')}</option>
            <option value="awaiting_receipt">{t('inventoryFlow.awaiting')}</option>
            <option value="pending">{t('inventoryFlow.pending')}</option>
            <option value="approved">{t('purchases.approved')}</option>
            <option value="received">{t('purchases.received')}</option>
            <option value="cancelled">{t('purchases.cancelled')}</option>
          </select>
        </div>
      </div>

      {!showModal && actionError && <div role="alert" className="mx-4 mt-4 p-3 bg-red-50 text-red-700 rounded-lg">{actionError}<button className="underline ml-3" onClick={()=>{setActionError('');void loadData()}}>{t('common.refresh')}</button></div>}

      <section aria-label={t('purchaseBoard.summary')} className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 pb-0">
        <div className="bg-white border rounded-xl p-4 min-w-0"><p className="text-sm text-gray-500">{t('inventoryFlow.awaiting')}</p><strong className="text-2xl tabular-nums">{summary.awaiting}</strong><p className="text-xs text-gray-500 mt-1">{t('purchaseBoard.orders')}</p></div>
        <div className="bg-white border rounded-xl p-4 min-w-0"><p className="text-sm text-gray-500">{t('purchaseBoard.today')}</p><strong className="text-2xl tabular-nums break-words">{formatCurrency(summary.todayAmount)}</strong><p className="text-xs text-gray-500 mt-1">{today}</p></div>
        <div className="bg-white border rounded-xl p-4 min-w-0"><p className="text-sm text-gray-500">{t('purchaseBoard.month')}</p><strong className="text-2xl tabular-nums break-words">{formatCurrency(summary.monthAmount)}</strong><p className="text-xs text-gray-500 mt-1">{today.slice(0,7)}</p></div>
      </section>
      <div className="px-4 pt-2 text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1"><p>{t('purchaseBoard.basis')}</p><Link to="/finance/expenses" className="text-primary underline">{t('purchaseBoard.finance')}</Link></div>
      {/* Content */}
      <div className={viewMode==='board'?"p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start":"p-4 space-y-4"}>
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">{t('common.loading')}</div>
        ) : visibleOrders.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl">
            <p className="text-gray-500">{t('purchases.noData')}</p>
          </div>
        ) : (
          (viewMode==='board'?[0,1,2,3]:[-1]).map(lane=><section key={lane} className="min-w-0 space-y-3">{lane>=0&&<h2 className="font-semibold flex justify-between px-1">{t(['inventoryFlow.awaiting','inventoryFlow.pending','inventoryFlow.received','purchases.cancelled'][lane])}<span>{visibleOrders.filter(o=>rank(o)===lane).length}</span></h2>}{visibleOrders.filter(o=>lane===-1||rank(o)===lane).map((order) => {
            const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending
            const StatusIcon = statusConfig.icon

            return (
              <div key={order.id} className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                  <div>
                    <h3 className="font-bold text-gray-900 text-base break-words">{order.items.map(i=>formatItemName(i.inventory?.name||t('purchases.items'),i18n.language)).join(' · ')}</h3><ReferenceDetails value={order.onlineOrderNumber||order.orderNumber}/><p className="text-xs text-gray-500 mt-1">{t(order.refunded?'entryFix.refundDone':order.financeExpenseId?'entryFix.financeLinked':'entryFix.paymentUnconfirmed')}</p>{order.financeExpenseId&&<Link to={'/finance/expenses?purchase='+encodeURIComponent(order.id)} className="text-xs text-primary underline">{t('purchaseBoard.viewExpense')}</Link>}
                    <p className="text-sm text-gray-500">{order.supplier?.name || t('purchases.supplier')}</p>
                    <p className="text-sm text-gray-500 mt-1">{t('inventoryActors.buyer')}: <ActorName actor={order.createdByActor} id={order.createdBy}/></p>
                    {order.status === 'received' && <p className="text-sm text-gray-500">{t('inventoryActors.receiver')}: <ActorName actor={order.receivedByActor} id={order.receivedBy}/></p>}
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusConfig.color} flex items-center gap-1`}>
                    <StatusIcon size={14} />
                    {t(statusConfig.labelKey)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                  <div>
                    <p className="text-gray-500">{t('purchases.total')}</p>
                    <p className="font-bold text-lg">{formatCurrency(order.totalAmount)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">{t('purchases.poDate')}</p>
                    <p className="font-medium">{formatDate(order.createdAt)}</p>
                  </div>
                  {order.expectedDate && (
                    <div>
                      <p className="text-gray-500">{t('purchases.expected')}</p>
                      <p className="font-medium">{formatDate(order.expectedDate)}</p>
                    </div>
                  )}
                </div>

               <div className="border-t pt-3">
                  <p className="text-sm text-gray-500 mb-2">{order.items.length} {t('purchases.itemCount')}</p>
                  <div className="space-y-1">
                    {order.items.map((item) => (
                      <div key={item.id} className="border-b last:border-0 py-2 text-sm min-w-0"><p className="font-medium break-words">{formatItemName(item.inventory?.name||t('purchases.items'),i18n.language)}</p><p className="text-primary font-semibold">{(item.inputQuantity??item.quantity).toLocaleString(i18n.language,{maximumFractionDigits:9})} {item.inputUnit||item.inventory?.unit} · {formatCurrency(item.lineAmount??Math.round((item.inputQuantity??item.quantity)*(item.inputUnitCost??item.unitCost)))}</p><PurchasePrices quantity={item.inputQuantity??item.quantity} paidAmount={item.lineAmount??Math.round((item.inputQuantity??item.quantity)*(item.inputUnitCost??item.unitCost))} ledgerQuantity={item.quantity} unit={item.inputUnit||item.inventory?.unit||''} ledgerUnit={item.inventory?.unit||''}/></div>
                    ))}

                  </div>
                </div>

                {order.status==='received'&&<button disabled={busyOrders.has(order.id)} className="text-sm text-amber-700 mt-3" onClick={()=>{setCommand({order,action:'reverse'});setReason('')}}>{t('entryFix.reverseReceipt')}</button>}
                {order.status==='cancelled'&&order.paidAt&&!order.refunded&&<button disabled={busyOrders.has(order.id)} className="text-sm text-amber-700 mt-3" onClick={()=>{setCommand({order,action:'refund'});setReason('')}}>{t('entryFix.refund')}</button>}
                {!order.paidAt&&order.status!=='cancelled'&&['admin','manager'].includes(user?.role||'')&&<button className="text-sm text-primary underline mt-3" onClick={()=>{setConfirmingPayment(order);setPaidDate(storeCalendarDate(order.createdAt,'Asia/Jakarta'));setReason('');setActionError('')}}>{t('purchaseBoard.confirmPayment')}</button>}
                {/* Actions */}
                <div className="flex flex-wrap gap-2 mt-4 border-t pt-4">
                  {['pending','approved','awaiting_receipt'].includes(order.status)&&<button className="text-sm text-primary" onClick={()=>editOrder(order)}>{t('entryFix.edit')}</button>}
                                   {order.status === 'pending' && (
                    <>
                      <button
                        disabled={busyOrders.has(order.id)}
                        onClick={() => handleStatusChange(order.id, 'approved')}
                        className="flex-1 py-2 text-sm text-green-600 border border-green-200 rounded-lg hover:bg-green-50 flex items-center justify-center gap-1"
                      >
                        <CheckCircle size={16} />
                        {t('purchases.approve')}
                      </button>
                      <button
                        disabled={busyOrders.has(order.id)}
                        onClick={() => handleCancel(order.id)}
                        className="flex-1 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 flex items-center justify-center gap-1"
                      >
                        <XCircle size={16} />
                        {t('purchases.cancel')}
                      </button>
                    </>
                  )}
                  {['approved','awaiting_receipt'].includes(order.status) && (<><button disabled={busyOrders.has(order.id)} onClick={()=>handleCancel(order.id)} className="text-red-600 px-3">{t('purchases.cancel')}</button>
                    <button
                      disabled={busyOrders.has(order.id)}
                        onClick={() => handleStatusChange(order.id, 'received')}
                      className="flex-1 py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 flex items-center justify-center gap-1"
                    >
                      <Truck size={16} />
                      {t('inventoryFlow.receiveAll')}
                    </button></>
                  )}
                </div>
              </div>
            )
          })}</section>)
        )}
      </div>

      {/* Create PO Modal */}
      {showModal && (
        <AdminDialog title={t(editing?'entryFix.editPurchase':'entryFix.newPurchase')} onClose={() => { setShowModal(false); resetForm(); }} className="max-w-2xl" busy={Boolean(busyOrders.has('new'))} trackChanges chrome>


            {actionError && <div role="alert" className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg">{actionError}</div>}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('inventoryFlow.supplier')}</label>
                <select
                  value={formData.supplierId}
                  onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                >
                  <option value="">{t('inventoryFlow.noSupplier')}</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('purchases.expectedDateOptional')}</label>
                <LocalizedDateTimeInput
                  type="date"
                  value={formData.expectedDate}
                  onChange={(e) => setFormData({ ...formData, expectedDate: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('purchases.noteOptional')}</label>
                <textarea
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  rows={2}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">{t('purchases.items')}</label>
                  <button
                    onClick={addItem}
                    className="text-sm text-primary hover:text-primary-hover flex items-center gap-1"
                  >
                    <Plus size={16} /> {t('purchases.addItem')}
                  </button>
                </div>

                <div className="space-y-3">{formData.items.map((item,index)=>{const material=inventory.find(i=>i.id===item.inventoryId),unit=item.inputUnit||(material?defaultInventoryInputUnit(material):'');return <section key={index} className="grid grid-cols-2 gap-3 border rounded-xl p-3">
                 <label className="col-span-2 text-sm">{t('entryFix.product')}<select className="input w-full" value={item.inventoryId} onChange={e=>{const next=[...formData.items];next[index]={...item,inventoryId:e.target.value,inputUnit:'',quantity:'1',paidAmount:''};setFormData({...formData,items:next})}}><option value="">{t('purchases.selectItem')}</option>{inventory.map(i=><option key={i.id} value={i.id}>{formatItemName(i,i18n.language)}</option>)}</select></label>
                 <label className="text-sm min-w-0">{t('entryFix.quantity')}<input aria-label={t('entryFix.quantity')} type="number" className="input w-full" min="0.000000001" step="any" value={item.quantity} onChange={e=>updateItem(index,'quantity',e.target.value)}/></label>
                 <label className="text-sm min-w-0">{t('entryFix.unit')}<select aria-label={t('entryFix.unit')} className="input w-full" value={unit} onChange={e=>updateItem(index,'inputUnit',e.target.value)}>{(material?inventoryInputUnits(material):[]).map(u=><option key={u}>{u}</option>)}</select></label>
                 <label className="col-span-2 text-sm">{t('entryFix.paidAmount')} (Rp)<input aria-label={t('entryFix.paidAmount')} type="number" className="input w-full" min="0" step="1" value={item.paidAmount} onChange={e=>updateItem(index,'paidAmount',e.target.value)}/></label>
                 <div className="col-span-2"><PurchasePrices quantity={Number(item.quantity)} paidAmount={item.paidAmount===''?NaN:Number(item.paidAmount)} ledgerQuantity={material?inventoryLedgerQuantity(Number(item.quantity),material,unit):0} unit={unit} ledgerUnit={material?.unit||''}/></div>
                 <button className="text-red-600 text-sm justify-self-start" disabled={formData.items.length===1} onClick={()=>removeItem(index)}>{t('inventoryFlow.remove')}</button>
                </section>})}</div>
              </div>
              <p className="text-sm text-gray-500">{t('entryFix.paymentHint')} {t('entryFix.stockHint')}</p>
              {editing&&<label className="block text-sm">{t('entryFix.reason')}<textarea className="input w-full" value={reason} onChange={e=>setReason(e.target.value)}/></label>}

              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex justify-between items-center">
                  <span className="font-medium">{t('purchases.total')}</span>
                  <span className="text-xl font-bold">{formatCurrency(getTotalAmount())}</span>
                </div>
              </div>

              <div className="admin-dialog-footer flex gap-3 mt-6">
                <button onClick={() => { setShowModal(false); resetForm(); }} className="flex-1 py-3 border border-gray-200 rounded-xl" data-dialog-close="true">
                  {t('common.cancel')}
                </button>
                <button disabled={busyOrders.has('new')} onClick={handleSave} className="flex-1 py-3 bg-primary text-white rounded-xl font-medium">
                  {t(editing?'entryFix.save':'entryFix.newPurchase')}
                </button>
              </div>
            </div>
          </AdminDialog>
      )}
      {confirmingPayment&&<AdminDialog title={t('purchaseBoard.confirmPayment')} onClose={()=>setConfirmingPayment(null)} busy={busyOrders.has(confirmingPayment.id)} className="max-w-md" chrome>
        <p className="text-sm text-gray-600">{t('purchaseBoard.confirmHint')}</p><p className="font-bold text-xl my-3">{formatCurrency(confirmingPayment.totalAmount)}</p>
        <label className="block mt-3">{t('purchaseBoard.paidDate')}<LocalizedDateTimeInput type="date" value={paidDate} onChange={e=>setPaidDate(e.target.value)} className="input w-full"/></label>
        <label className="block mt-3">{t('entryFix.reason')}<textarea className="input w-full" value={reason} onChange={e=>setReason(e.target.value)}/></label>
        {actionError&&<p role="alert" className="text-red-700">{actionError}</p>}
        <button className="btn-primary mt-3" disabled={!reason.trim()||!paidDate||busyOrders.has(confirmingPayment.id)} onClick={()=>runOrderAction(confirmingPayment.id,async()=>{await purchaseOrderApi.confirmPayment(confirmingPayment.id,{expectedVersion:confirmingPayment.updatedAt,paidDate,reason});setConfirmingPayment(null)})}>{t('purchaseBoard.confirmPayment')}</button>
      </AdminDialog>}
      {command&&<AdminDialog title={t(command.action==='reverse'?'entryFix.reverseReceipt':'entryFix.refund')} onClose={()=>setCommand(null)} className="max-w-md" busy={busyOrders.has(command.order.id)} chrome><p className="text-sm text-gray-600">{t(command.action==='reverse'?'entryFix.reverseHint':'entryFix.refundHint')}</p><label className="block mt-3">{t('entryFix.reason')}<textarea className="input w-full" value={reason} onChange={e=>setReason(e.target.value)}/></label>{actionError&&<p role="alert" className="text-red-700">{actionError}</p>}<button className="btn-primary mt-3" disabled={!reason.trim()||busyOrders.has(command.order.id)} onClick={()=>runOrderAction(command.order.id,async()=>{await (command.action==='reverse'?purchaseOrderApi.reverseReceipt:purchaseOrderApi.refund)(command.order.id,reason);setCommand(null)})}>{t('common.confirm')}</button></AdminDialog>}
    </div>
  )
}