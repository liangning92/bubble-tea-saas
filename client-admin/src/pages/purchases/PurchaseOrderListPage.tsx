import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { purchaseOrderApi, supplierApi, inventoryApi } from '../../services/api'
import { Plus, X, Package, Truck, CheckCircle, XCircle, Clock } from 'lucide-react'

interface PurchaseOrderItem {
  id: string
  inventoryId: string
  inventory?: { name: string; unit: string }
  quantity: number
  unitCost: number
  receivedQty: number
}

interface PurchaseOrder {
  id: string
  orderNumber: string
  supplierId: string
  supplier?: { name: string }
  status: string
  totalAmount: number
  expectedDate?: string
  receivedDate?: string
  note?: string
  items: PurchaseOrderItem[]
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
}

const STATUS_CONFIG: Record<string, { labelKey: string; color: string; icon: any }> = {
  pending: { labelKey: 'purchases.pending', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  approved: { labelKey: 'purchases.approved', color: 'bg-blue-100 text-blue-700', icon: CheckCircle },
  received: { labelKey: 'purchases.received', color: 'bg-green-100 text-green-700', icon: Package },
  cancelled: { labelKey: 'purchases.cancelled', color: 'bg-gray-100 text-gray-500', icon: XCircle }
}

export function PurchaseOrderListPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()

  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [inventory, setInventory] = useState<Inventory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')

  const [formData, setFormData] = useState({
    supplierId: '',
    expectedDate: '',
    note: '',
    items: [{ inventoryId: '', quantity: 1, unitCost: 0 }]
  })

  useEffect(() => {
    loadData()
  }, [user, filterStatus])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const statusFilter = filterStatus || undefined
      const storeId = user?.storeId as string | undefined
      const [ordersRes, suppliersRes, inventoryRes] = await Promise.all([
        purchaseOrderApi.list({ status: statusFilter as string | undefined }),
        supplierApi.getDropdown(storeId),
        inventoryApi.list({ storeId })
      ])
      setOrders(ordersRes.data?.data?.list || [])
      setSuppliers(suppliersRes.data?.data?.list || [])
      setInventory(inventoryRes.data?.data?.list || [])
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      const validItems = formData.items.filter(item => item.inventoryId && item.quantity > 0 && item.unitCost > 0)
      if (!formData.supplierId || validItems.length === 0) {
        alert(t('purchases.pleaseFillSupplier'))
        return
      }

      await purchaseOrderApi.create({
        storeId: user?.storeId,
        supplierId: formData.supplierId,
        expectedDate: formData.expectedDate || undefined,
        note: formData.note,
        items: validItems
      })

      setShowModal(false)
      resetForm()
      loadData()
    } catch (error) {
      console.error('Failed to create purchase order:', error)
      alert(t('purchases.failedCreate'))
    }
  }

  const resetForm = () => {
    setFormData({
      supplierId: '',
      expectedDate: '',
      note: '',
      items: [{ inventoryId: '', quantity: 1, unitCost: 0 }]
    })
  }

  const handleStatusChange = async (id: string, status: string) => {
    try {
      if (status === 'received') {
        await purchaseOrderApi.receive(id)
      } else {
        await purchaseOrderApi.updateStatus(id, status)
      }
      loadData()
    } catch (error) {
      console.error('Failed to update status:', error)
      alert(t('purchases.failedUpdate'))
    }
  }

  const handleCancel = async (id: string) => {
    if (!confirm(t('purchases.confirmCancel'))) return
    try {
      await purchaseOrderApi.cancel(id, 'Dibatalkan oleh admin')
      loadData()
    } catch (error) {
      console.error('Failed to cancel:', error)
    }
  }

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { inventoryId: '', quantity: 1, unitCost: 0 }]
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
    return formData.items.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center justify-end">
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover text-sm font-medium flex items-center gap-1"
          >
            <Plus size={18} />
            {t('purchases.createPO')}
          </button>
        </div>
      </header>

      {/* Filter */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="p-2 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">{t('purchases.allStatus')}</option>
            <option value="pending">{t('purchases.pending')}</option>
            <option value="approved">{t('purchases.approved')}</option>
            <option value="received">{t('purchases.received')}</option>
            <option value="cancelled">{t('purchases.cancelled')}</option>
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">{t('common.loading')}</div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl">
            <p className="text-gray-500">{t('purchases.noData')}</p>
          </div>
        ) : (
          orders.map((order) => {
            const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending
            const StatusIcon = statusConfig.icon

            return (
              <div key={order.id} className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-bold text-gray-900">{order.orderNumber}</p>
                    <p className="text-sm text-gray-500">{order.supplier?.name || t('purchases.supplier')}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusConfig.color} flex items-center gap-1`}>
                    <StatusIcon size={14} />
                    {t(statusConfig.labelKey)}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4 text-sm mb-3">
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
                    {order.items.slice(0, 3).map((item) => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span>{item.inventory?.name || t('purchases.items')}</span>
                        <span className="text-gray-500">{item.quantity} x {formatCurrency(item.unitCost)}</span>
                      </div>
                    ))}
                    {order.items.length > 3 && (
                      <p className="text-sm text-gray-500">+{order.items.length - 3} {t('purchases.moreItems')}</p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-4 border-t pt-4">
                                   {order.status === 'pending' && (
                    <>
                      <button
                        onClick={() => handleStatusChange(order.id, 'approved')}
                        className="flex-1 py-2 text-sm text-green-600 border border-green-200 rounded-lg hover:bg-green-50 flex items-center justify-center gap-1"
                      >
                        <CheckCircle size={16} />
                        {t('purchases.approve')}
                      </button>
                      <button
                        onClick={() => handleCancel(order.id)}
                        className="flex-1 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 flex items-center justify-center gap-1"
                      >
                        <XCircle size={16} />
                        {t('purchases.cancel')}
                      </button>
                    </>
                  )}
                  {order.status === 'approved' && (
                    <button
                      onClick={() => handleStatusChange(order.id, 'received')}
                      className="flex-1 py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 flex items-center justify-center gap-1"
                    >
                      <Truck size={16} />
                      {t('purchases.markReceived')}
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Create PO Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 pointer-events-none flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl rounded-xl p-6 mx-4 max-h-[90vh] overflow-y-auto pointer-events-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">{t('purchases.createNewPO')}</h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('purchases.suppliers')}</label>
                <select
                  value={formData.supplierId}
                  onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                >
                  <option value="">{t('purchases.selectSupplier')}</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('purchases.expectedDateOptional')}</label>
                <input
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

                <div className="space-y-3">
                  {formData.items.map((item, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-5">
                        <select
                          value={item.inventoryId}
                          onChange={(e) => updateItem(index, 'inventoryId', e.target.value)}
                          className="w-full p-3 border border-gray-200 rounded-xl text-sm"
                        >
                          <option value="">{t('purchases.selectItem')}</option>
                          {inventory.map((inv) => (
                            <option key={inv.id} value={inv.id}>{inv.name} ({inv.unit})</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 0)}
                          className="w-full p-3 border border-gray-200 rounded-xl text-sm"
                          placeholder={t('purchases.qty')}
                          min="1"
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number"
                          value={item.unitCost}
                          onChange={(e) => updateItem(index, 'unitCost', parseInt(e.target.value) || 0)}
                          className="w-full p-3 border border-gray-200 rounded-xl text-sm"
                          placeholder={t('purchases.price')}
                          min="0"
                        />
                      </div>
                      <div className="col-span-1">
                        <button
                          onClick={() => removeItem(index)}
                          className="p-3 text-red-500 hover:bg-red-50 rounded-xl"
                          disabled={formData.items.length === 1}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex justify-between items-center">
                  <span className="font-medium">{t('purchases.total')}</span>
                  <span className="text-xl font-bold">{formatCurrency(getTotalAmount())}</span>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => { setShowModal(false); resetForm(); }} className="flex-1 py-3 border border-gray-200 rounded-xl">
                  {t('common.cancel')}
                </button>
                <button onClick={handleSave} className="flex-1 py-3 bg-primary text-white rounded-xl font-medium">
                  {t('purchases.createPO')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}