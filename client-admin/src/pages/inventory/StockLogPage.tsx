import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { inventoryApi, supplierApi, orderApi } from '../../services/api'
import { formatCurrency, formatDateTime, formatItemName } from '../../utils/helpers'
import * as XLSX from 'xlsx'
import {
  Search,
  Download,
  Plus,
  RefreshCw,
  X,
  AlertTriangle,
  Loader2
} from 'lucide-react'

type LogTab = 'all' | 'in' | 'sold' | 'waste' | 'process' | 'adjust'

export function StockLogPage() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()

  // State
  const [activeTab, setActiveTab] = useState<LogTab>('all')
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [datePreset, setDatePreset] = useState<'all' | 'today' | '7days' | '30days' | 'custom'>('all')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')

  // Modals
  const [showStockInModal, setShowStockInModal] = useState(false)
  const [showWasteModal, setShowWasteModal] = useState(false)

  // Forms
  const [stockInForm, setStockInForm] = useState({
    inventoryId: '',
    quantity: '',
    unitCost: '',
    supplierId: '',
    note: ''
  })

  const [wasteForm, setWasteForm] = useState({
    inventoryId: '',
    quantity: '',
    reason: 'loss',
    wasteType: 'spill',
    note: ''
  })

  // Date range calculation
  const dateRange = useMemo(() => {
    const today = new Date()
    const formatDateYMD = (d: Date) => d.toISOString().split('T')[0]

    if (datePreset === 'today') {
      const todayStr = formatDateYMD(today)
      return { startDate: todayStr, endDate: todayStr }
    } else if (datePreset === '7days') {
      const past = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000)
      return { startDate: formatDateYMD(past), endDate: formatDateYMD(today) }
    } else if (datePreset === '30days') {
      const past = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000)
      return { startDate: formatDateYMD(past), endDate: formatDateYMD(today) }
    } else if (datePreset === 'custom') {
      return {
        startDate: customStartDate || undefined,
        endDate: customEndDate || undefined
      }
    }
    return { startDate: undefined, endDate: undefined }
  }, [datePreset, customStartDate, customEndDate])

  // Fetch inventory items for dropdowns and display
  const { data: inventoryData } = useQuery({
    queryKey: ['inventory-all-items'],
    queryFn: () => inventoryApi.list({ pageSize: 500 }),
    staleTime: 60000
  })
  const inventoryItems: any[] = inventoryData?.data?.data?.list || []

  // Fetch suppliers for dropdown
  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers-dropdown'],
    queryFn: () => supplierApi.list(),
    staleTime: 60000
  })
  const suppliers: any[] = suppliersData?.data?.data?.list || suppliersData?.data?.list || []

  // Fetch recent orders to map orderId to readable orderNumber
  const { data: ordersData } = useQuery({
    queryKey: ['orders-lookup-for-logs'],
    queryFn: () => orderApi.list({ pageSize: 200 }),
    staleTime: 60000
  })
  const orders: any[] = ordersData?.data?.data?.list || ordersData?.data?.list || []
  const orderMap = useMemo(() => {
    const map = new Map<string, { orderNumber: string; pickupNumber?: string }>()
    orders.forEach((o: any) => {
      if (o.id) {
        map.set(o.id, {
          orderNumber: o.orderNumber || o.id,
          pickupNumber: o.pickupNumber
        })
      }
    })
    return map
  }, [orders])

  // Fetch logs
  const { data: logsData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['inventory-logs-comprehensive', dateRange],
    queryFn: () => inventoryApi.logs({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      limit: 1000
    }),
    refetchInterval: 30000
  })

  const rawLogs: any[] = logsData?.data?.data?.list || logsData?.data?.list || []

  // Client-side filtering for rapid response
  const filteredLogs = useMemo(() => {
    return rawLogs.filter((log: any) => {
      // 1. Tab filter
      if (activeTab === 'in') {
        if (log.type !== 'stock_in') return false
      } else if (activeTab === 'sold') {
        if (log.type !== 'stock_out' || log.reason !== 'sold') return false
      } else if (activeTab === 'waste') {
        if (log.type !== 'stock_out' || (log.reason !== 'loss' && log.reason !== 'expired')) return false
      } else if (activeTab === 'process') {
        const isProcessOut = log.type === 'stock_out' && log.reason === 'process'
        const isProcessIn = log.type === 'stock_in' && (log.note?.includes('加工') || log.note?.includes('Process') || log.note?.includes('Olahan'))
        if (!isProcessOut && !isProcessIn) return false
      } else if (activeTab === 'adjust') {
        const isAdjust = log.reason === 'adjust' || log.note?.toLowerCase().includes('adjustment') || log.type === 'adjustment'
        if (!isAdjust) return false
      }

      // 2. Category filter
      if (selectedCategory && log.inventory?.category !== selectedCategory) {
        return false
      }

      // 3. Search query
      if (search.trim()) {
        const q = search.toLowerCase()
        const name = (log.inventory?.name || '').toLowerCase()
        const note = (log.note || '').toLowerCase()
        const orderId = (log.orderId || '').toLowerCase()
        const orderInfo = log.orderId ? orderMap.get(log.orderId) : null
        const resolvedOrderNo = orderInfo ? `${orderInfo.orderNumber} ${orderInfo.pickupNumber || ''}`.toLowerCase() : ''
        const supplierName = (log.supplier?.name || '').toLowerCase()
        if (!name.includes(q) && !note.includes(q) && !orderId.includes(q) && !resolvedOrderNo.includes(q) && !supplierName.includes(q)) {
          return false
        }
      }

      return true
    })
  }, [rawLogs, activeTab, selectedCategory, search, orderMap])

  // Top KPI Metrics calculation based on loaded logs
  const metrics = useMemo(() => {
    let totalInboundCost = 0
    let totalSalesCost = 0
    let totalWasteCost = 0

    rawLogs.forEach((log: any) => {
      const avgCost = Number(log.inventory?.avgCost || 0)
      if (log.type === 'stock_in') {
        const amt = Number(log.totalAmount || (log.quantity * (log.unitCost || avgCost)))
        totalInboundCost += amt
      } else if (log.type === 'stock_out') {
        const itemCost = Math.round(Number(log.quantity || 0) * avgCost)
        if (log.reason === 'sold') {
          totalSalesCost += itemCost
        } else if (log.reason === 'loss' || log.reason === 'expired') {
          totalWasteCost += itemCost
        }
      }
    })

    return {
      totalInboundCost,
      totalSalesCost,
      totalWasteCost,
      totalCount: rawLogs.length
    }
  }, [rawLogs])

  // Mutations
  const stockInMutation = useMutation({
    mutationFn: (data: any) => inventoryApi.stockIn(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-logs-comprehensive'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-all-items'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      setShowStockInModal(false)
      setStockInForm({ inventoryId: '', quantity: '', unitCost: '', supplierId: '', note: '' })
    }
  })

  const wasteMutation = useMutation({
    mutationFn: (data: any) => inventoryApi.stockOut(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-logs-comprehensive'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-all-items'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      setShowWasteModal(false)
      setWasteForm({ inventoryId: '', quantity: '', reason: 'loss', wasteType: 'spill', note: '' })
    }
  })

  // Selected item helpers for modals
  const selectedStockInItem = useMemo(() => {
    return inventoryItems.find((i: any) => i.id === stockInForm.inventoryId)
  }, [inventoryItems, stockInForm.inventoryId])

  const selectedWasteItem = useMemo(() => {
    return inventoryItems.find((i: any) => i.id === wasteForm.inventoryId)
  }, [inventoryItems, wasteForm.inventoryId])

  // Handle stock in item change
  const handleStockInItemSelect = (invId: string) => {
    const item = inventoryItems.find((i: any) => i.id === invId)
    setStockInForm(prev => ({
      ...prev,
      inventoryId: invId,
      unitCost: item ? String(item.avgCost || '') : prev.unitCost
    }))
  }

  // Handle stock out / waste submit
  const handleWasteSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!wasteForm.inventoryId || !wasteForm.quantity) return

    const qty = parseFloat(wasteForm.quantity)
    if (isNaN(qty) || qty <= 0) return

    const wasteLabelMap: Record<string, string> = {
      manual: t('inventory.reasonAdjust'),
      spill: t('inventory.lossSpill'),
      spoiled: t('inventory.lossSpoiled'),
      expired: t('inventory.lossExpired'),
      mistake: t('inventory.lossMistake'),
      tasting: t('inventory.lossTasting'),
      other: t('inventory.lossOther')
    }

    const fullNote = `[${wasteLabelMap[wasteForm.wasteType] || ''}] ${wasteForm.note || ''}`.trim()

    wasteMutation.mutate({
      inventoryId: wasteForm.inventoryId,
      quantity: qty,
      reason: wasteForm.wasteType === 'expired' ? 'expired' : wasteForm.wasteType === 'manual' ? 'adjust' : 'loss',
      note: fullNote
    })
  }

  // Handle stock in submit
  const handleStockInSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!stockInForm.inventoryId || !stockInForm.quantity) return

    const qty = parseFloat(stockInForm.quantity)
    const cost = stockInForm.unitCost ? parseFloat(stockInForm.unitCost) : 0
    if (isNaN(qty) || qty <= 0) return

    stockInMutation.mutate({
      inventoryId: stockInForm.inventoryId,
      quantity: qty,
      unitCost: cost,
      supplierId: stockInForm.supplierId || undefined,
      note: stockInForm.note ? `[${t('inventory.reasonPurchase')}] ${stockInForm.note}` : t('inventory.reasonPurchase')
    })
  }

  // Helper to format order number cleanly
  const renderDocNumber = (log: any) => {
    if (log.orderId) {
      const orderInfo = orderMap.get(log.orderId)
      if (orderInfo) {
        return (
          <div className="flex items-center gap-1.5 font-mono text-sm">
            {orderInfo.pickupNumber && (
              <span className="px-1.5 py-0.5 text-xs font-bold rounded bg-primary/10 text-primary border border-primary/20">
                #{orderInfo.pickupNumber}
              </span>
            )}
            <span className="text-gray-700">{orderInfo.orderNumber}</span>
          </div>
        )
      }
      return <span className="font-mono text-sm">{log.orderId.slice(-8).toUpperCase()}</span>
    }
    if (log.batchId) {
      return <span className="font-mono text-sm">{log.batchId}</span>
    }
    return <span className="text-gray-400">-</span>
  }

  // Export to Excel
  const handleExportExcel = () => {
    if (filteredLogs.length === 0) return

    const rows = filteredLogs.map((log: any) => {
      const isStockIn = log.type === 'stock_in'
      const avgCost = Number(log.inventory?.avgCost || 0)
      const costValue = isStockIn
        ? (log.totalAmount || Math.round(Number(log.quantity) * Number(log.unitCost || avgCost)))
        : Math.round(Number(log.quantity) * avgCost)

      let reasonText = ''
      if (isStockIn) {
        if (log.note?.includes('加工') || log.note?.includes('Process') || log.note?.includes('Olahan')) {
          reasonText = t('inventory.reasonProcessIn')
        } else if (log.note?.includes('期初') || log.note?.includes('Initial') || log.note?.includes('Awal')) {
          reasonText = t('inventory.reasonInitial')
        } else {
          reasonText = t('inventory.reasonPurchase')
        }
      } else {
        if (log.reason === 'sold') reasonText = t('inventory.reasonSold')
        else if (log.reason === 'process') reasonText = t('inventory.reasonProcess')
        else if (log.reason === 'expired') reasonText = t('inventory.reasonExpired')
        else if (log.reason === 'loss') reasonText = t('inventory.reasonLoss')
        else if (log.reason === 'adjust') reasonText = t('inventory.reasonAdjust')
        else reasonText = log.reason || '-'
      }

      const orderInfo = log.orderId ? orderMap.get(log.orderId) : null
      const docNumber = orderInfo
        ? (orderInfo.pickupNumber ? `[#${orderInfo.pickupNumber}] ${orderInfo.orderNumber}` : orderInfo.orderNumber)
        : (log.orderId || log.batchId || '-')

      return {
        [t('inventory.date')]: formatDateTime(log.createdAt),
        [t('inventory.docNumber')]: docNumber,
        [t('inventory.itemName')]: formatItemName(log.inventory?.name || '-', i18n.language),
        [t('inventory.category')]: getCategoryText(log.inventory?.category),
        [t('inventory.type')]: isStockIn ? t('inventory.stockIn') : t('inventory.stockOut'),
        [t('inventory.wasteReason')]: reasonText,
        [t('inventory.changeAmount')]: `${isStockIn ? '+' : '-'}${log.quantity}`,
        [t('inventory.unit')]: log.inventory?.unit || '-',
        [t('inventory.unitCost')]: log.unitCost || avgCost,
        [t('inventory.totalCostValue')]: costValue,
        [t('inventory.operatorOrSupplier')]: log.supplier?.name || log.staffId || '-',
        [t('inventory.notes')]: log.note || '-'
      }
    })

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'StockLedger')
    const fileName = `Stock_Ledger_${new Date().toISOString().slice(0, 10)}.xlsx`
    XLSX.writeFile(workbook, fileName)
  }

  // Localized Category Text
  const getCategoryText = (category: string) => {
    switch (category) {
      case 'raw_material':
      case 'Raw Material':
        return t('inventory.rawMaterial')
      case 'packaging':
      case 'Packaging':
        return t('inventory.packaging')
      case 'semi_finished':
      case 'Semi-Finished':
        return t('inventory.semiFinished')
      default:
        return category || '-'
    }
  }

  // Standard category badge following design specs
  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'raw_material':
      case 'Raw Material':
        return <span className="badge badge-info">{t('inventory.rawMaterial')}</span>
      case 'packaging':
      case 'Packaging':
        return <span className="badge badge-warning">{t('inventory.packaging')}</span>
      case 'semi_finished':
      case 'Semi-Finished':
        return <span className="badge badge-success">{t('inventory.semiFinished')}</span>
      default:
        return <span className="badge">{category || '-'}</span>
    }
  }

  // Standard reason badge following design specs
  const getReasonBadge = (log: any) => {
    if (log.type === 'stock_in') {
      if (log.note?.includes('加工') || log.note?.includes('Process') || log.note?.includes('Olahan')) {
        return <span className="badge badge-success">{t('inventory.reasonProcessIn')}</span>
      }
      if (log.note?.includes('期初') || log.note?.includes('Initial') || log.note?.includes('Awal')) {
        return <span className="badge badge-info">{t('inventory.reasonInitial')}</span>
      }
      return <span className="badge badge-success">{t('inventory.reasonPurchase')}</span>
    }

    if (log.reason === 'sold') {
      return <span className="badge badge-info">{t('inventory.reasonSold')}</span>
    }
    if (log.reason === 'process') {
      return <span className="badge badge-warning">{t('inventory.reasonProcess')}</span>
    }
    if (log.reason === 'loss') {
      return <span className="badge badge-error">{t('inventory.reasonLoss')}</span>
    }
    if (log.reason === 'expired') {
      return <span className="badge badge-error">{t('inventory.reasonExpired')}</span>
    }
    if (log.reason === 'adjust') {
      return <span className="badge">{t('inventory.reasonAdjust')}</span>
    }
    return <span className="badge">{log.reason || '-'}</span>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('inventory.stockLog')}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn btn-outline btn-sm flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-primary' : ''}`} />
            <span>{t('common.refresh')}</span>
          </button>

          <button
            onClick={handleExportExcel}
            disabled={filteredLogs.length === 0}
            className="btn btn-outline btn-sm flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span>{t('inventory.exportExcel')}</span>
          </button>

          <button
            onClick={() => setShowWasteModal(true)}
            className="btn btn-secondary btn-sm flex items-center gap-1.5 text-error"
          >
            <AlertTriangle className="w-4 h-4" />
            <span>{t('inventory.quickStockOut')}</span>
          </button>

          <button
            onClick={() => setShowStockInModal(true)}
            className="btn btn-primary btn-sm flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>{t('inventory.quickStockIn')}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-sm text-gray-500 font-medium">{t('inventory.totalInboundCost')}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(metrics.totalInboundCost)}</p>
        </div>

        <div className="card p-4">
          <p className="text-sm text-gray-500 font-medium">{t('inventory.totalSalesCost')}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(metrics.totalSalesCost)}</p>
        </div>

        <div className="card p-4">
          <p className="text-sm text-gray-500 font-medium">{t('inventory.totalWasteCost')}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(metrics.totalWasteCost)}</p>
        </div>

        <div className="card p-4">
          <p className="text-sm text-gray-500 font-medium">{t('inventory.totalMovements')}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{metrics.totalCount}</p>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex gap-1 bg-white p-1 rounded-lg shadow-sm inline-flex overflow-x-auto max-w-full">
        {[
          { key: 'all', label: t('inventory.allLogs') },
          { key: 'in', label: t('inventory.inboundLogs') },
          { key: 'sold', label: t('inventory.salesLogs') },
          { key: 'waste', label: t('inventory.wasteLogs') },
          { key: 'process', label: t('inventory.processLogs') },
          { key: 'adjust', label: t('inventory.adjustLogs') }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as LogTab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.key ? 'bg-primary text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        {/* Preset Date Selector */}
        <div className="flex gap-1 bg-white p-1 rounded-lg shadow-sm inline-flex">
          {[
            { key: 'all', label: t('common.all') },
            { key: 'today', label: t('inventory.today') },
            { key: '7days', label: t('inventory.last7Days') },
            { key: '30days', label: t('inventory.last30Days') },
            { key: 'custom', label: t('inventory.customRange') }
          ].map(preset => (
            <button
              key={preset.key}
              onClick={() => setDatePreset(preset.key as any)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                datePreset === preset.key ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {datePreset === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="input w-36"
            />
            <span className="text-gray-400 text-sm">{t('inventory.to')}</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="input w-36"
            />
          </div>
        )}

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="input w-44"
        >
          <option value="">{t('inventory.allCategories')}</option>
          <option value="raw_material">{t('inventory.rawMaterial')}</option>
          <option value="packaging">{t('inventory.packaging')}</option>
          <option value="semi_finished">{t('inventory.semiFinished')}</option>
        </select>

        <div className="relative flex-1 max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('inventory.searchPlaceholder')}
            className="input pl-10 w-full"
          />
        </div>
      </div>

      {/* Table Card */}
      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {t('common.noData')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3 font-medium whitespace-nowrap pr-4">{t('inventory.date')}</th>
                  <th className="pb-3 font-medium whitespace-nowrap px-4">{t('inventory.docNumber')}</th>
                  <th className="pb-3 font-medium min-w-[240px] px-4">{t('inventory.itemName')}</th>
                  <th className="pb-3 font-medium whitespace-nowrap px-4">{t('inventory.category')}</th>
                  <th className="pb-3 font-medium whitespace-nowrap px-4">{t('inventory.type')}</th>
                  <th className="pb-3 font-medium whitespace-nowrap text-right px-4">{t('inventory.changeAmount')}</th>
                  <th className="pb-3 font-medium whitespace-nowrap text-right px-4">{t('inventory.unitCost')}</th>
                  <th className="pb-3 font-medium whitespace-nowrap text-right px-4">{t('inventory.totalCostValue')}</th>
                  <th className="pb-3 font-medium whitespace-nowrap px-4">{t('inventory.operatorOrSupplier')}</th>
                  <th className="pb-3 font-medium min-w-[160px] pl-4">{t('inventory.notes')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log: any) => {
                  const isStockIn = log.type === 'stock_in'
                  const avgCost = Number(log.inventory?.avgCost || 0)
                  const unitCost = log.unitCost !== undefined && log.unitCost !== null && log.unitCost > 0
                    ? Number(log.unitCost)
                    : avgCost
                  const costValue = isStockIn
                    ? (log.totalAmount || Math.round(Number(log.quantity) * unitCost))
                    : Math.round(Number(log.quantity) * avgCost)

                  return (
                    <tr key={log.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="py-3 text-sm text-gray-500 whitespace-nowrap pr-4">
                        {formatDateTime(log.createdAt)}
                      </td>
                      <td className="py-3 text-sm px-4 whitespace-nowrap">
                        {renderDocNumber(log)}
                      </td>
                      <td className="py-3 text-sm font-medium text-gray-900 px-4">
                        {formatItemName(log.inventory?.name || '-', i18n.language)}
                      </td>
                      <td className="py-3 text-sm px-4 whitespace-nowrap">
                        {getCategoryBadge(log.inventory?.category)}
                      </td>
                      <td className="py-3 text-sm px-4 whitespace-nowrap">
                        {getReasonBadge(log)}
                      </td>
                      <td className="py-3 text-sm text-right px-4 whitespace-nowrap font-medium">
                        <span className={isStockIn ? 'text-green-600' : 'text-red-600'}>
                          {isStockIn ? '+' : '-'}{log.quantity.toLocaleString()} {log.inventory?.unit || ''}
                        </span>
                      </td>
                      <td className="py-3 text-sm text-right text-gray-600 px-4 whitespace-nowrap">
                        {unitCost ? `${formatCurrency(unitCost)}/${log.inventory?.unit || ''}` : '-'}
                      </td>
                      <td className="py-3 text-sm text-right font-medium px-4 whitespace-nowrap">
                        {costValue ? formatCurrency(costValue) : '-'}
                      </td>
                      <td className="py-3 text-sm text-gray-600 px-4 whitespace-nowrap">
                        {log.supplier?.name || log.staffId || '-'}
                      </td>
                      <td className="py-3 text-sm text-gray-500 pl-4 max-w-xs truncate" title={log.note || ''}>
                        {log.note || '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Quick Stock In */}
      {showStockInModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">
                {t('inventory.quickStockIn')}
              </h3>
              <button
                type="button"
                onClick={() => setShowStockInModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleStockInSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('inventory.selectItem')} *
                </label>
                <select
                  required
                  value={stockInForm.inventoryId}
                  onChange={(e) => handleStockInItemSelect(e.target.value)}
                  className="input w-full"
                >
                  <option value="">-- {t('inventory.selectItem')} --</option>
                  {inventoryItems.map((item: any) => (
                    <option key={item.id} value={item.id}>
                      [{getCategoryText(item.category)}] {formatItemName(item.name, i18n.language)} ({t('inventory.currentStock')}: {item.currentStock} {item.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('inventory.inboundQty')} *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      required
                      min="0.001"
                      value={stockInForm.quantity}
                      onChange={(e) => setStockInForm({ ...stockInForm, quantity: e.target.value })}
                      className="input w-full pr-10"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                      {selectedStockInItem?.unit || ''}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('inventory.inboundPrice')}
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={stockInForm.unitCost}
                    onChange={(e) => setStockInForm({ ...stockInForm, unitCost: e.target.value })}
                    className="input w-full"
                  />
                </div>
              </div>

              {stockInForm.quantity && (
                <div className="bg-gray-50 p-3 rounded-lg flex justify-between items-center text-sm">
                  <span className="text-gray-600">{t('inventory.totalCostValue')}:</span>
                  <span className="font-bold text-gray-900">
                    {formatCurrency(
                      (parseFloat(stockInForm.quantity) || 0) * (parseFloat(stockInForm.unitCost) || 0)
                    )}
                  </span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('inventory.supplier')}
                </label>
                <select
                  value={stockInForm.supplierId}
                  onChange={(e) => setStockInForm({ ...stockInForm, supplierId: e.target.value })}
                  className="input w-full"
                >
                  <option value="">-- {t('inventory.supplier')} --</option>
                  {suppliers.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('inventory.notes')}
                </label>
                <textarea
                  rows={2}
                  value={stockInForm.note}
                  onChange={(e) => setStockInForm({ ...stockInForm, note: e.target.value })}
                  className="input w-full"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowStockInModal(false)}
                  className="btn btn-secondary"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={stockInMutation.isPending}
                  className="btn btn-primary"
                >
                  {stockInMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
                  <span>{t('common.confirm')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Waste & Loss */}
      {showWasteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">
                {t('inventory.quickStockOut')}
              </h3>
              <button
                type="button"
                onClick={() => setShowWasteModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleWasteSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('inventory.selectItem')} *
                </label>
                <select
                  required
                  value={wasteForm.inventoryId}
                  onChange={(e) => setWasteForm({ ...wasteForm, inventoryId: e.target.value })}
                  className="input w-full"
                >
                  <option value="">-- {t('inventory.selectItem')} --</option>
                  {inventoryItems.map((item: any) => (
                    <option key={item.id} value={item.id}>
                      [{getCategoryText(item.category)}] {formatItemName(item.name, i18n.language)} ({t('inventory.currentStock')}: {item.currentStock} {item.unit})
                    </option>
                  ))}
                </select>
                {selectedWasteItem && (
                  <div className="text-xs text-gray-500 mt-1 flex justify-between">
                    <span>{t('inventory.availableStock')}: <strong>{selectedWasteItem.currentStock} {selectedWasteItem.unit}</strong></span>
                    <span>{t('inventory.unitCost')}: <strong>{formatCurrency(selectedWasteItem.avgCost || 0)}</strong></span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('inventory.wasteQty')} *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      required
                      min="0.001"
                      max={selectedWasteItem ? selectedWasteItem.currentStock : undefined}
                      value={wasteForm.quantity}
                      onChange={(e) => setWasteForm({ ...wasteForm, quantity: e.target.value })}
                      className="input w-full pr-10"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                      {selectedWasteItem?.unit || ''}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('inventory.wasteReason')} *
                  </label>
                  <select
                    value={wasteForm.wasteType}
                    onChange={(e) => setWasteForm({ ...wasteForm, wasteType: e.target.value })}
                    className="input w-full"
                  >
                    <option value="manual">{t('inventory.reasonAdjust')}</option>
                    <option value="spill">{t('inventory.lossSpill')}</option>
                    <option value="spoiled">{t('inventory.lossSpoiled')}</option>
                    <option value="expired">{t('inventory.lossExpired')}</option>
                    <option value="mistake">{t('inventory.lossMistake')}</option>
                    <option value="tasting">{t('inventory.lossTasting')}</option>
                    <option value="other">{t('inventory.lossOther')}</option>
                  </select>
                </div>
              </div>

              {wasteForm.quantity && selectedWasteItem && (
                <div className="bg-gray-50 p-3 rounded-lg flex justify-between items-center text-sm">
                  <span className="text-gray-600">{t('inventory.estimatedCostLoss')}:</span>
                  <span className="font-bold text-error">
                    {formatCurrency(
                      (parseFloat(wasteForm.quantity) || 0) * (Number(selectedWasteItem.avgCost) || 0)
                    )}
                  </span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('inventory.notes')}
                </label>
                <textarea
                  rows={2}
                  value={wasteForm.note}
                  onChange={(e) => setWasteForm({ ...wasteForm, note: e.target.value })}
                  className="input w-full"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWasteModal(false)}
                  className="btn btn-secondary"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={wasteMutation.isPending}
                  className="btn btn-primary"
                >
                  {wasteMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
                  <span>{t('common.confirm')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
