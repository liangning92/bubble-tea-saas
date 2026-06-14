import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { staffApi } from '../services/api'
import { Search, Package, ArrowDownCircle, ArrowUpCircle, AlertTriangle, ChevronRight, X } from 'lucide-react'

interface InventoryItem {
  id: string
  name: string
  category: string
  unit: string
  currentStock: number
  avgCost: number
  safetyStock: number
  type: string
}

interface StockLog {
  id: string
  inventoryId: string
  quantity: number
  reason: string
  note?: string
  createdAt: string
  inventory?: { id: string; name: string; unit: string }
}

export function InventoryPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const storeId = user?.storeId || ''

  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [showLowStockOnly, setShowLowStockOnly] = useState(false)

  // Modal states
  const [showStockInModal, setShowStockInModal] = useState(false)
  const [showStockOutModal, setShowStockOutModal] = useState(false)
  const [showLogsModal, setShowLogsModal] = useState(false)
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [stockLogs, setStockLogs] = useState<StockLog[]>([])

  // Form states
  const [stockInQty, setStockInQty] = useState('')
  const [stockInCost, setStockInCost] = useState('')
  const [stockInNote, setStockInNote] = useState('')
  const [stockOutQty, setStockOutQty] = useState('')
  const [stockOutReason, setStockOutReason] = useState('adjust')
  const [stockOutNote, setStockOutNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const categories = [
    t('inventory.categoryTea') || '茶叶',
    t('inventory.categoryMilk') || '奶类',
    t('inventory.categorySugar') || '糖类',
    t('inventory.categoryTopping') || '小料',
    t('inventory.categoryJam') || '果酱',
    t('inventory.categorySyrup') || '糖浆',
    t('inventory.categoryPackaging') || '包装',
    t('inventory.categoryOther') || '其他'
  ]

  useEffect(() => {
    loadInventory()
  }, [storeId])

  const loadInventory = async () => {
    if (!storeId) return
    try {
      setLoading(true)
      const res = await staffApi.getInventoryList({ storeId })
      if (res.code === 200) {
        setInventory(res.data.list || [])
      }
    } catch (error: any) {
      alert(error.message || t('inventory.loadFailed') || 'Failed to load inventory')
    } finally {
      setLoading(false)
    }
  }

  const filteredInventory = inventory.filter(item => {
    const matchesSearch = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = !selectedCategory || item.category === selectedCategory
    const matchesLowStock = !showLowStockOnly || item.currentStock <= item.safetyStock
    return matchesSearch && matchesCategory && matchesLowStock
  })

  const handleStockIn = async () => {
    if (!selectedItem || !stockInQty) {
      alert(t('inventory.enterQuantity') || 'Please enter quantity')
      return
    }
    try {
      setSubmitting(true)
      const res = await staffApi.stockIn({
        inventoryId: selectedItem.id,
        storeId,
        quantity: parseFloat(stockInQty),
        unitCost: stockInCost ? parseFloat(stockInCost) : undefined,
        note: stockInNote || undefined
      })
      if (res.code === 201) {
        alert(t('inventory.stockInSuccess') || 'Stock in successful')
        setShowStockInModal(false)
        resetStockInForm()
        loadInventory()
      } else {
        alert(res.message || t('inventory.stockInFailed') || 'Failed to stock in')
      }
    } catch (error: any) {
      alert(error.message || t('inventory.stockInFailed') || 'Failed to stock in')
    } finally {
      setSubmitting(false)
    }
  }

  const handleStockOut = async () => {
    if (!selectedItem || !stockOutQty) {
      alert(t('inventory.enterQuantity') || 'Please enter quantity')
      return
    }
    try {
      setSubmitting(true)
      const res = await staffApi.stockOut({
        inventoryId: selectedItem.id,
        storeId,
        quantity: parseFloat(stockOutQty),
        reason: stockOutReason,
        note: stockOutNote || undefined
      })
      if (res.code === 200) {
        alert(t('inventory.stockOutSuccess') || 'Stock out successful')
        setShowStockOutModal(false)
        resetStockOutForm()
        loadInventory()
      } else {
        alert(res.message || t('inventory.stockOutFailed') || 'Failed to stock out')
      }
    } catch (error: any) {
      alert(error.message || t('inventory.stockOutFailed') || 'Failed to stock out')
    } finally {
      setSubmitting(false)
    }
  }

  const loadStockLogs = async (item: InventoryItem) => {
    setSelectedItem(item)
    try {
      const res = await staffApi.getStockLogs({ inventoryId: item.id })
      if (res.code === 200 && res.data) {
        setStockLogs(res.data.list || [])
        setShowLogsModal(true)
      }
    } catch (error: any) {
      alert(error.message || t('inventory.loadLogsFailed') || 'Failed to load stock logs')
    }
  }

  const resetStockInForm = () => {
    setStockInQty('')
    setStockInCost('')
    setStockInNote('')
    setSelectedItem(null)
  }

  const resetStockOutForm = () => {
    setStockOutQty('')
    setStockOutReason('adjust')
    setStockOutNote('')
    setSelectedItem(null)
  }

  const openStockIn = (item: InventoryItem) => {
    setSelectedItem(item)
    setShowStockInModal(true)
  }

  const openStockOut = (item: InventoryItem) => {
    setSelectedItem(item)
    setShowStockOutModal(true)
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold">{t('inventory.title') || 'Inventory'}</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setShowLowStockOnly(!showLowStockOnly)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                showLowStockOnly ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
              }`}
            >
              <AlertTriangle className="w-4 h-4 inline mr-1" />
              {t('inventory.lowStock') || 'Low Stock'}
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('inventory.searchPlaceholder') || 'Search inventory...'}
              className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>

        {/* Category Filter */}
        <div className="px-4 pb-3 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setSelectedCategory('')}
            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
              !selectedCategory ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {t('inventory.all') || 'All'}
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                selectedCategory === cat ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Inventory List */}
      <div className="px-4 py-3 space-y-3">
        {loading ? (
          <div className="text-center py-8 text-gray-500">
            <div className="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full mx-auto mb-2"></div>
            {t('common.loading') || 'Loading...'}
          </div>
        ) : filteredInventory.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Package className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p>{t('inventory.noData') || 'No inventory items'}</p>
          </div>
        ) : (
          filteredInventory.map(item => (
            <div key={item.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900">{item.name}</h3>
                    <p className="text-sm text-gray-500 mt-0.5">{item.category} · {item.unit}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-semibold ${item.currentStock <= item.safetyStock ? 'text-orange-600' : 'text-gray-900'}`}>
                      {item.currentStock.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">
                      {t('inventory.safetyStock') || 'Safety'}: {item.safetyStock.toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Low Stock Warning */}
                {item.currentStock <= item.safetyStock && (
                  <div className="mt-2 flex items-center text-orange-600 text-xs">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    {t('inventory.lowStockWarning') || 'Low stock warning'}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="border-t border-gray-100 flex">
                <button
                  onClick={() => openStockIn(item)}
                  className="flex-1 py-3 flex items-center justify-center text-green-600 hover:bg-green-50 active:bg-green-100 transition-colors"
                >
                  <ArrowDownCircle className="w-4 h-4 mr-1.5" />
                  {t('inventory.stockIn') || 'Stock In'}
                </button>
                <button
                  onClick={() => openStockOut(item)}
                  className="flex-1 py-3 flex items-center justify-center text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors border-l border-gray-100"
                >
                  <ArrowUpCircle className="w-4 h-4 mr-1.5" />
                  {t('inventory.stockOut') || 'Stock Out'}
                </button>
                <button
                  onClick={() => loadStockLogs(item)}
                  className="py-3 px-4 flex items-center justify-center text-gray-400 hover:bg-gray-50 active:bg-gray-100 border-l border-gray-100"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Stock In Modal */}
      {showStockInModal && selectedItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-md rounded-t-2xl p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">{t('inventory.stockIn') || 'Stock In'}</h2>
              <button onClick={() => { setShowStockInModal(false); resetStockInForm() }} className="p-2">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="font-medium">{selectedItem.name}</p>
              <p className="text-sm text-gray-500">{selectedItem.category} · {selectedItem.unit}</p>
              <p className="text-sm text-gray-500">
                {t('inventory.currentStock') || 'Current Stock'}: {selectedItem.currentStock.toLocaleString()}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('inventory.quantity') || 'Quantity'} *
                </label>
                <input
                  type="number"
                  value={stockInQty}
                  onChange={(e) => setStockInQty(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="0"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('inventory.unitCost') || 'Unit Cost (IDR)'}
                </label>
                <input
                  type="number"
                  value={stockInCost}
                  onChange={(e) => setStockInCost(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder={selectedItem.avgCost ? selectedItem.avgCost.toString() : '0'}
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('inventory.note') || 'Note'}
                </label>
                <input
                  type="text"
                  value={stockInNote}
                  onChange={(e) => setStockInNote(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder={t('inventory.notePlaceholder') || 'Optional note...'}
                />
              </div>
            </div>

            <button
              onClick={handleStockIn}
              disabled={submitting || !stockInQty}
              className="w-full mt-6 py-3 bg-green-500 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed active:bg-green-600 transition-colors"
            >
              {submitting ? t('common.submitting') || 'Submitting...' : t('inventory.confirmStockIn') || 'Confirm Stock In'}
            </button>
          </div>
        </div>
      )}

      {/* Stock Out Modal */}
      {showStockOutModal && selectedItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-md rounded-t-2xl p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">{t('inventory.stockOut') || 'Stock Out'}</h2>
              <button onClick={() => { setShowStockOutModal(false); resetStockOutForm() }} className="p-2">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="font-medium">{selectedItem.name}</p>
              <p className="text-sm text-gray-500">{selectedItem.category} · {selectedItem.unit}</p>
              <p className="text-sm text-gray-500">
                {t('inventory.currentStock') || 'Current Stock'}: {selectedItem.currentStock.toLocaleString()}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('inventory.quantity') || 'Quantity'} *
                </label>
                <input
                  type="number"
                  value={stockOutQty}
                  onChange={(e) => setStockOutQty(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="0"
                  min="0"
                  max={selectedItem.currentStock}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('inventory.reason') || 'Reason'}
                </label>
                <select
                  value={stockOutReason}
                  onChange={(e) => setStockOutReason(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="adjust">{t('inventory.reasonAdjust') || 'Adjustment'}</option>
                  <option value="process">{t('inventory.reasonProcess') || 'Processing'}</option>
                  <option value="expired">{t('inventory.reasonExpired') || 'Expired'}</option>
                  <option value="damaged">{t('inventory.reasonDamaged') || 'Damaged'}</option>
                  <option value="waste">{t('inventory.reasonWaste') || 'Waste'}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('inventory.note') || 'Note'}
                </label>
                <input
                  type="text"
                  value={stockOutNote}
                  onChange={(e) => setStockOutNote(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder={t('inventory.notePlaceholder') || 'Optional note...'}
                />
              </div>
            </div>

            <button
              onClick={handleStockOut}
              disabled={submitting || !stockOutQty}
              className="w-full mt-6 py-3 bg-red-500 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed active:bg-red-600 transition-colors"
            >
              {submitting ? t('common.submitting') || 'Submitting...' : t('inventory.confirmStockOut') || 'Confirm Stock Out'}
            </button>
          </div>
        </div>
      )}

      {/* Stock Logs Modal */}
      {showLogsModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-md rounded-t-2xl p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">{t('inventory.stockHistory') || 'Stock History'}</h2>
              <button onClick={() => setShowLogsModal(false)} className="p-2">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {selectedItem && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <p className="font-medium">{selectedItem.name}</p>
                <p className="text-sm text-gray-500">{selectedItem.category} · {selectedItem.unit}</p>
              </div>
            )}

            {stockLogs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Package className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>{t('inventory.noLogs') || 'No stock history'}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {stockLogs.map(log => (
                  <div key={log.id} className="p-3 border border-gray-100 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`font-medium ${log.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {log.quantity > 0 ? '+' : ''}{log.quantity} {selectedItem?.unit}
                        </p>
                        <p className="text-xs text-gray-500">{log.reason}</p>
                     </div>
                      <p className="text-xs text-gray-400">
                        {new Date(log.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {log.note && <p className="text-sm text-gray-500 mt-1">{log.note}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}